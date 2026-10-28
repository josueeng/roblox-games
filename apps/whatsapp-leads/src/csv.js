/** Lê CSV (vírgula ou ponto e vírgula, com aspas) e devolve objetos usando a 1ª linha como cabeçalho. */
export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }

  const clean = rows.filter((r) => r.some((v) => v.trim()));
  if (!clean.length) return [];
  const header = clean[0].map((h) => h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
  return clean.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] || '').trim()])));
}

const pick = (row, ...keys) => keys.map((k) => row[k]).find((v) => v) || '';

export function csvRowToLead(row) {
  return {
    name: pick(row, 'nome', 'name'),
    phone: pick(row, 'telefone', 'whatsapp', 'celular', 'phone'),
    email: pick(row, 'email', 'e-mail'),
    source: pick(row, 'origem', 'source') || 'importacao',
    tags: pick(row, 'tags', 'etiquetas'),
    notes: pick(row, 'observacoes', 'notas', 'notes'),
    optIn: pick(row, 'optin', 'opt-in', 'consentimento'),
  };
}
