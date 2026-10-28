const $ = (sel, root = document) => root.querySelector(sel);
const STATUS_LABEL = { novo: 'Novo', em_contato: 'Em contato', respondeu: 'Respondeu', qualificado: 'Qualificado', convertido: 'Convertido', perdido: 'Perdido' };
const MSG_STATUS = { queued: '🕓', simulated: '✓ simulado', sent: '✓', delivered: '✓✓', read: '✓✓', failed: '⚠️ falhou', received: '' };

const state = { config: null, leads: [], selectedId: null, messages: [] };

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: opts.body && typeof opts.body === 'string' && !opts.raw ? { 'Content-Type': 'application/json' } : {},
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) node.append(c);
  return node;
}

const fmtPhone = (d) => { const m = String(d).match(/^55(\d{2})(\d{4,5})(\d{4})$/); return m ? `(${m[1]}) ${m[2]}-${m[3]}` : `+${d}`; };
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const fmtDay = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
function fmtWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? fmtTime(iso) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

// ---------- Indicadores ----------
async function loadStats() {
  const s = await api('/api/stats');
  const cards = [
    ['Leads', s.totalLeads],
    ['Novos', s.byStatus.novo],
    ['Não lidas', s.unreadLeads, s.unreadLeads > 0],
    ['Aguardando resposta', s.awaitingReply],
    ['Convertidos', s.byStatus.convertido],
    ['Enviadas 24h', s.sent24h],
    ['Lidas 24h', s.read24h],
    ['Recebidas 24h', s.received24h],
    ['Falhas 24h', s.failed24h, s.failed24h > 0],
  ];
  $('#stats').replaceChildren(...cards.map(([label, n, alert]) => el('div', { class: `stat${alert ? ' alert' : ''}` }, el('b', {}, String(n ?? 0)), el('span', {}, label))));
}

// ---------- Lista ----------
async function loadLeads() {
  const params = new URLSearchParams({ q: $('#search').value, status: $('#filter-status').value });
  state.leads = await api(`/api/leads?${params}`);
  renderList();
}

function renderList() {
  const list = $('#lead-list');
  if (!state.leads.length) {
    list.replaceChildren(el('li', { class: 'empty-list' }, 'Nenhum lead encontrado.'));
    return;
  }
  list.replaceChildren(...state.leads.map((l) => el('li', {
    class: l.id === state.selectedId ? 'active' : '',
    onclick: () => selectLead(l.id),
  },
  el('span', { class: 'name' }, l.name || fmtPhone(l.phone), l.optedOut ? ' 🚫' : ''),
  el('span', { class: 'when' }, fmtWhen(l.lastActivityAt)),
  el('span', { class: 'preview' }, l.lastMessagePreview || l.source || ''),
  l.unread ? el('span', { class: 'unread' }, String(l.unread)) : el('span', { class: `badge ${l.status}` }, STATUS_LABEL[l.status]))));
}

// ---------- Conversa ----------
async function selectLead(id) {
  state.selectedId = id;
  renderList();
  const { lead, messages } = await api(`/api/leads/${id}`);
  state.messages = messages;
  renderDetail(lead);
  if (lead.unread) api(`/api/leads/${id}/read`, { method: 'POST' }).catch(() => {});
}

function renderMessages() {
  const box = $('[data-messages]');
  if (!box) return;
  let lastDay = '';
  const nodes = [];
  for (const m of state.messages) {
    const day = fmtDay(m.createdAt);
    if (day !== lastDay) { nodes.push(el('div', { class: 'day' }, day)); lastDay = day; }
    nodes.push(el('div', { class: `msg ${m.direction}${m.status === 'failed' ? ' failed' : ''}` },
      m.body,
      m.error ? el('div', { class: 'err' }, m.error) : null,
      el('div', { class: 'foot' },
        m.auto ? '🤖 automático' : null,
        fmtTime(m.createdAt),
        m.direction === 'out' ? el('span', { class: `tick ${m.status}` }, MSG_STATUS[m.status] || m.status) : null)));
  }
  if (!nodes.length) nodes.push(el('div', { class: 'day' }, 'Nenhuma mensagem ainda'));
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  box.replaceChildren(...nodes);
  if (atBottom || box.dataset.fresh !== 'no') { box.scrollTop = box.scrollHeight; box.dataset.fresh = 'no'; }
}

function renderDetail(lead) {
  const detail = $('#detail');
  detail.replaceChildren($('#tpl-detail').content.cloneNode(true));
  $('[data-name]', detail).textContent = lead.name || fmtPhone(lead.phone);
  const link = $('[data-phone]', detail);
  link.textContent = fmtPhone(lead.phone);
  link.href = `https://wa.me/${lead.phone}`;
  updateWindow(lead);
  renderMessages();

  // Composer
  const form = $('[data-composer]', detail);
  const setTab = (tab) => {
    form.dataset.tab = tab;
    form.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    form.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== tab; });
  };
  form.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  setTab(lead.windowOpen ? 'text' : 'template');
  if (state.config?.followup?.template) form.template.value = state.config.followup.template;
  form.text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('[data-error]', form);
    err.textContent = '';
    const body = form.dataset.tab === 'text'
      ? { text: form.text.value }
      : { template: form.template.value, language: form.language.value, params: form.params.value.split('|').map((s) => s.trim()).filter(Boolean) };
    const btn = form.querySelector('button:not([data-tab])');
    btn.disabled = true;
    try {
      await api(`/api/leads/${lead.id}/messages`, { method: 'POST', body: JSON.stringify(body) });
      if (form.dataset.tab === 'text') form.text.value = '';
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      btn.disabled = false;
    }
  });

  // Dados do lead (salva ao sair do campo)
  const statusSel = $('[data-field="status"]', detail);
  statusSel.replaceChildren(...state.config.statuses.map((s) => el('option', { value: s }, STATUS_LABEL[s])));
  for (const input of detail.querySelectorAll('[data-field]')) {
    const field = input.dataset.field;
    if (input.type === 'checkbox') input.checked = Boolean(lead[field]);
    else input.value = field === 'tags' ? (lead.tags || []).join(', ') : lead[field] ?? '';
    input.addEventListener('change', async () => {
      const value = input.type === 'checkbox' ? input.checked : input.value;
      try { await api(`/api/leads/${lead.id}`, { method: 'PATCH', body: JSON.stringify({ [field]: value }) }); }
      catch (ex) { alert(ex.message); }
    });
  }
  renderMeta(lead);
  $('[data-delete]', detail).addEventListener('click', async () => {
    if (!confirm('Excluir este lead e todo o histórico de mensagens?')) return;
    await api(`/api/leads/${lead.id}`, { method: 'DELETE' });
    state.selectedId = null;
    detail.replaceChildren(el('div', { class: 'empty' }, 'Lead excluído.'));
  });
}

function updateWindow(lead) {
  const w = $('[data-window]');
  if (!w) return;
  w.className = `window ${lead.windowOpen ? 'open' : 'closed'}`;
  w.textContent = lead.optedOut ? '🚫 Pediu para sair' : lead.windowOpen ? 'Janela de 24h aberta — texto livre' : 'Fora da janela — só modelos';
}

function renderMeta(lead) {
  const meta = $('[data-meta]');
  if (!meta) return;
  const rows = [
    ['Cadastro', fmtDateTime(lead.createdAt)],
    ['Última msg. dele', fmtDateTime(lead.lastInboundAt)],
    ['Última msg. sua', fmtDateTime(lead.lastOutboundAt)],
    ['Follow-ups', `${lead.followupCount || 0} de ${state.config.followup.max}`],
  ];
  meta.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
}

// ---------- Tempo real ----------
let refreshTimer;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { loadLeads(); loadStats(); }, 250);
}

function listen() {
  const es = new EventSource('/api/events');
  es.onmessage = (ev) => {
    const e = JSON.parse(ev.data);
    if (e.type === 'message' && e.message.leadId === state.selectedId) {
      const i = state.messages.findIndex((m) => m.id === e.message.id);
      if (i >= 0) state.messages[i] = e.message; else state.messages.push(e.message);
      renderMessages();
      if (e.message.direction === 'in') {
        api(`/api/leads/${state.selectedId}/read`, { method: 'POST' }).catch(() => {});
        notify(e.message);
      }
    } else if (e.type === 'message' && e.message.direction === 'in') {
      notify(e.message);
    }
    if (e.type === 'lead' && e.lead.id === state.selectedId) {
      api(`/api/leads/${e.lead.id}`).then(({ lead }) => { updateWindow(lead); renderMeta(lead); });
    }
    scheduleRefresh();
  };
}

function notify(message) {
  if (document.hasFocus() && message.leadId === state.selectedId) return;
  const lead = state.leads.find((l) => l.id === message.leadId);
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(lead?.name || 'Nova mensagem de lead', { body: message.body });
  }
  document.title = '(•) WhatsApp Leads';
}
window.addEventListener('focus', () => { document.title = 'WhatsApp Leads'; });

// ---------- Diálogos ----------
function setupDialogs() {
  const dNew = $('#dlg-new');
  $('#btn-new').addEventListener('click', () => { $('#form-new').reset(); $('[data-error]', dNew).textContent = ''; dNew.showModal(); });
  $('#form-new').addEventListener('submit', async (e) => {
    if (e.submitter?.value !== 'ok') return;
    e.preventDefault();
    const f = e.target;
    try {
      const lead = await api('/api/leads', { method: 'POST', body: JSON.stringify({
        name: f.name.value, phone: f.phone.value, email: f.email.value, source: f.source.value || 'manual', tags: f.tags.value, optIn: f.optIn.checked,
      }) });
      dNew.close();
      await loadLeads();
      selectLead(lead.id);
    } catch (ex) {
      $('[data-error]', dNew).textContent = ex.message;
    }
  });

  const dImp = $('#dlg-import');
  $('#btn-import').addEventListener('click', () => { $('#form-import').reset(); $('[data-result]', dImp).textContent = ''; dImp.showModal(); });
  $('#form-import').addEventListener('submit', async (e) => {
    if (e.submitter?.value !== 'ok') return;
    e.preventDefault();
    const file = e.target.file.files[0];
    if (!file) return;
    const out = $('[data-result]', dImp);
    try {
      const r = await api('/api/leads/import', { method: 'POST', body: await file.text(), raw: true });
      out.textContent = `✅ ${r.created} criados, ${r.updated} já existiam.` + (r.errors.length ? `\n⚠️ ${r.errors.length} com erro:\n${r.errors.slice(0, 10).join('\n')}` : '');
      loadLeads(); loadStats();
    } catch (ex) { out.textContent = ex.message; }
  });

  const dBc = $('#dlg-broadcast');
  const fBc = $('#form-broadcast');
  fBc.status.replaceChildren(el('option', { value: '' }, 'Todos'), ...state.config.statuses.map((s) => el('option', { value: s }, STATUS_LABEL[s])));
  let targets = [];
  const recount = async () => {
    const leads = await api(`/api/leads?${new URLSearchParams({ status: fBc.status.value })}`);
    const tag = fBc.tag.value.trim().toLowerCase();
    targets = leads.filter((l) => l.optIn && !l.optedOut && (!tag || (l.tags || []).some((t) => t.toLowerCase() === tag)));
    $('[data-count]', dBc).textContent = `${targets.length} lead(s) com opt-in serão contatados.`;
  };
  fBc.status.addEventListener('change', recount);
  fBc.tag.addEventListener('input', recount);
  $('#btn-broadcast').addEventListener('click', () => { $('[data-result]', dBc).textContent = ''; recount(); dBc.showModal(); });
  fBc.addEventListener('submit', async (e) => {
    if (e.submitter?.value !== 'ok') return;
    e.preventDefault();
    if (!targets.length) return;
    if (!confirm(`Enviar o modelo "${fBc.template.value}" para ${targets.length} lead(s)?`)) return;
    const out = $('[data-result]', dBc);
    out.textContent = 'Enviando…';
    e.submitter.disabled = true;
    try {
      const r = await api('/api/broadcast', { method: 'POST', body: JSON.stringify({
        leadIds: targets.map((l) => l.id), template: fBc.template.value, language: fBc.language.value,
        params: fBc.params.value.split('|').map((s) => s.trim()).filter(Boolean),
      }) });
      out.textContent = `✅ ${r.sent} enviados.` + (r.failed.length ? `\n⚠️ ${r.failed.length} falharam: ${r.failed.slice(0, 5).map((f) => f.error).join('; ')}` : '');
    } catch (ex) { out.textContent = ex.message; } finally { e.submitter.disabled = false; }
  });
}

// ---------- Início ----------
async function init() {
  state.config = await api('/api/config');
  const mode = $('#mode');
  mode.className = `mode ${state.config.dryRun ? 'sim' : 'live'}`;
  mode.textContent = state.config.dryRun ? 'Modo simulação — nada é enviado' : '● Conectado ao WhatsApp';
  $('#filter-status').append(...state.config.statuses.map((s) => el('option', { value: s }, STATUS_LABEL[s])));
  let t;
  $('#search').addEventListener('input', () => { clearTimeout(t); t = setTimeout(loadLeads, 200); });
  $('#filter-status').addEventListener('change', loadLeads);
  setupDialogs();
  await Promise.all([loadLeads(), loadStats()]);
  listen();
  if ('Notification' in window && Notification.permission === 'default') {
    document.addEventListener('click', () => Notification.requestPermission(), { once: true });
  }
  setInterval(loadStats, 60_000);
}

init().catch((e) => { document.body.prepend(el('p', { class: 'error' }, `Falha ao iniciar: ${e.message}`)); });
