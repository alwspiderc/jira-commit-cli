import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../git.js';
import { CONFIG_DIR } from './paths.js';

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
