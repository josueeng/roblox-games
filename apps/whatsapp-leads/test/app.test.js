import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { normalizePhone, phoneKey } from '../src/phone.js';
import { parseWebhook, verifySignature, WhatsAppClient } from '../src/whatsapp.js';
import { parseCsv, csvRowToLead } from '../src/csv.js';
import { Store } from '../src/store.js';
import { LeadService, fillParams } from '../src/service.js';
import { buildConfig } from '../src/config.js';
import { createApp } from '../src/server.js';

const silent = { error() {}, log() {} };

function setup(env = {}, fetchImpl) {
  const config = buildConfig({ ADMIN_PASSWORD: 'secret', WHATSAPP_VERIFY_TOKEN: 'vt', INTAKE_TOKEN: 'itk', ...env });
  const store = new Store(null);
  const whatsapp = new WhatsAppClient({ ...config.whatsapp, fetchImpl });
  const service = new LeadService({ store, whatsapp, config, log: silent });
  return { config, store, whatsapp, service };
}

const inbound = (from, body, id = crypto.randomUUID(), name = 'Maria') => ({
  entry: [{ changes: [{ value: {
    contacts: [{ wa_id: from, profile: { name } }],
    messages: [{ from, id, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body } }],
  } }] }],
});

test('normaliza telefones brasileiros', () => {
  assert.equal(normalizePhone('(11) 98765-4321'), '5511987654321');
  assert.equal(normalizePhone('+55 11 98765-4321'), '5511987654321');
  assert.equal(normalizePhone('011 98765-4321'), '5511987654321');
  assert.equal(normalizePhone('1133334444'), '551133334444');
  assert.equal(normalizePhone('123'), '');
  assert.equal(phoneKey('5511987654321'), phoneKey('551187654321'));
});

test('lê payload do webhook (mensagens e status)', () => {
  const p = inbound('5511987654321', 'Oi!', 'wamid.1');
  p.entry[0].changes[0].value.statuses = [{ id: 'wamid.X', status: 'read', recipient_id: '551187654321' }];
  const { messages, statuses } = parseWebhook(p);
  assert.deepEqual(messages.map((m) => [m.id, m.from, m.name, m.body]), [['wamid.1', '5511987654321', 'Maria', 'Oi!']]);
  assert.deepEqual(statuses.map((s) => [s.id, s.status]), [['wamid.X', 'read']]);
});

test('valida assinatura do webhook', () => {
  const body = Buffer.from('{"a":1}');
  const sig = 'sha256=' + crypto.createHmac('sha256', 's3').update(body).digest('hex');
  assert.ok(verifySignature(body, sig, 's3'));
  assert.ok(!verifySignature(body, sig, 'outro'));
  assert.ok(!verifySignature(body, undefined, 's3'));
});

test('importa CSV com ponto e vírgula e aspas', () => {
  const rows = parseCsv('﻿Nome;Telefone;Opt-in\n"Silva; João";(11) 91234-5678;sim\n\n');
  assert.equal(rows.length, 1);
  const lead = csvRowToLead(rows[0]);
  assert.equal(lead.name, 'Silva; João');
  assert.equal(lead.optIn, 'sim');
});

test('preenche variáveis do modelo', () => {
  assert.deepEqual(fillParams(['{primeiro_nome}', 'fixo', '{origem}'], { name: 'Ana Souza', source: 'site', phone: '55' }), ['Ana', 'fixo', 'site']);
});

test('texto livre só dentro da janela de 24h; modelo exige opt-in', async () => {
  const { service } = setup();
  const { lead } = service.createLead({ name: 'Ana', phone: '11987654321' });
  await assert.rejects(service.send(lead, { text: 'oi' }), /janela de 24h/);
  await assert.rejects(service.send(lead, { template: 'boas_vindas' }), /opt-in/);
});

test('mensagem recebida cria lead, abre janela, e status não regride', async () => {
  const { service, store } = setup();
  await service.handleWebhook(inbound('551187654321', 'Quero saber o preço', 'wamid.in1'));
  await service.handleWebhook(inbound('551187654321', 'Quero saber o preço', 'wamid.in1')); // reenvio duplicado
  const lead = store.findLeadByPhone('5511987654321');
  assert.ok(lead, 'casa número com e sem nono dígito');
  assert.equal(lead.unread, 1);
  assert.equal(lead.name, 'Maria');
  assert.equal(store.messagesFor(lead.id).length, 1);

  const msg = await service.send(lead, { text: 'Olá Maria!' });
  assert.equal(msg.status, 'simulated');
  store.updateMessage(msg.id, { waMessageId: 'wamid.out1', status: 'sent' });
  store.applyStatus('wamid.out1', 'read');
  store.applyStatus('wamid.out1', 'delivered');
  assert.equal(store.messagesFor(lead.id).at(-1).status, 'read');
});

test('palavra de opt-out bloqueia envios e confirma', async () => {
  const { service, store } = setup();
  await service.handleWebhook(inbound('5511987654321', 'SAIR'));
  const lead = store.findLeadByPhone('5511987654321');
  assert.equal(lead.optedOut, true);
  assert.equal(store.messagesFor(lead.id).at(-1).direction, 'out');
  await assert.rejects(service.send(lead, { text: 'oi' }), /não receber/);
});

test('follow-up automático respeita prazo, limite e horário', async () => {
  const { service, store } = setup({ FOLLOWUP_TEMPLATE: 'lembrete', FOLLOWUP_AFTER_HOURS: '24', FOLLOWUP_MAX: '1', FOLLOWUP_START_HOUR: '0', FOLLOWUP_END_HOUR: '24' });
  const { lead } = service.createLead({ name: 'Ana', phone: '11987654321', optIn: true });
  const old = new Date(Date.now() - 25 * 3600e3).toISOString();
  store.updateLead(lead.id, { lastOutboundAt: old, status: 'em_contato' });
  const { lead: recent } = service.createLead({ name: 'Bia', phone: '11912345678', optIn: true });
  store.updateLead(recent.id, { lastOutboundAt: new Date().toISOString(), status: 'em_contato' });

  assert.equal(await service.runFollowups(), 1);
  assert.equal(store.getLead(lead.id).followupCount, 1);
  store.updateLead(lead.id, { lastOutboundAt: old });
  assert.equal(await service.runFollowups(), 0, 'não passa do máximo');

  const nightOnly = setup({ FOLLOWUP_TEMPLATE: 'x', FOLLOWUP_START_HOUR: '0', FOLLOWUP_END_HOUR: '0' });
  assert.equal(nightOnly.service.inSendingHours(), false);
});

test('envia pela Cloud API com o formato correto', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, json: async () => ({ messages: [{ id: 'wamid.ok' }] }) };
  };
  const { service, store } = setup({ WHATSAPP_TOKEN: 'tok', WHATSAPP_PHONE_NUMBER_ID: '123', WELCOME_TEMPLATE: 'ola', WELCOME_TEMPLATE_PARAMS: '{primeiro_nome}' }, fetchImpl);
  const { lead } = service.createLead({ name: 'Carlos Lima', phone: '11987654321', optIn: true });
  await new Promise((r) => setImmediate(r));
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/v23\.0\/123\/messages$/);
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer tok');
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.to, '5511987654321');
  assert.equal(body.template.name, 'ola');
  assert.deepEqual(body.template.components[0].parameters, [{ type: 'text', text: 'Carlos' }]);
  assert.equal(store.messagesFor(lead.id)[0].status, 'sent');
  assert.equal(store.getLead(lead.id).status, 'em_contato');
});

test('servidor HTTP: webhook, intake e autenticação', async () => {
  const { config, store, whatsapp } = setup();
  const { server } = createApp({ config, store, whatsapp, log: silent });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = { Authorization: 'Basic ' + Buffer.from('admin:secret').toString('base64') };
  try {
    let r = await fetch(`${base}/webhook?hub.mode=subscribe&hub.verify_token=vt&hub.challenge=42`);
    assert.equal(await r.text(), '42');
    r = await fetch(`${base}/webhook?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=42`);
    assert.equal(r.status, 403);

    r = await fetch(`${base}/api/leads`);
    assert.equal(r.status, 401);

    r = await fetch(`${base}/api/intake`, { method: 'POST', headers: { 'X-Intake-Token': 'itk', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'nome=Joana&telefone=(21)99999-0000&consentimento=on' });
    assert.equal(r.status, 201);
    r = await fetch(`${base}/api/intake?token=errado`, { method: 'POST', body: '{}' });
    assert.equal(r.status, 401);

    r = await fetch(`${base}/webhook`, { method: 'POST', body: JSON.stringify(inbound('5521999990000', 'Oi, vi o site')) });
    assert.equal(r.status, 200);
    await new Promise((res) => setTimeout(res, 20));

    r = await fetch(`${base}/api/leads`, { headers: auth });
    const leads = await r.json();
    assert.equal(leads.length, 1);
    assert.equal(leads[0].name, 'Joana');
    assert.equal(leads[0].status, 'respondeu');
    assert.equal(leads[0].windowOpen, true);

    r = await fetch(`${base}/api/leads/${leads[0].id}/messages`, { method: 'POST', headers: auth, body: JSON.stringify({ text: 'Olá Joana!' }) });
    assert.equal(r.status, 201);
    r = await fetch(`${base}/api/stats`, { headers: auth });
    assert.equal((await r.json()).sent24h, 1);
  } finally {
    server.close();
  }
});
