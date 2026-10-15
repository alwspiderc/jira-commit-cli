import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { readPackage } from './package-json.js';
import { PROJECT_FILE } from './storage/project-config.js';
import { t } from '../i18n/index.js';

export function loadCzConfig(root) {
  const pkg = readPackage(root)?.json;
  const file = join(root, pkg?.config?.['cz-customizable']?.config ?? '.cz-config.js');
  if (!existsSync(file)) return null;
  try {
    return createRequire(join(root, 'package.json'))(file);
  } catch (err) {
    throw new Error(t.errors.czUnreadable(file, err.message));
  }
}

function commitlintFiles(root) {
  return readdirSync(root).filter((f) => /^(\.)?commitlint(rc)?\b/.test(f));
}

export function usesCommitlint(root) {
  return commitlintFiles(root).length > 0;
}

export function commitlintReadsConfig(root) {
  return commitlintFiles(root).some((f) => readFileSync(join(root, f), 'utf8').includes(PROJECT_FILE));
}
