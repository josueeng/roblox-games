const $ = (sel, root = document) => root.querySelector(sel);
const LABEL = { novo: 'A contatar', enviado: 'Mensagem enviada', respondeu: 'Respondeu', interessado: 'Interessado', sem_interesse: 'Sem interesse', invalido: 'Número inválido' };
const state = { info: null, list: [], queue: [] };

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: opts.body ? { 'Content-Type': 'application/json' } : {} });
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
    else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) node.append(c);
  return node;
}

const fmtPhone = (d) => { const m = String(d).match(/^55(\d{2})(\d{4,5})(\d{4})$/); return m ? `(${m[1]}) ${m[2]}-${m[3]}` : `+${d}`; };
const limitReached = () => state.info.dailyLimit > 0 && state.info.sentToday >= state.info.dailyLimit;

function renderCounter() {
  const c = $('#counter');
  c.textContent = `Hoje: ${state.info.sentToday}${state.info.dailyLimit ? ` / ${state.info.dailyLimit}` : ''} contatos`;
  c.className = `mode ${limitReached() ? 'sim' : 'live'}`;
}

async function refresh() {
  [state.info, state.list] = await Promise.all([
    api('/api/prospecting'),
    api(`/api/prospects?${new URLSearchParams({ q: $('#q').value, status: $('#status').value })}`),
  ]);
  state.queue = $('#status').value === 'novo' && !$('#q').value ? state.list : await api('/api/prospects?status=novo');
  renderCounter();
  renderNext();
  renderList();
}

/**
 * Abre a conversa no WhatsApp do aparelho com a mensagem já escrita.
 * O envio final é um toque seu no botão de enviar — isso mantém seu número longe dos filtros de spam.
 */
function openWhatsApp(p, ev) {
  if (p.status === 'novo' && limitReached()) {
    ev.preventDefault();
    alert('Limite diário atingido. Continue amanhã para não ter o número bloqueado.');
    return;
  }
  api(`/api/prospects/${p.id}/contacted`, { method: 'POST' }).then(refresh).catch((e) => alert(e.message));
}

async function setStatus(p, status) {
  await api(`/api/prospects/${p.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
  refresh();
}

async function convert(p) {
  await api(`/api/prospects/${p.id}/convert`, { method: 'POST' });
  alert(`${p.name} foi adicionado aos leads.`);
  refresh();
}

function renderNext() {
  const box = $('#next');
  const p = state.queue[0];
  if (!p) {
    box.replaceChildren(el('p', { class: 'hint' }, 'Nenhuma empresa na fila. Faça uma busca abaixo para encontrar novos contatos.'));
    return;
  }
  box.replaceChildren(el('div', { class: 'biz' },
    el('h3', {}, p.name),
    el('div', { class: 'sub' }, [p.category, fmtPhone(p.phone)].filter(Boolean).join(' · ')),
    p.address ? el('div', { class: 'sub' }, p.address) : null,
    p.mapsUrl ? el('a', { class: 'sub', href: p.mapsUrl, target: '_blank', rel: 'noopener' }, 'Ver no mapa') : null,
    el('div', { class: 'preview' }, p.message),
  ),
  el('a', { class: `big${limitReached() ? ' disabled' : ''}`, href: p.link, target: '_blank', rel: 'noopener', onclick: (e) => openWhatsApp(p, e) },
    limitReached() ? 'Limite diário atingido' : '📲 Abrir no WhatsApp e enviar'),
  el('div', { class: 'row' },
    el('button', { class: 'ghost', onclick: () => setStatus(p, 'invalido') }, 'Número sem WhatsApp'),
    el('button', { class: 'ghost', onclick: () => setStatus(p, 'sem_interesse') }, 'Não contatar'),
  ),
  el('p', { class: 'hint' }, `${state.queue.length} empresa(s) na fila.`));
}

function renderList() {
  const list = $('#list');
  if (!state.list.length) {
    list.replaceChildren(el('li', { class: 'empty' }, 'Nada por aqui.'));
    return;
  }
  list.replaceChildren(...state.list.map((p) => {
    const select = el('select', { onchange: (e) => setStatus(p, e.target.value) },
      state.info.statuses.map((s) => el('option', { value: s, selected: s === p.status }, LABEL[s])));
    return el('li', {},
      el('span', { class: 'name' }, p.name),
      el('span', { class: 'sub' }, fmtPhone(p.phone)),
      el('span', { class: 'sub' }, [p.category, p.address].filter(Boolean).join(' · ')),
      el('div', { class: 'acts' },
        el('a', { class: 'wa', href: p.link, target: '_blank', rel: 'noopener', onclick: (e) => openWhatsApp(p, e) }, 'WhatsApp'),
        select,
        p.leadId ? el('a', { href: '/', class: 'sub' }, 'Ver lead') : el('button', { class: 'ghost', onclick: () => convert(p) }, 'Virou lead'),
        el('button', { class: 'ghost danger', onclick: async () => { if (confirm('Remover esta empresa?')) { await api(`/api/prospects/${p.id}`, { method: 'DELETE' }); refresh(); } } }, 'Remover'),
      ));
  }));
}

async function init() {
  state.info = await api('/api/prospecting');
  const fs = $('#form-search');
  fs.city.value = state.info.city;
  const google = state.info.source === 'google';
  $('#categories-box').hidden = !google;
  $('#categories').replaceChildren(...state.info.categories.map((c) => el('label', {}, el('input', { type: 'checkbox', value: c, checked: true }), c)));
  $('#toggle-cats').addEventListener('click', () => {
    const boxes = [...document.querySelectorAll('#categories input')];
    const on = !boxes.every((b) => b.checked);
    boxes.forEach((b) => { b.checked = on; });
  });
  $('#source-hint').textContent = google
    ? 'Fonte: Google Maps (Places API).'
    : 'Fonte: OpenStreetMap (grátis, mas com poucas empresas cadastradas). Configure GOOGLE_PLACES_API_KEY para resultados muito melhores.';

  fs.addEventListener('submit', async (e) => {
    e.preventDefault();
    const out = $('#search-result');
    const btn = fs.querySelector('button:not(.link)');
    btn.disabled = true;
    out.textContent = 'Buscando… pode levar alguns minutos.';
    try {
      const r = await api('/api/prospects/search', { method: 'POST', body: JSON.stringify({
        city: fs.city.value,
        categories: [...document.querySelectorAll('#categories input:checked')].map((b) => b.value),
        onlyWithoutWebsite: fs.onlyWithoutWebsite.checked,
        onlyMobile: fs.onlyMobile.checked,
      }) });
      out.textContent = `✅ ${r.found} encontradas, ${r.added} novas na fila.\nIgnoradas: ${r.skipped.website} com site, ${r.skipped.phone} sem celular, ${r.skipped.duplicate} já cadastradas.`;
      refresh();
    } catch (ex) { out.textContent = ex.message; } finally { btn.disabled = false; }
  });

  const fm = $('#form-message');
  fm.message.value = state.info.message;
  fm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/prospecting/message', { method: 'PUT', body: JSON.stringify({ message: fm.message.value }) });
      $('#message-result').textContent = '✅ Salva';
      refresh();
    } catch (ex) { $('#message-result').textContent = ex.message; }
  });

  $('#status').replaceChildren(el('option', { value: '' }, 'Todas'), ...state.info.statuses.map((s) => el('option', { value: s }, LABEL[s])));
  let t;
  $('#q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(refresh, 200); });
  $('#status').addEventListener('change', refresh);
  // Ao voltar do WhatsApp para o navegador, atualiza a fila.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  await refresh();
}

init().catch((e) => document.body.prepend(el('p', { class: 'error' }, `Falha ao iniciar: ${e.message}`)));
