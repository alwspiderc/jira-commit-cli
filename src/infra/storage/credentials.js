import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_DIR } from './paths.js';

const CREDENTIALS_FILE = join(CONFIG_DIR, 'credentials.json');
const OWNER_ONLY = 0o600;

export function saveCredentials(creds) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), { mode: OWNER_ONLY });
}

export function loadCredentials() {
  const file = existsSync(CREDENTIALS_FILE) ? JSON.parse(readFileSync(CREDENTIALS_FILE, 'utf8')) : {};
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

export function issueUrl(key) {
  try {
    return `${loadCredentials().baseUrl}/browse/${key}`;
  } catch {
    return null;
  }
}
