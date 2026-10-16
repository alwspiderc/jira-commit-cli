import { isSecureUrl, loadSite } from '../storage/credentials.js';
import { t } from '../../i18n/index.js';

const TIMEOUT_MS = 10_000;

export class JiraError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'JiraError';
    this.status = status;
  }
}

let selected = null;

// Aceita um site completo, além do endereço: o login testa a conexão antes de salvar
export function useSite(site) {
  selected = site ?? null;
}

export function currentSite() {
  return typeof selected === 'object' && selected !== null ? selected : loadSite(selected);
}

export function issueUrl(key) {
  try {
    return `${currentSite().url}/browse/${key}`;
  } catch {
    return null;
  }
}

// Público no Cloud e no Server: diz o tipo antes de a pessoa informar as credenciais
export async function deploymentType(url) {
  const res = await fetch(`${url}/rest/api/2/serverInfo`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new JiraError(res.status, t.errors.jiraStatus(res.status, url));
  const { deploymentType: type } = await res.json();
  return type === 'Cloud' ? 'cloud' : 'server';
}

function authorization({ type, email, token }) {
  if (type === 'server') return `Bearer ${token}`;
  return `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
}

export async function request(path, { method = 'GET', body } = {}) {
  const site = currentSite();
  if (!isSecureUrl(site.url)) throw new Error(t.errors.insecureUrl(site.url));
  const res = await fetch(`${site.url}${path}`, {
    method,
    headers: {
      Authorization: authorization(site),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new JiraError(res.status, `${t.errors.jiraStatus(res.status, `${method} ${path}`)}: ${text.slice(0, 300)}`);
  }
  return res.status === 204 ? null : res.json();
}
