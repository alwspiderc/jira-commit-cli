import { isSecureUrl, loadSite } from '../storage/credentials.js';
import { t } from '../../i18n/index.js';
import { DIALECTS } from './dialects.js';

const TIMEOUT_MS = 10_000;

export class JiraError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'JiraError';
    this.status = status;
  }
}

function authorization({ type, email, token }) {
  if (type === 'server') return `Bearer ${token}`;
  return `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
}

// Um cliente por Jira: quem abre vários repositórios ao mesmo tempo (ex.: uma extensão de editor)
// usa um para cada, sem disputar um site global. Aceita o site completo ou só o endereço (ou nada,
// para o padrão); o endereço só é resolvido no primeiro uso, então um login faltando vira erro na
// primeira chamada ao Jira, não ao criar o cliente
export function createJiraClient(siteOrUrl = null) {
  let resolved = typeof siteOrUrl === 'object' && siteOrUrl !== null ? siteOrUrl : null;
  const site = () => (resolved ??= loadSite(siteOrUrl));

  return {
    site,
    dialect: () => DIALECTS[site().type] ?? DIALECTS.cloud,

    issueUrl(key) {
      try {
        return `${site().url}/browse/${key}`;
      } catch {
        return null;
      }
    },

    async request(path, { method = 'GET', body } = {}) {
      const { url } = site();
      if (!isSecureUrl(url)) throw new Error(t.errors.insecureUrl(url));
      const res = await fetch(`${url}${path}`, {
        method,
        headers: {
          Authorization: authorization(site()),
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
    },
  };
}

// Cliente padrão, para a CLI: um processo atende um repositório só
let current = createJiraClient();

// Aceita um site completo, além do endereço: o login testa a conexão antes de salvar
export function useSite(site) {
  current = createJiraClient(site ?? null);
}

export const defaultClient = () => current;
export const currentSite = () => current.site();
export const issueUrl = (key) => current.issueUrl(key);
export const request = (path, options) => current.request(path, options);

// Público no Cloud e no Server: diz o tipo antes de a pessoa informar as credenciais
export async function deploymentType(url) {
  const res = await fetch(`${url}/rest/api/2/serverInfo`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new JiraError(res.status, t.errors.jiraStatus(res.status, url));
  const { deploymentType: type } = await res.json();
  return type === 'Cloud' ? 'cloud' : 'server';
}
