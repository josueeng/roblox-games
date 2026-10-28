import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { buildConfig } from '../src/config.js';
import { ProspectService, fillMessage, isMobile, searchOpenStreetMap } from '../src/prospects.js';

export const googlePage = {
  places: [
    { id: 'g1', displayName: { text: 'Pizzaria do Vale' }, formattedAddress: 'Av. Souza Filho, 100 - Centro, Petrolina - PE', nationalPhoneNumber: '(87) 98811-2233', primaryTypeDisplayName: { text: 'Pizzaria' }, businessStatus: 'OPERATIONAL' },
    { id: 'g2', displayName: { text: 'Clínica Com Site' }, formattedAddress: 'Rua A, Petrolina - PE', nationalPhoneNumber: '(87) 99900-1122', websiteUri: 'https://clinica.com.br' },
    { id: 'g3', displayName: { text: 'Barbearia Insta' }, formattedAddress: 'Rua B, Petrolina - PE', internationalPhoneNumber: '+55 87 99123-4567', websiteUri: 'https://instagram.com/barbearia' },
    { id: 'g4', displayName: { text: 'Loja Fixo' }, formattedAddress: 'Rua C, Petrolina - PE', nationalPhoneNumber: '(87) 3861-0000' },
    { id: 'g5', displayName: { text: 'Mercado Juazeiro' }, formattedAddress: 'Rua D, Juazeiro - BA', nationalPhoneNumber: '(74) 99999-1111' },
    { id: 'g6', displayName: { text: 'Fechada' }, formattedAddress: 'Rua E, Petrolina - PE', nationalPhoneNumber: '(87) 98888-7777', businessStatus: 'CLOSED_PERMANENTLY' },
  ],
};

function setup(env = {}, fetchImpl) {
  const config = buildConfig({ ADMIN_PASSWORD: 'x', PROSPECT_SENDER_NAME: 'Josué', ...env });
  const store = new Store(null);
  return { config, store, service: new ProspectService({ store, config, fetchImpl }) };
}

const googleFetch = (calls = []) => async (url, opts) => {
  calls.push({ url, body: JSON.parse(opts.body), headers: opts.headers });
  return { ok: true, json: async () => googlePage };
};

test('busca no Google filtra site, fixo, outra cidade, fechadas e duplicados', async () => {
  const calls = [];
  const { service, store } = setup({ GOOGLE_PLACES_API_KEY: 'k' }, googleFetch(calls));
  const r = await service.search({ city: 'Petrolina, PE', categories: ['pizzaria'] });
  assert.equal(calls[0].body.textQuery, 'pizzaria em Petrolina, PE');
  assert.equal(calls[0].headers['X-Goog-Api-Key'], 'k');
  assert.deepEqual(store.data.prospects.map((p) => p.name), ['Pizzaria do Vale', 'Barbearia Insta']);
  assert.equal(store.data.prospects[0].phone, '5587988112233');
  assert.deepEqual(r.skipped, { website: 1, phone: 1, duplicate: 0 });

  const again = await service.search({ city: 'Petrolina, PE', categories: ['pizzaria'] });
  assert.equal(again.added, 0);
  assert.equal(again.skipped.duplicate, 2);
});

test('busca no OpenStreetMap quando não há chave do Google', async () => {
  let sentQuery = '';
  const fetchImpl = async (url, opts) => {
    sentQuery = decodeURIComponent(opts.body);
    return { ok: true, json: async () => ({ elements: [
      { type: 'node', id: 1, tags: { name: 'Açaí da Orla', amenity: 'ice_cream', phone: '+55 87 3862-1111;+55 87 98877-6655', 'addr:street': 'Orla' } },
      { type: 'node', id: 2, tags: { name: 'Banco X', amenity: 'bank', phone: '+55 87 99999-0000' } },
    ] }) };
  };
  const results = await searchOpenStreetMap({ city: 'Petrolina, PE', fetchImpl });
  assert.match(sentQuery, /area\["name"="Petrolina"\]/);
  assert.equal(results.length, 1);
  assert.equal(results[0].phone, '+55 87 98877-6655', 'prefere o celular');
});

test('mensagem padrão é personalizada', () => {
  const { config } = setup({ PROSPECT_PORTFOLIO_URL: 'https://meusite.dev' });
  const msg = fillMessage(config.prospecting.message, { name: 'Pizzaria do Vale', city: 'Petrolina, PE' }, config.prospecting);
  assert.match(msg, /Josué/);
  assert.match(msg, /Pizzaria do Vale/);
  assert.match(msg, /em Petrolina\./);
  assert.match(msg, /R\$ 250/);
  assert.match(msg, /https:\/\/meusite\.dev/);
  assert.ok(isMobile('5587988112233'));
  assert.ok(!isMobile('558738610000'));
});

test('limite diário de contatos e conversão em lead', async () => {
  const { service, store } = setup({ GOOGLE_PLACES_API_KEY: 'k', PROSPECT_DAILY_LIMIT: '1' }, googleFetch());
  await service.search({ categories: ['x'] });
  const [a, b] = store.data.prospects;
  service.markContacted(a);
  assert.equal(store.getProspect(a.id).status, 'enviado');
  assert.throws(() => service.markContacted(b), /Limite de 1/);
  assert.doesNotThrow(() => service.markContacted(store.getProspect(a.id)), 'reabrir a mesma conversa não conta');

  const view = service.view(store.getProspect(b.id));
  assert.match(view.link, /^https:\/\/wa\.me\/5587991234567\?text=Ol%C3%A1/);

  const lead = service.convert(store.getProspect(a.id));
  assert.equal(lead.optIn, true);
  assert.equal(store.getProspect(a.id).status, 'interessado');
  assert.equal(store.data.leads.length, 1);
});
