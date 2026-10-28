import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { phoneKey } from './phone.js';

export const LEAD_STATUSES = ['novo', 'em_contato', 'respondeu', 'qualificado', 'convertido', 'perdido'];
const STATUS_RANK = { queued: 0, simulated: 1, sent: 1, delivered: 2, read: 3 };

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

/** Armazenamento em arquivo JSON, com gravação atômica e eventos para atualização ao vivo. */
export class Store extends EventEmitter {
  constructor(file) {
    super();
    this.file = file;
    this.data = { leads: [], messages: [], prospects: [], settings: {} };
    if (file && fs.existsSync(file)) {
      this.data = { ...this.data, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    }
    this._timer = null;
  }

  save() {
    if (!this.file || this._timer) return;
    this._timer = setTimeout(() => this.flush(), 200);
  }

  flush() {
    clearTimeout(this._timer);
    this._timer = null;
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  changed(type, payload) {
    this.save();
    this.emit('change', { type, ...payload });
  }

  // ---------- Leads ----------
  listLeads({ q, status } = {}) {
    const term = (q || '').toLowerCase().trim();
    return this.data.leads
      .filter((l) => !status || l.status === status)
      .filter((l) => !term || [l.name, l.phone, l.email, l.source, ...(l.tags || [])].some((v) => String(v || '').toLowerCase().includes(term)))
      .sort((a, b) => (b.lastActivityAt || b.createdAt).localeCompare(a.lastActivityAt || a.createdAt));
  }

  getLead(leadId) {
    return this.data.leads.find((l) => l.id === leadId) || null;
  }

  findLeadByPhone(phone) {
    const key = phoneKey(phone);
    return this.data.leads.find((l) => phoneKey(l.phone) === key) || null;
  }

  createLead(fields) {
    const ts = now();
    const lead = {
      id: id(),
      name: fields.name || '',
      phone: fields.phone,
      email: fields.email || '',
      source: fields.source || 'manual',
      status: LEAD_STATUSES.includes(fields.status) ? fields.status : 'novo',
      tags: fields.tags || [],
      notes: fields.notes || '',
      optIn: Boolean(fields.optIn),
      optedOut: false,
      unread: 0,
      followupCount: 0,
      lastFollowupAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      lastActivityAt: ts,
      lastMessagePreview: '',
      createdAt: ts,
      updatedAt: ts,
    };
    this.data.leads.push(lead);
    this.changed('lead', { lead });
    return lead;
  }

  updateLead(leadId, patch) {
    const lead = this.getLead(leadId);
    if (!lead) return null;
    Object.assign(lead, patch, { updatedAt: now() });
    this.changed('lead', { lead });
    return lead;
  }

  deleteLead(leadId) {
    const before = this.data.leads.length;
    this.data.leads = this.data.leads.filter((l) => l.id !== leadId);
    this.data.messages = this.data.messages.filter((m) => m.leadId !== leadId);
    if (this.data.leads.length === before) return false;
    this.changed('lead_deleted', { leadId });
    return true;
  }

  // ---------- Mensagens ----------
  messagesFor(leadId) {
    return this.data.messages.filter((m) => m.leadId === leadId);
  }

  hasMessage(waMessageId) {
    return Boolean(waMessageId) && this.data.messages.some((m) => m.waMessageId === waMessageId);
  }

  addMessage(fields) {
    const msg = {
      id: id(),
      leadId: fields.leadId,
      direction: fields.direction,
      type: fields.type || 'text',
      body: fields.body || '',
      template: fields.template || null,
      waMessageId: fields.waMessageId || null,
      status: fields.status || 'queued',
      error: fields.error || null,
      auto: Boolean(fields.auto),
      createdAt: fields.createdAt || now(),
    };
    this.data.messages.push(msg);
    this.changed('message', { message: msg });
    return msg;
  }

  updateMessage(msgId, patch) {
    const msg = this.data.messages.find((m) => m.id === msgId);
    if (!msg) return null;
    Object.assign(msg, patch);
    this.changed('message', { message: msg });
    return msg;
  }

  /** Aplica um status vindo do webhook sem "voltar" (ex.: delivered chegando depois de read). */
  applyStatus(waMessageId, status, error) {
    const msg = this.data.messages.find((m) => m.waMessageId === waMessageId);
    if (!msg) return null;
    if (status === 'failed') return this.updateMessage(msg.id, { status, error: error || msg.error });
    if (msg.status === 'failed') return msg;
    if ((STATUS_RANK[status] ?? -1) <= (STATUS_RANK[msg.status] ?? -1)) return msg;
    return this.updateMessage(msg.id, { status });
  }

  // ---------- Prospects (empresas encontradas na busca) ----------
  listProspects({ q, status } = {}) {
    const term = (q || '').toLowerCase().trim();
    return this.data.prospects
      .filter((p) => !status || p.status === status)
      .filter((p) => !term || [p.name, p.phone, p.category, p.address].some((v) => String(v || '').toLowerCase().includes(term)));
  }

  getProspect(prospectId) {
    return this.data.prospects.find((p) => p.id === prospectId) || null;
  }

  findProspectByPhone(phone) {
    const key = phoneKey(phone);
    return this.data.prospects.find((p) => phoneKey(p.phone) === key) || null;
  }

  addProspect(fields) {
    const prospect = { id: id(), status: 'novo', notes: '', contactedAt: null, leadId: null, createdAt: now(), ...fields };
    this.data.prospects.push(prospect);
    this.changed('prospect', { prospect });
    return prospect;
  }

  updateProspect(prospectId, patch) {
    const prospect = this.getProspect(prospectId);
    if (!prospect) return null;
    Object.assign(prospect, patch, { updatedAt: now() });
    this.changed('prospect', { prospect });
    return prospect;
  }

  deleteProspect(prospectId) {
    const before = this.data.prospects.length;
    this.data.prospects = this.data.prospects.filter((p) => p.id !== prospectId);
    if (this.data.prospects.length === before) return false;
    this.changed('prospect_deleted', { prospectId });
    return true;
  }

  stats(at = Date.now()) {
    const dayAgo = new Date(at - 24 * 3600e3).toISOString();
    const byStatus = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0]));
    for (const l of this.data.leads) byStatus[l.status] = (byStatus[l.status] || 0) + 1;
    const out24 = this.data.messages.filter((m) => m.direction === 'out' && m.createdAt >= dayAgo);
    return {
      totalLeads: this.data.leads.length,
      byStatus,
      unreadLeads: this.data.leads.filter((l) => l.unread > 0).length,
      awaitingReply: this.data.leads.filter(
        (l) => !l.optedOut && l.lastOutboundAt && (!l.lastInboundAt || l.lastInboundAt < l.lastOutboundAt),
      ).length,
      optedOut: this.data.leads.filter((l) => l.optedOut).length,
      sent24h: out24.length,
      received24h: this.data.messages.filter((m) => m.direction === 'in' && m.createdAt >= dayAgo).length,
      failed24h: out24.filter((m) => m.status === 'failed').length,
      read24h: out24.filter((m) => m.status === 'read').length,
    };
  }
}
