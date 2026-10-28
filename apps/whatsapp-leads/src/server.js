import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, buildConfig } from './config.js';
import { Store, LEAD_STATUSES } from './store.js';
import { WhatsAppClient, verifySignature } from './whatsapp.js';
import { LeadService, HttpError, windowOpen } from './service.js';
import { parseCsv, csvRowToLead } from './csv.js';
import { ProspectService, PROSPECT_STATUSES, DEFAULT_CATEGORIES } from './prospects.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const MAX_BODY = 2 * 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new HttpError(413, 'Corpo da requisição muito grande')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseJson(raw) {
  if (!raw.length) return {};
  try { return JSON.parse(raw.toString('utf8')); } catch { throw new HttpError(400, 'JSON inválido'); }
}

function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': typeof data === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', ...headers });
  res.end(body);
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function authorized(req, config) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return false;
  const [user, ...rest] = Buffer.from(h.slice(6), 'base64').toString('utf8').split(':');
  return safeEqual(user, config.adminUser) && safeEqual(rest.join(':'), config.adminPassword);
}

const toTags = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,;]/)).map((t) => String(t).trim()).filter(Boolean);

function leadInput(body) {
  return {
    name: String(body.name || body.nome || '').trim(),
    phone: body.phone || body.telefone || body.whatsapp,
    email: String(body.email || '').trim(),
    source: String(body.source || body.origem || '').trim() || undefined,
    tags: toTags(body.tags),
    notes: String(body.notes || body.mensagem || body.message || '').trim(),
    optIn: body.optIn === true || ['true', 'on', 'sim', '1', 'yes'].includes(String(body.optIn ?? body.optin ?? body.consentimento).toLowerCase()),
    status: body.status,
  };
}

export function createApp({ config, store, whatsapp, log = console, fetchImpl = globalThis.fetch }) {
  const service = new LeadService({ store, whatsapp, config, log });
  const prospects = new ProspectService({ store, config, fetchImpl });
  const clients = new Set();

  store.on('change', (event) => {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of clients) res.write(data);
  });

  const leadView = (lead) => lead && { ...lead, windowOpen: windowOpen(lead) };

  async function route(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;
    const method = req.method;

    // ---------- Webhook da Meta (sem login do painel) ----------
    if (pathname === '/webhook') {
      if (method === 'GET') {
        const ok = url.searchParams.get('hub.mode') === 'subscribe' &&
          config.whatsapp.verifyToken && url.searchParams.get('hub.verify_token') === config.whatsapp.verifyToken;
        return ok ? send(res, 200, url.searchParams.get('hub.challenge') || '') : send(res, 403, 'Token de verificação inválido');
      }
      if (method === 'POST') {
        const raw = await readBody(req);
        if (!verifySignature(raw, req.headers['x-hub-signature-256'], config.whatsapp.appSecret)) {
          return send(res, 401, 'Assinatura inválida');
        }
        // Responde rápido; a Meta reenvia se demorar.
        send(res, 200, 'OK');
        await service.handleWebhook(parseJson(raw)).catch((e) => log.error('Erro processando webhook:', e));
        return;
      }
    }

    // ---------- Captura de leads de formulários (token próprio, CORS liberado) ----------
    if (pathname === '/api/intake') {
      const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Intake-Token', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
      if (method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
      if (method !== 'POST') return send(res, 405, { error: 'Use POST' }, cors);
      const token = req.headers['x-intake-token'] || url.searchParams.get('token');
      if (!config.intakeToken || !token || !safeEqual(token, config.intakeToken)) return send(res, 401, { error: 'Token inválido' }, cors);
      const raw = await readBody(req);
      const body = String(req.headers['content-type'] || '').includes('application/x-www-form-urlencoded')
        ? Object.fromEntries(new URLSearchParams(raw.toString('utf8')))
        : parseJson(raw);
      const input = leadInput(body);
      input.source ||= 'site';
      const { lead, created } = service.createLead(input);
      return send(res, created ? 201 : 200, { ok: true, id: lead.id, created }, cors);
    }

    if (pathname === '/health') return send(res, 200, { ok: true });

    // ---------- Daqui para baixo: painel protegido ----------
    if (!authorized(req, config)) {
      return send(res, 401, 'Autenticação necessária', { 'WWW-Authenticate': 'Basic realm="WhatsApp Leads", charset="UTF-8"' });
    }

    if (pathname === '/api/events' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write('retry: 3000\n\n');
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => { clearInterval(ping); clients.delete(res); });
      return;
    }

    if (pathname === '/api/config' && method === 'GET') {
      return send(res, 200, {
        dryRun: whatsapp.dryRun,
        statuses: LEAD_STATUSES,
        welcome: config.welcome,
        followup: config.followup,
        intakeEnabled: Boolean(config.intakeToken),
        webhookSecured: Boolean(config.whatsapp.appSecret),
        timezone: config.timezone,
      });
    }

    if (pathname === '/api/stats' && method === 'GET') return send(res, 200, store.stats());

    if (pathname === '/api/leads' && method === 'GET') {
      const leads = store.listLeads({ q: url.searchParams.get('q'), status: url.searchParams.get('status') || undefined });
      return send(res, 200, leads.map(leadView));
    }

    if (pathname === '/api/leads' && method === 'POST') {
      const { lead, created } = service.createLead(leadInput(parseJson(await readBody(req))));
      if (!created) throw new HttpError(409, 'Já existe um lead com este telefone');
      return send(res, 201, leadView(lead));
    }

    if (pathname === '/api/leads/import' && method === 'POST') {
      const rows = parseCsv((await readBody(req)).toString('utf8'));
      const report = { created: 0, updated: 0, errors: [] };
      rows.forEach((row, i) => {
        try {
          const { created } = service.createLead(leadInput(csvRowToLead(row)), { autoWelcome: false });
          created ? report.created++ : report.updated++;
        } catch (e) {
          report.errors.push(`Linha ${i + 2}: ${e.message}`);
        }
      });
      return send(res, 200, report);
    }

    if (pathname === '/api/broadcast' && method === 'POST') {
      const body = parseJson(await readBody(req));
      if (!Array.isArray(body.leadIds) || !body.leadIds.length) throw new HttpError(400, 'Selecione ao menos um lead');
      const results = await service.broadcast(body.leadIds, {
        template: String(body.template || '').trim(),
        language: body.language || 'pt_BR',
        params: Array.isArray(body.params) ? body.params : [],
      });
      return send(res, 200, { sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok) });
    }

    // ---------- Prospecção ----------
    if (pathname === '/api/prospecting' && method === 'GET') {
      const st = prospects.settings;
      return send(res, 200, {
        city: st.city, message: st.message, senderName: st.senderName, portfolioUrl: st.portfolioUrl,
        dailyLimit: st.dailyLimit, sentToday: prospects.sentToday(), source: st.googleApiKey ? 'google' : 'osm',
        categories: DEFAULT_CATEGORIES, statuses: PROSPECT_STATUSES,
      });
    }
    if (pathname === '/api/prospecting/message' && method === 'PUT') {
      const { message } = parseJson(await readBody(req));
      if (!message || !String(message).trim()) throw new HttpError(400, 'Mensagem vazia');
      prospects.setMessage(String(message));
      return send(res, 200, { ok: true });
    }
    if (pathname === '/api/prospects/search' && method === 'POST') {
      const body = parseJson(await readBody(req));
      const report = await prospects.search({
        city: body.city ? String(body.city).trim() : undefined,
        categories: Array.isArray(body.categories) ? body.categories.map(String) : undefined,
        onlyWithoutWebsite: body.onlyWithoutWebsite !== false,
        onlyMobile: body.onlyMobile !== false,
      });
      return send(res, 200, report);
    }
    if (pathname === '/api/prospects' && method === 'GET') {
      const list = store.listProspects({ q: url.searchParams.get('q'), status: url.searchParams.get('status') || undefined });
      return send(res, 200, list.map((p) => prospects.view(p)));
    }
    const pm = pathname.match(/^\/api\/prospects\/([\w-]+)(\/contacted|\/convert)?$/);
    if (pm) {
      const prospect = store.getProspect(pm[1]);
      if (!prospect) throw new HttpError(404, 'Empresa não encontrada');
      if (pm[2] === '/contacted' && method === 'POST') return send(res, 200, prospects.view(prospects.markContacted(prospect)));
      if (pm[2] === '/convert' && method === 'POST') return send(res, 201, leadView(prospects.convert(prospect)));
      if (!pm[2] && method === 'DELETE') { store.deleteProspect(prospect.id); return send(res, 204, ''); }
      if (!pm[2] && method === 'PATCH') {
        const body = parseJson(await readBody(req));
        const patch = {};
        if (body.status !== undefined) {
          if (!PROSPECT_STATUSES.includes(body.status)) throw new HttpError(400, 'Status inválido');
          patch.status = body.status;
        }
        if (typeof body.notes === 'string') patch.notes = body.notes;
        return send(res, 200, prospects.view(store.updateProspect(prospect.id, patch)));
      }
    }

    const m = pathname.match(/^\/api\/leads\/([\w-]+)(\/messages|\/read)?$/);
    if (m) {
      const lead = store.getLead(m[1]);
      if (!lead) throw new HttpError(404, 'Lead não encontrado');

      if (!m[2] && method === 'GET') return send(res, 200, { lead: leadView(lead), messages: store.messagesFor(lead.id) });
      if (m[2] === '/read' && method === 'POST') return send(res, 200, leadView(service.markRead(lead)));
      if (!m[2] && method === 'DELETE') { store.deleteLead(lead.id); return send(res, 204, ''); }
      if (!m[2] && method === 'PATCH') {
        const body = parseJson(await readBody(req));
        const patch = {};
        for (const k of ['name', 'email', 'notes', 'source']) if (typeof body[k] === 'string') patch[k] = body[k].trim();
        if (body.status !== undefined) {
          if (!LEAD_STATUSES.includes(body.status)) throw new HttpError(400, 'Status inválido');
          patch.status = body.status;
        }
        if (body.tags !== undefined) patch.tags = toTags(body.tags);
        if (typeof body.optIn === 'boolean') patch.optIn = body.optIn;
        if (typeof body.optedOut === 'boolean') patch.optedOut = body.optedOut;
        return send(res, 200, leadView(store.updateLead(lead.id, patch)));
      }
      if (m[2] === '/messages' && method === 'POST') {
        const body = parseJson(await readBody(req));
        const msg = await service.send(lead, {
          text: body.text,
          template: body.template ? String(body.template).trim() : undefined,
          language: body.language || 'pt_BR',
          params: Array.isArray(body.params) ? body.params : [],
        });
        return send(res, 201, msg);
      }
    }

    // ---------- Arquivos do painel ----------
    if (method === 'GET' && !pathname.startsWith('/api/')) {
      const file = path.join(PUBLIC, pathname === '/' ? 'index.html' : path.normalize(pathname).replace(/^([/\\])+/, ''));
      if (file.startsWith(PUBLIC) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        return fs.createReadStream(file).pipe(res);
      }
    }
    throw new HttpError(404, 'Não encontrado');
  }

  const server = http.createServer((req, res) => {
    route(req, res).catch((err) => {
      if (!(err instanceof HttpError)) log.error(err);
      if (!res.headersSent) send(res, err.status || 500, { error: err instanceof HttpError ? err.message : 'Erro interno' });
    });
  });

  return { server, service };
}

// Execução direta: node src/server.js
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  loadEnvFile(path.join(ROOT, '.env'));
  process.chdir(ROOT);
  const config = buildConfig();
  const store = new Store(config.dataFile);
  const whatsapp = new WhatsAppClient(config.whatsapp);
  const { server, service } = createApp({ config, store, whatsapp });

  server.listen(config.port, () => {
    console.log(`\n📱 WhatsApp Leads rodando em http://localhost:${config.port}`);
    console.log(`   Usuário: ${config.adminUser}`);
    if (config.generatedPassword) console.log(`   Senha (gerada agora, defina ADMIN_PASSWORD no .env): ${config.generatedPassword}`);
    if (whatsapp.dryRun) console.log('   ⚠️  Modo simulação: configure WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID para enviar de verdade.');
    if (!config.whatsapp.appSecret) console.log('   ⚠️  WHATSAPP_APP_SECRET vazio: a assinatura dos webhooks não está sendo validada.');
    console.log('');
  });

  const tick = () => service.runFollowups().then((n) => n && console.log(`Follow-ups enviados: ${n}`)).catch(console.error);
  setInterval(tick, 60_000);

  const shutdown = () => { store.flush(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
