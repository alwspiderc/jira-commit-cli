import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasCz, withHookBlock } from '../core/hook-script.js';
import { hooksDir } from './git.js';

const EXECUTABLE = 0o755;
export const VERSIONED_HOOKS_DIR = '.githooks';

// Husky, se o projeto usar; senão, o core.hooksPath (ex.: .githooks) ou o .git/hooks
export async function readHook(root) {
  const huskyDir = join(root, '.husky');
  const dir = existsSync(huskyDir) ? huskyDir : join(root, await hooksDir(root));
  const path = join(dir, 'prepare-commit-msg');
  return { dir, path, content: existsSync(path) ? readFileSync(path, 'utf8') : null };
}

export async function hookHasCz(root) {
  return hasCz((await readHook(root)).content ?? '');
}

// Trocar o core.hooksPath desligaria os hooks que já estão em .git/hooks (fora os .sample e o nosso)
export function customGitHooks(root) {
  const dir = join(root, '.git', 'hooks');
  if (!existsSync(dir)) return [];
  const ours = (file) => file === 'prepare-commit-msg' && readFileSync(join(dir, file), 'utf8').includes('jira-commit');
  return readdirSync(dir).filter((f) => !f.endsWith('.sample') && !ours(f));
}

export async function installHook(root, { removeCz = false } = {}) {
  const { dir, path, content: before } = await readHook(root);
  const hook = withHookBlock(before, { removeCz });
  if (hook === before) return { path, result: 'unchanged' };
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, hook);
  chmodSync(path, EXECUTABLE);
  return { path, result: before?.includes('jira-commit') ? 'updated' : 'installed' };
}
