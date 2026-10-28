import { normalizePhone } from './phone.js';
import { parseWebhook } from './whatsapp.js';

export const WINDOW_MS = 24 * 3600e3;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Substitui {nome}, {primeiro_nome}, {telefone}, {origem} pelos dados do lead. */
export function fillParams(params, lead) {
  const first = (lead.name || '').trim().split(/\s+/)[0] || 'tudo bem';
  const values = { nome: lead.name || first, primeiro_nome: first, telefone: lead.phone, origem: lead.source || '' };
  return (params || []).map((p) => String(p).replace(/\{(\w+)\}/g, (all, k) => values[k] ?? all));
}

/** A WhatsApp só permite texto livre até 24h após a última mensagem do lead. Fora disso, só modelos aprovados. */
export function windowOpen(lead, at = Date.now()) {
  return Boolean(lead.lastInboundAt) && at - Date.parse(lead.lastInboundAt) < WINDOW_MS;
}

function hourIn(timezone, at) {
  const h = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: timezone }).format(at);
  return Number(h);
}

export class LeadService {
  constructor({ store, whatsapp, config, log = console }) {
    this.store = store;
    this.wa = whatsapp;
    this.config = config;
    this.log = log;
  }

  // ---------- Cadastro ----------
  createLead(input, { autoWelcome = true } = {}) {
    const phone = normalizePhone(input.phone, this.config.defaultCountryCode);
    if (!phone) throw new HttpError(400, 'Telefone inválido');
    const existing = this.store.findLeadByPhone(phone);
    if (existing) {
      // Lead repetido (ex.: preencheu o formulário de novo): atualiza o que veio e não duplica.
      const patch = {};
      if (input.name && !existing.name) patch.name = input.name;
      if (input.email && !existing.email) patch.email = input.email;
      if (input.optIn && !existing.optIn) patch.optIn = true;
      if (input.tags?.length) patch.tags = [...new Set([...(existing.tags || []), ...input.tags])];
      return { lead: Object.keys(patch).length ? this.store.updateLead(existing.id, patch) : existing, created: false };
    }
    const lead = this.store.createLead({ ...input, phone });
    if (autoWelcome) this.sendWelcome(lead).catch((e) => this.log.error('Falha no envio de boas-vindas:', e.message));
    return { lead, created: true };
  }

  async sendWelcome(lead) {
    const w = this.config.welcome;
    if (!w.template || !lead.optIn || lead.optedOut) return null;
    return this.send(lead, { template: w.template, language: w.language, params: fillParams(w.params, lead) }, { auto: true });
  }

  // ---------- Envio ----------
  /**
   * Envia texto livre ({ text }) ou modelo ({ template, language, params }) para um lead,
   * respeitando opt-out e a janela de 24h, e registra tudo no histórico.
   */
  async send(lead, { text, template, language = 'pt_BR', params = [] }, { auto = false, force = false } = {}) {
    if (lead.optedOut && !force) throw new HttpError(409, 'Este lead pediu para não receber mensagens');
    if (template) {
      if (!lead.optIn && !force) throw new HttpError(409, 'Lead sem opt-in: marque o consentimento antes de enviar modelos');
    } else {
      if (!text || !text.trim()) throw new HttpError(400, 'Mensagem vazia');
      if (!windowOpen(lead)) {
        throw new HttpError(409, 'Fora da janela de 24h do WhatsApp: use um modelo (template) aprovado');
      }
    }

    const body = template ? `📄 Modelo "${template}"${params.length ? ` — ${params.join(', ')}` : ''}` : text.trim();
    const msg = this.store.addMessage({
      leadId: lead.id,
      direction: 'out',
      type: template ? 'template' : 'text',
      body,
      template: template ? { name: template, language, params } : null,
      status: 'queued',
      auto,
    });

    try {
      const res = template
        ? await this.wa.sendTemplate(lead.phone, template, language, params)
        : await this.wa.sendText(lead.phone, text.trim());
      this.store.updateMessage(msg.id, { waMessageId: res.id, status: res.simulated ? 'simulated' : 'sent' });
    } catch (err) {
      this.store.updateMessage(msg.id, { status: 'failed', error: err.message });
      this.touchOutbound(lead, body);
      throw new HttpError(502, `WhatsApp recusou o envio: ${err.message}`);
    }
    this.touchOutbound(lead, body);
    return this.store.messagesFor(lead.id).find((m) => m.id === msg.id);
  }

  touchOutbound(lead, preview) {
    const ts = new Date().toISOString();
    this.store.updateLead(lead.id, {
      lastOutboundAt: ts,
      lastActivityAt: ts,
      lastMessagePreview: `Você: ${preview}`.slice(0, 140),
      status: lead.status === 'novo' ? 'em_contato' : lead.status,
    });
  }

  /** Envio em massa de um modelo, um por vez, com intervalo entre mensagens. */
  async broadcast(leadIds, { template, language, params }) {
    if (!template) throw new HttpError(400, 'Informe o nome do modelo');
    const results = [];
    for (const [i, leadId] of leadIds.entries()) {
      const lead = this.store.getLead(leadId);
      if (!lead) { results.push({ leadId, ok: false, error: 'Lead não encontrado' }); continue; }
      try {
        await this.send(lead, { template, language, params: fillParams(params, lead) });
        results.push({ leadId, ok: true });
      } catch (err) {
        results.push({ leadId, ok: false, error: err.message });
      }
      if (i < leadIds.length - 1 && !this.wa.dryRun) await new Promise((r) => setTimeout(r, this.config.sendIntervalMs));
    }
    return results;
  }

  // ---------- Webhook ----------
  async handleWebhook(payload) {
    const { messages, statuses } = parseWebhookSafe(payload);
    for (const m of messages) await this.handleInbound(m);
    for (const s of statuses) this.store.applyStatus(s.id, s.status, s.error);
  }

  async handleInbound(m) {
    if (this.store.hasMessage(m.id)) return; // a Meta pode reenviar o mesmo evento
    let lead = this.store.findLeadByPhone(m.from);
    if (!lead) {
      // Quem chama primeiro no WhatsApp vira lead automaticamente (e conta como consentimento).
      lead = this.store.createLead({ name: m.name, phone: m.from, source: 'whatsapp', optIn: true });
    }
    this.store.addMessage({
      leadId: lead.id, direction: 'in', type: m.type, body: m.body, waMessageId: m.id, status: 'received', createdAt: m.timestamp,
    });

    const optingOut = this.config.optOutKeywords.includes(m.body.trim().toLowerCase());
    this.store.updateLead(lead.id, {
      name: lead.name || m.name,
      lastInboundAt: m.timestamp,
      lastActivityAt: m.timestamp,
      lastMessagePreview: m.body.slice(0, 140),
      unread: (lead.unread || 0) + 1,
      optedOut: optingOut ? true : lead.optedOut,
      status: ['novo', 'em_contato'].includes(lead.status) ? 'respondeu' : lead.status,
    });

    if (optingOut && this.config.optOutReply) {
      // Confirmação dentro da janela de 24h recém-aberta.
      await this.send(this.store.getLead(lead.id), { text: this.config.optOutReply }, { auto: true, force: true })
        .catch((e) => this.log.error('Falha ao confirmar opt-out:', e.message));
    }
  }

  markRead(lead) {
    if (!lead.unread) return lead;
    const lastIn = this.store.messagesFor(lead.id).filter((m) => m.direction === 'in' && m.waMessageId).at(-1);
    if (lastIn) this.wa.markRead(lastIn.waMessageId).catch(() => {});
    return this.store.updateLead(lead.id, { unread: 0 });
  }

  // ---------- Follow-up automático ----------
  /** Leads que receberam mensagem, não responderam e já esperaram o suficiente. */
  dueFollowups(at = Date.now()) {
    const f = this.config.followup;
    if (!f.template || f.max <= 0) return [];
    return this.store.data.leads.filter((l) =>
      l.optIn && !l.optedOut &&
      ['novo', 'em_contato'].includes(l.status) &&
      l.lastOutboundAt &&
      (!l.lastInboundAt || l.lastInboundAt < l.lastOutboundAt) &&
      (l.followupCount || 0) < f.max &&
      at - Date.parse(l.lastOutboundAt) >= f.afterHours * 3600e3,
    );
  }

  inSendingHours(at = Date.now()) {
    const { startHour, endHour } = this.config.followup;
    const h = hourIn(this.config.timezone, new Date(at));
    return h >= startHour && h < endHour;
  }

  async runFollowups(at = Date.now()) {
    if (this._running || !this.inSendingHours(at)) return 0;
    this._running = true;
    let sent = 0;
    try {
      const f = this.config.followup;
      for (const lead of this.dueFollowups(at)) {
        try {
          await this.send(lead, { template: f.template, language: f.language, params: fillParams(f.params, lead) }, { auto: true });
          sent++;
        } catch (err) {
          this.log.error(`Follow-up para ${lead.phone} falhou:`, err.message);
        }
        // Conta a tentativa mesmo em caso de falha, para não insistir indefinidamente.
        this.store.updateLead(lead.id, { followupCount: (lead.followupCount || 0) + 1, lastFollowupAt: new Date(at).toISOString() });
        if (!this.wa.dryRun) await new Promise((r) => setTimeout(r, this.config.sendIntervalMs));
      }
    } finally {
      this._running = false;
    }
    return sent;
  }
}

function parseWebhookSafe(payload) {
  try { return parseWebhook(payload); } catch { return { messages: [], statuses: [] }; }
}
