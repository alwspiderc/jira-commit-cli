import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_PRODUCT_SEPARATOR } from '../../core/issue-title.js';
import { validate } from '../../core/validate.js';
import { t } from '../../i18n/index.js';

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

const projectFilePath = (root) => join(root, PROJECT_FILE);

export function projectConfigExists(root) {
  return existsSync(projectFilePath(root));
}

export function readProjectFile(root) {
  const text = readFileSync(projectFilePath(root), 'utf8');
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(t.errors.configNotJson(PROJECT_FILE, err.message));
  }
}

export function checkProjectConfig(raw) {
  return validate(SCHEMA, raw);
}

// O root vai junto na config: os flows e services usam para o git e o estado do repositório.
// O schema não aceita campos extras, então um "root" no arquivo nunca chega aqui
export function loadProjectConfig(root) {
  if (!projectConfigExists(root)) {
    throw new Error(t.errors.configMissing(PROJECT_FILE));
  }
  const raw = readProjectFile(root);
  const { errors } = checkProjectConfig(raw);
  if (errors.length) {
    const list = errors.map((e) => `  · ${e}`).join('\n');
    throw new Error(`${t.errors.configProblems(PROJECT_FILE, errors.length)}\n${list}`);
  }
  return { ...DEFAULTS, ...raw, root };
}

export function saveProjectConfig(root, cfg) {
  const schema = existsSync(join(root, SCHEMA_REF)) ? { $schema: SCHEMA_REF } : {};
  writeFileSync(projectFilePath(root), JSON.stringify({ ...schema, ...cfg }, null, 2) + '\n');
}
