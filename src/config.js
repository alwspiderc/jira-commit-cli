import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from './git.js';
import { projectStatuses } from './jira.js';

// ---------- Credenciais (globais, uma vez por máquina) ----------

const CONFIG_DIR = join(homedir(), '.config', 'jira-commit');
const CREDENTIALS_FILE = join(CONFIG_DIR, 'credentials.json');

export function saveCredentials(creds) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  // 0o600: só o próprio usuário lê o token
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

export function loadCredentials() {
  const file = existsSync(CREDENTIALS_FILE)
    ? JSON.parse(readFileSync(CREDENTIALS_FILE, 'utf8'))
    : {};

  // Variáveis de ambiente têm prioridade (útil em CI ou pra testar)
  const creds = {
    baseUrl: process.env.JIRA_BASE_URL ?? file.baseUrl,
    email: process.env.JIRA_EMAIL ?? file.email,
    token: process.env.JIRA_API_TOKEN ?? file.token,
  };

  if (!creds.baseUrl || !creds.email || !creds.token) {
    throw new Error('Credenciais do Jira não encontradas. Rode: jira-commit login');
  }
  return creds;
}

// ---------- Estado local (ex.: último pai usado), por repositório ----------

const STATE_FILE = join(CONFIG_DIR, 'state.json');

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function getRepoState() {
  return readState()[repoRoot()] ?? {};
}

export function setRepoState(patch) {
  const all = readState();
  all[repoRoot()] = { ...all[repoRoot()], ...patch };
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(all, null, 2));
}

// ---------- Config do projeto (commitada no repositório) ----------

export const PROJECT_FILE = '.jira-commit.json';

const DEFAULTS = {
  issueType: 'Task',
  // {key} = chave da issue, {message} = mensagem que a pessoa digitou
  format: '{key}: {message}',
  maxResults: 20,
};

export function loadProjectConfig() {
  const path = join(repoRoot(), PROJECT_FILE);
  if (!existsSync(path)) {
    throw new Error(`Arquivo ${PROJECT_FILE} não encontrado. Rode: jira-commit init`);
  }
  const cfg = { ...DEFAULTS, ...JSON.parse(readFileSync(path, 'utf8')) };
  if (!cfg.projectKey) throw new Error(`"projectKey" faltando em ${PROJECT_FILE}`);
  return cfg;
}

/**
 * Monta o JQL da busca.
 * - padrão: "jql" do arquivo, se houver; senão filtra por "statuses" (ou tudo que não está Done)
 * - { all: true }: todas as abertas, ignorando "statuses" e "jql"
 * - { status: 'X' }: só o status X
 */
export async function buildJql(cfg, { all = false, status } = {}) {
  if (cfg.jql && !all && !status) return cfg.jql;

  let filter = 'statusCategory != Done';
  const names = status ? [status] : !all ? cfg.statuses : null;
  if (names?.length) filter = `status IN (${(await statusIds(cfg.projectKey, names)).join(', ')})`;

  return (
    `project = ${cfg.projectKey} AND assignee = currentUser() ` +
    `AND ${filter} ORDER BY updated DESC`
  );
}

/**
 * O JQL só entende o nome original do status ("To Do"), mas a tela mostra o traduzido
 * ("Tarefas pendentes"). Por ID funciona em qualquer idioma.
 */
async function statusIds(projectKey, names) {
  const statuses = await projectStatuses(projectKey);
  const norm = (s) => s.trim().toLowerCase();
  return names.map((name) => {
    const found = statuses.find((s) => norm(s.name) === norm(name));
    if (!found) {
      const valid = statuses.map((s) => `"${s.name}"`).join(', ');
      throw new Error(`Status "${name}" não existe em ${projectKey}. Disponíveis: ${valid}`);
    }
    return found.id;
  });
}

export function saveProjectConfig(cfg) {
  writeFileSync(join(repoRoot(), PROJECT_FILE), JSON.stringify(cfg, null, 2) + '\n');
}
