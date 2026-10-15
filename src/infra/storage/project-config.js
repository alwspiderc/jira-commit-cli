import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../git.js';

export const PROJECT_FILE = '.jira-commit.json';

const DEFAULTS = {
  issueType: 'Task',
  format: '{key}: {message}',
  maxResults: 20,
};

const projectFilePath = () => join(repoRoot(), PROJECT_FILE);

export function projectConfigExists() {
  return existsSync(projectFilePath());
}

export function readProjectFile() {
  return JSON.parse(readFileSync(projectFilePath(), 'utf8'));
}

export function loadProjectConfig() {
  if (!projectConfigExists()) {
    throw new Error(`Arquivo ${PROJECT_FILE} não encontrado. Rode: jira-commit init`);
  }
  const cfg = { ...DEFAULTS, ...readProjectFile() };
  if (!cfg.projectKey) throw new Error(`"projectKey" faltando em ${PROJECT_FILE}`);
  return cfg;
}

export function saveProjectConfig(cfg) {
  writeFileSync(projectFilePath(), JSON.stringify(cfg, null, 2) + '\n');
}
