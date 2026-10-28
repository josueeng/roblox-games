import crypto from 'node:crypto';

/** Cliente mínimo da WhatsApp Cloud API (graph.facebook.com). */
export class WhatsAppClient {
  constructor({ token, phoneNumberId, apiVersion = 'v23.0', fetchImpl = globalThis.fetch } = {}) {
    this.token = token;
    this.phoneNumberId = phoneNumberId;
    this.apiVersion = apiVersion;
    this.fetch = fetchImpl;
  }

  /** Sem credenciais o app roda em modo simulação: as mensagens são registradas, mas não enviadas. */
  get dryRun() {
    return !(this.token && this.phoneNumberId);
  }

  async request(body) {
    if (this.dryRun) return { simulated: true, id: `sim.${crypto.randomUUID()}` };
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;
    const res = await this.fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = json.error || {};
      const err = new Error(e.error_data?.details || e.message || `HTTP ${res.status}`);
      err.code = e.code;
      throw err;
    }
    return { simulated: false, id: json.messages?.[0]?.id || null };
  }

  sendText(to, text) {
    return this.request({ recipient_type: 'individual', to, type: 'text', text: { preview_url: true, body: text } });
  }

  sendTemplate(to, name, language = 'pt_BR', params = []) {
    const template = { name, language: { code: language } };
    if (params.length) {
      template.components = [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text: String(text) })) }];
    }
    return this.request({ to, type: 'template', template });
  }

  markRead(messageId) {
    return this.request({ status: 'read', message_id: messageId });
  }
}

/** Confere o cabeçalho X-Hub-Signature-256 enviado pela Meta. */
export function verifySignature(rawBody, header, appSecret) {
  if (!appSecret) return true;
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const given = header.slice(7);
  return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

function messageText(m) {
  switch (m.type) {
    case 'text': return m.text?.body || '';
    case 'button': return m.button?.text || '';
    case 'interactive': return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '';
    case 'reaction': return m.reaction?.emoji ? `Reagiu com ${m.reaction.emoji}` : '';
    case 'location': return `📍 Localização: ${m.location?.latitude}, ${m.location?.longitude}`;
    case 'image': case 'video': case 'document': case 'audio': case 'sticker': {
      const caption = m[m.type]?.caption;
      return `[${m.type}]${caption ? ' ' + caption : ''}`;
    }
    default: return `[${m.type}]`;
  }
}

/** Extrai mensagens recebidas e atualizações de status do payload do webhook. */
export function parseWebhook(payload) {
  const messages = [];
  const statuses = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const names = Object.fromEntries((value.contacts || []).map((c) => [c.wa_id, c.profile?.name || '']));
      for (const m of value.messages || []) {
        messages.push({
          id: m.id,
          from: m.from,
          name: names[m.from] || '',
          type: m.type,
          body: messageText(m),
          timestamp: new Date(Number(m.timestamp) * 1000 || Date.now()).toISOString(),
        });
      }
      for (const s of value.statuses || []) {
        statuses.push({
          id: s.id,
          status: s.status,
          recipient: s.recipient_id,
          error: s.errors?.[0] ? s.errors[0].error_data?.details || s.errors[0].title || s.errors[0].message : null,
        });
      }
    }
  }
  return { messages, statuses };
}
