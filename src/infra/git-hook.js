import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hooksDir } from './git.js';

// Clientes gráficos (ex.: VS Code) não têm /dev/tty: sem a checagem, o commit travaria
const HOOK_LINE =
  'if sh -c ": >/dev/tty" 2>/dev/null; then npx --no-install jira-commit hook "$1" "$2" < /dev/tty; fi';
const CZ_HOOK = /\bcz --hook\b/;
const EXECUTABLE = 0o755;

function readHook(root) {
  const huskyDir = join(root, '.husky');
  const dir = existsSync(huskyDir) ? huskyDir : join(root, hooksDir());
  const path = join(dir, 'prepare-commit-msg');
  return { dir, path, content: existsSync(path) ? readFileSync(path, 'utf8') : null };
}

export function hookHasCz(root) {
  return Boolean(readHook(root).content?.split('\n').some((l) => CZ_HOOK.test(l)));
}

export function installHook(root, { removeCz = false } = {}) {
  const { dir, path, content: before } = readHook(root);
  let hook = before ?? '#!/bin/sh\n';

  if (removeCz) {
    hook = hook
      .split('\n')
      .filter((l) => !CZ_HOOK.test(l))
      .join('\n')
      .replace(/^\n+/, '');
  }
  if (!hook.includes('jira-commit')) {
    hook = [hook.trimEnd(), `# jira-commit\n${HOOK_LINE}`].filter(Boolean).join(before ? '\n\n' : '\n') + '\n';
  }

  if (hook === before) return { path, result: 'unchanged' };
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, hook);
  chmodSync(path, EXECUTABLE);
  return { path, result: before?.includes('jira-commit') ? 'updated' : 'installed' };
}
