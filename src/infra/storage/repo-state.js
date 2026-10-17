import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_DIR } from './paths.js';

const STATE_FILE = join(CONFIG_DIR, 'state.json');

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

// O estado é separado por repositório: a chave é a raiz dele
export function getRepoState(root) {
  return readState()[root] ?? {};
}

export function setRepoState(root, patch) {
  const all = readState();
  all[root] = { ...all[root], ...patch };
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(all, null, 2));
}
