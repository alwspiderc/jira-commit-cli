import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_PRODUCT_SEPARATOR } from '../../core/issue-title.js';
import { validate } from '../../core/validate.js';
import { repoRoot } from '../git.js';

export const PROJECT_FILE = '.jira-commit.json';
export const SCHEMA_REF = './node_modules/jira-commit-cli/schema/jira-commit.schema.json';

const SCHEMA = JSON.parse(readFileSync(new URL('../../../schema/jira-commit.schema.json', import.meta.url), 'utf8'));

const DEFAULTS = {
  issueType: 'Task',
  format: '{key}: {message}',
  maxResults: 20,
  productSeparator: DEFAULT_PRODUCT_SEPARATOR,
  storyPointsScale: [1, 2, 3, 5, 8, 13],
  autoLinkBranch: false,
};

const projectFilePath = () => join(repoRoot(), PROJECT_FILE);

export function projectConfigExists() {
  return existsSync(projectFilePath());
}

export function readProjectFile() {
  const text = readFileSync(projectFilePath(), 'utf8');
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${PROJECT_FILE} não é um JSON válido (${err.message})`);
  }
}

export function checkProjectConfig(raw) {
  return validate(SCHEMA, raw);
}

export function loadProjectConfig() {
  if (!projectConfigExists()) {
    throw new Error(`Arquivo ${PROJECT_FILE} não encontrado. Rode: jira-commit init`);
  }
  const raw = readProjectFile();
  const { errors } = checkProjectConfig(raw);
  if (errors.length) {
    const list = errors.map((e) => `  · ${e}`).join('\n');
    throw new Error(`${PROJECT_FILE} tem ${errors.length} problema(s):\n${list}`);
  }
  return { ...DEFAULTS, ...raw };
}

export function saveProjectConfig(cfg) {
  const schema = existsSync(join(repoRoot(), SCHEMA_REF)) ? { $schema: SCHEMA_REF } : {};
  writeFileSync(projectFilePath(), JSON.stringify({ ...schema, ...cfg }, null, 2) + '\n');
}
