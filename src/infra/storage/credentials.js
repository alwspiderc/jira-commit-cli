import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_DIR } from './paths.js';

const CREDENTIALS_FILE = join(CONFIG_DIR, 'credentials.json');
const OWNER_ONLY = 0o600;

export const normalizeUrl = (url) => url.trim().replace(/\/+$/, '');

// Antes da v0.2 o arquivo guardava um site só: { baseUrl, email, token }
export function migrateCredentials(data) {
  if (!data.baseUrl) return { default: data.default ?? null, sites: data.sites ?? {} };
  const url = normalizeUrl(data.baseUrl);
  return { default: url, sites: { [url]: { type: 'cloud', email: data.email, token: data.token } } };
}

function readCredentials() {
  if (!existsSync(CREDENTIALS_FILE)) return { default: null, sites: {} };
  const raw = JSON.parse(readFileSync(CREDENTIALS_FILE, 'utf8'));
  const data = migrateCredentials(raw);
  if (raw.baseUrl) writeCredentials(data);
  return data;
}

function writeCredentials(data) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(data, null, 2), { mode: OWNER_ONLY });
}

export function listSites() {
  const data = readCredentials();
  return Object.entries(data.sites).map(([url, site]) => ({ url, ...site, isDefault: url === data.default }));
}

export function saveSite({ url, makeDefault = false, ...site }) {
  const data = readCredentials();
  const key = normalizeUrl(url);
  data.sites[key] = site;
  if (makeDefault || !data.default) data.default = key;
  writeCredentials(data);
}

function envSite(url) {
  const token = process.env.JIRA_API_TOKEN;
  const envUrl = process.env.JIRA_BASE_URL ?? url;
  if (!token || !envUrl) return null;
  const email = process.env.JIRA_EMAIL;
  return { url: normalizeUrl(envUrl), type: process.env.JIRA_TYPE ?? (email ? 'cloud' : 'server'), email, token };
}

// As variáveis JIRA_* têm prioridade sobre o arquivo (útil em CI)
export function loadSite(url) {
  const fromEnv = envSite(url);
  if (fromEnv) return fromEnv;

  const data = readCredentials();
  const key = url ? normalizeUrl(url) : data.default;
  const site = key && data.sites[key];
  if (!site) {
    throw new Error(
      url ? `Sem login para ${key}. Rode: jira-commit login` : 'Credenciais do Jira não encontradas. Rode: jira-commit login',
    );
  }
  return { url: key, ...site };
}
