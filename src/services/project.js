import { setLanguage } from '../i18n/index.js';
import { useSite } from '../infra/jira/client.js';
import { loadProjectConfig, projectConfigExists, readProjectFile } from '../infra/storage/project-config.js';

export function openProject() {
  applyProjectLanguage();
  const cfg = loadProjectConfig();
  useSite(cfg.jiraUrl);
  return cfg;
}

// Antes de validar: assim até os erros do próprio .jira-commit.json saem no idioma dele
export function applyProjectLanguage() {
  try {
    if (projectConfigExists()) setLanguage(readProjectFile().language);
  } catch {
    // arquivo ilegível: o erro aparece em seguida, no idioma do sistema
  }
}
