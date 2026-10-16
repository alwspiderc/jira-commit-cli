import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_DIR } from './paths.js';
import { t } from '../../i18n/index.js';

const CREDENTIALS_FILE = join(CONFIG_DIR, 'credentials.json');
const OWNER_ONLY = 0o600;
const OWNER_ONLY_DIR = 0o700;

export const normalizeUrl = (url) => url.trim().replace(/\/+$/, '');

// Fora da própria máquina, http mandaria o token sem criptografia
export const isSecureUrl = (url = '') =>
  /^https:\/\/./i.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url);

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
  mkdirSync(CONFIG_DIR, { recursive: true, mode: OWNER_ONLY_DIR });
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(data, null, 2), { mode: OWNER_ONLY });
  // o mode do writeFileSync só vale na criação: corrige um arquivo antigo com permissão aberta
  chmodSync(CREDENTIALS_FILE, OWNER_ONLY);
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

// Exige JIRA_BASE_URL: cair no jiraUrl do .jira-commit.json deixaria o repositório decidir
// para onde o token vai
export function envSite(env = process.env) {
  const { JIRA_API_TOKEN: token, JIRA_BASE_URL: url, JIRA_EMAIL: email, JIRA_TYPE: type } = env;
  if (!token || !url) return null;
  return { url: normalizeUrl(url), type: type ?? (email ? 'cloud' : 'server'), email, token };
}

// As variáveis JIRA_* têm prioridade sobre o arquivo (útil em CI)
export function loadSite(url) {
  const fromEnv = envSite();
  if (fromEnv) return fromEnv;

  const data = readCredentials();
  const key = url ? normalizeUrl(url) : data.default;
  const site = key && data.sites[key];
  if (!site) {
    throw new Error(url ? t.errors.noLoginFor(key) : t.errors.noCredentials);
  }
  return { url: key, ...site };
}
