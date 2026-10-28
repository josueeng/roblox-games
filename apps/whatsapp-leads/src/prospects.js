import { normalizePhone } from './phone.js';
import { HttpError } from './service.js';

export const PROSPECT_STATUSES = ['novo', 'enviado', 'respondeu', 'interessado', 'sem_interesse', 'invalido'];

/** Ramos de negócio usados na busca do Google (texto livre). */
export const DEFAULT_CATEGORIES = [
  'restaurante', 'lanchonete', 'pizzaria', 'clínica', 'consultório odontológico', 'salão de beleza', 'barbearia',
  'academia', 'loja de roupas', 'oficina mecânica', 'pet shop', 'imobiliária', 'escritório de contabilidade',
  'autoescola', 'escola particular', 'loja de materiais de construção', 'ótica', 'farmácia',
];

export const DEFAULT_MESSAGE = `Olá! Tudo bem? Me chamo {meu_nome} e trabalho com desenvolvimento de sites e sistemas web aqui em {cidade}.

Vi a {empresa} e acredito que um site ou sistema próprio pode ajudar vocês a atrair e atender mais clientes (agendamento online, catálogo, cardápio digital, controle de pedidos…).

Estou fazendo projetos a partir de *R$ 250*, com entrega rápida.{portfolio}

Posso te mostrar alguns exemplos? Se não tiver interesse, é só me avisar que não entro mais em contato. 🙂`;

/** Celular brasileiro: DDI 55 + DDD + 9 + 8 dígitos. Só celulares (ou WhatsApp Business em fixo) recebem WhatsApp. */
export const isMobile = (phone) => /^55\d{2}9\d{8}$/.test(phone);

function cityName(city) {
  return city.split(/[,-]/)[0].trim();
}

// ---------- Fontes de dados ----------

/** Google Places API (New) — Text Search. Exige GOOGLE_PLACES_API_KEY. */
export async function searchGooglePlaces({ apiKey, city, categories, maxPerCategory = 60, fetchImpl = fetch }) {
  const results = [];
  for (const category of categories) {
    let pageToken;
    let fetched = 0;
    do {
      const res = await fetchImpl('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.primaryTypeDisplayName,places.businessStatus,places.googleMapsUri,nextPageToken',
        },
        body: JSON.stringify({ textQuery: `${category} em ${city}`, languageCode: 'pt-BR', regionCode: 'BR', pageSize: 20, ...(pageToken && { pageToken }) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new HttpError(502, `Google Places: ${json.error?.message || `HTTP ${res.status}`}`);
      for (const p of json.places || []) {
        if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') continue;
        // Text Search também devolve resultados de cidades vizinhas; mantém só os do endereço pedido.
        if (p.formattedAddress && !p.formattedAddress.toLowerCase().includes(cityName(city).toLowerCase())) continue;
        results.push({
          name: p.displayName?.text || '',
          phone: p.internationalPhoneNumber || p.nationalPhoneNumber || '',
          address: p.formattedAddress || '',
          category: p.primaryTypeDisplayName?.text || category,
          website: p.websiteUri || '',
          mapsUrl: p.googleMapsUri || '',
          source: 'google',
          sourceId: p.id,
        });
      }
      fetched += (json.places || []).length;
      pageToken = json.nextPageToken;
    } while (pageToken && fetched < maxPerCategory);
  }
  return results;
}

/** OpenStreetMap (Overpass API) — gratuito e sem chave, mas com menos empresas cadastradas. */
export async function searchOpenStreetMap({ city, fetchImpl = fetch, endpoint = 'https://overpass-api.de/api/interpreter' }) {
  const name = cityName(city).replace(/"/g, '');
  const keys = ['shop', 'office', 'craft', 'healthcare', 'amenity', 'tourism', 'leisure'];
  const phoneTags = ['phone', 'contact:phone', 'mobile', 'contact:mobile', 'contact:whatsapp'];
  const filters = keys.flatMap((k) => phoneTags.map((t) => `nwr(area.a)["${k}"]["${t}"]["name"];`)).join('');
  const query = `[out:json][timeout:60];area["name"="${name}"]["boundary"="administrative"]["admin_level"="8"]->.a;(${filters});out tags center;`;
  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query),
  });
  if (!res.ok) throw new HttpError(502, `OpenStreetMap: HTTP ${res.status}`);
  const json = await res.json();
  const skip = new Set(['parking', 'bench', 'toilets', 'atm', 'place_of_worship', 'police', 'townhall', 'fuel', 'bank']);
  return (json.elements || [])
    .filter((e) => !skip.has(e.tags?.amenity))
    .map((e) => {
      const t = e.tags || {};
      const phones = phoneTags.map((k) => t[k]).filter(Boolean).join(';').split(/[;,/]/).map((p) => p.trim()).filter(Boolean);
      const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(', ');
      return {
        name: t.name,
        phone: phones.find((p) => isMobile(normalizePhone(p))) || phones[0] || '',
        address: [street, t['addr:suburb'], name].filter(Boolean).join(' - '),
        category: t.shop || t.amenity || t.office || t.craft || t.healthcare || t.tourism || t.leisure || '',
        website: t.website || t['contact:website'] || '',
        mapsUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`,
        source: 'osm',
        sourceId: `${e.type}/${e.id}`,
      };
    });
}

// ---------- Regras de prospecção ----------

export function fillMessage(template, prospect, config) {
  const portfolio = config.portfolioUrl ? `\n\nAlguns trabalhos: ${config.portfolioUrl}` : '';
  const values = {
    empresa: prospect.name || 'sua empresa',
    meu_nome: config.senderName || 'um desenvolvedor',
    cidade: cityName(prospect.city || config.city),
    categoria: prospect.category || '',
    portfolio,
  };
  return template.replace(/\{(\w+)\}/g, (all, k) => values[k] ?? all);
}

export const waLink = (phone, text) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;

const today = (tz, at = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(at);

export class ProspectService {
  constructor({ store, config, fetchImpl = fetch }) {
    this.store = store;
    this.config = config;
    this.fetch = fetchImpl;
  }

  get settings() {
    const p = this.config.prospecting;
    return { ...p, message: this.store.data.settings?.prospectMessage || p.message };
  }

  setMessage(message) {
    this.store.data.settings = { ...(this.store.data.settings || {}), prospectMessage: message };
    this.store.changed('settings', {});
  }

  /** Busca empresas, descarta as que já têm site (se pedido), sem telefone válido ou já cadastradas. */
  async search({ city, categories, onlyWithoutWebsite = true, onlyMobile = true }) {
    const p = this.config.prospecting;
    city ||= p.city;
    const found = p.googleApiKey
      ? await searchGooglePlaces({ apiKey: p.googleApiKey, city, categories: categories?.length ? categories : DEFAULT_CATEGORIES, fetchImpl: this.fetch })
      : await searchOpenStreetMap({ city, fetchImpl: this.fetch });

    const report = { found: found.length, added: 0, skipped: { website: 0, phone: 0, duplicate: 0 } };
    for (const item of found) {
      const phone = normalizePhone(item.phone, this.config.defaultCountryCode);
      if (!phone || (onlyMobile && !isMobile(phone))) { report.skipped.phone++; continue; }
      if (onlyWithoutWebsite && item.website && !/instagram|facebook|wa\.me|whatsapp|linktr/i.test(item.website)) {
        report.skipped.website++; continue;
      }
      if (this.store.findProspectByPhone(phone) || this.store.findLeadByPhone(phone)) { report.skipped.duplicate++; continue; }
      this.store.addProspect({ ...item, phone, city });
      report.added++;
    }
    return report;
  }

  sentToday() {
    const d = today(this.config.timezone);
    return this.store.data.prospects.filter((p) => p.contactedAt && today(this.config.timezone, new Date(p.contactedAt)) === d).length;
  }

  view(prospect) {
    const message = fillMessage(this.settings.message, prospect, this.settings);
    return { ...prospect, mobile: isMobile(prospect.phone), message, link: waLink(prospect.phone, message) };
  }

  /** Registra que a mensagem foi aberta no WhatsApp do celular para envio. */
  markContacted(prospect) {
    const limit = this.settings.dailyLimit;
    if (prospect.status === 'novo' && limit > 0 && this.sentToday() >= limit) {
      throw new HttpError(429, `Limite de ${limit} contatos por dia atingido. Volte amanhã para proteger seu número.`);
    }
    return this.store.updateProspect(prospect.id, {
      status: prospect.status === 'novo' ? 'enviado' : prospect.status,
      contactedAt: prospect.contactedAt || new Date().toISOString(),
    });
  }

  /** Prospect que respondeu com interesse vira lead (com consentimento, pois iniciou a conversa). */
  convert(prospect) {
    const existing = this.store.findLeadByPhone(prospect.phone);
    const lead = existing || this.store.createLead({
      name: prospect.name, phone: prospect.phone, source: 'prospecção', optIn: true, status: 'respondeu',
      tags: ['prospecção', prospect.category].filter(Boolean),
      notes: [prospect.address, prospect.notes].filter(Boolean).join('\n'),
    });
    this.store.updateProspect(prospect.id, { status: 'interessado', leadId: lead.id });
    return lead;
  }
}

