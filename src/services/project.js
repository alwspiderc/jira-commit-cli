import { setLanguage } from '../i18n/index.js';
import { repoRoot } from '../infra/git.js';
import { useSite } from '../infra/jira/client.js';
import { loadProjectConfig, projectConfigExists, readProjectFile } from '../infra/storage/project-config.js';

// Sem root, usa o repositório da pasta atual (o caso da CLI)
export async function openProject(root) {
  root ??= await repoRoot();
  applyProjectLanguage(root);
  const cfg = loadProjectConfig(root);
  useSite(cfg.jiraUrl);
  return cfg;
}

// Antes de validar: assim até os erros do próprio .jira-commit.json saem no idioma dele
export function applyProjectLanguage(root) {
  try {
    if (projectConfigExists(root)) setLanguage(readProjectFile(root).language);
  } catch {
    // arquivo ilegível: o erro aparece em seguida, no idioma do sistema
  }
}
