import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DEFAULT_MESSAGE } from './prospects.js';

/** Lê um arquivo .env simples (CHAVE=valor) sem sobrescrever variáveis já definidas. */
export function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const list = (v, sep = ',') => (v || '').split(sep).map((s) => s.trim()).filter(Boolean);
const int = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

export function buildConfig(env = process.env) {
  const generatedPassword = env.ADMIN_PASSWORD ? null : crypto.randomBytes(9).toString('base64url');
  return {
    port: int(env.PORT, 3000),
    adminUser: env.ADMIN_USER || 'admin',
    adminPassword: env.ADMIN_PASSWORD || generatedPassword,
    generatedPassword,
    dataFile: path.resolve(env.DATA_FILE || './data/db.json'),
    whatsapp: {
      token: env.WHATSAPP_TOKEN || '',
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || '',
      apiVersion: env.WHATSAPP_API_VERSION || 'v23.0',
      appSecret: env.WHATSAPP_APP_SECRET || '',
      verifyToken: env.WHATSAPP_VERIFY_TOKEN || '',
    },
    intakeToken: env.INTAKE_TOKEN || '',
    defaultCountryCode: env.DEFAULT_COUNTRY_CODE || '55',
    welcome: {
      template: env.WELCOME_TEMPLATE || '',
      language: env.WELCOME_TEMPLATE_LANGUAGE || 'pt_BR',
      params: list(env.WELCOME_TEMPLATE_PARAMS, '|'),
    },
    followup: {
      template: env.FOLLOWUP_TEMPLATE || '',
      language: env.FOLLOWUP_TEMPLATE_LANGUAGE || 'pt_BR',
      params: list(env.FOLLOWUP_TEMPLATE_PARAMS, '|'),
      afterHours: int(env.FOLLOWUP_AFTER_HOURS, 24),
      max: int(env.FOLLOWUP_MAX, 2),
      startHour: int(env.FOLLOWUP_START_HOUR, 9),
      endHour: int(env.FOLLOWUP_END_HOUR, 19),
    },
    timezone: env.TIMEZONE || 'America/Sao_Paulo',
    optOutKeywords: list(env.OPT_OUT_KEYWORDS || 'sair,parar,pare,stop,cancelar,descadastrar').map((k) => k.toLowerCase()),
    optOutReply: env.OPT_OUT_REPLY ?? 'Tudo certo! Você não receberá mais mensagens automáticas nossas.',
    sendIntervalMs: int(env.SEND_INTERVAL_MS, 1200),
    prospecting: {
      city: env.PROSPECT_CITY || 'Petrolina, PE',
      googleApiKey: env.GOOGLE_PLACES_API_KEY || '',
      senderName: env.PROSPECT_SENDER_NAME || '',
      portfolioUrl: env.PROSPECT_PORTFOLIO_URL || '',
      dailyLimit: int(env.PROSPECT_DAILY_LIMIT, 25),
      message: (env.PROSPECT_MESSAGE || '').replace(/\\n/g, '\n') || DEFAULT_MESSAGE,
    },
  };
}
