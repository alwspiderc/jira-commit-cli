import { loadProjectConfig, projectConfigExists } from '../../src/infra/storage/project-config.js';

// O VS Code entrega a pasta como "c:\Users\..."; o git (e a CLI) como "C:/Users/...". O estado
// salvo (última atividade usada etc.) é separado pela raiz do repositório, então as duas precisam
// escrever igual para a extensão e o terminal lembrarem a mesma coisa
export function normalizeRoot(fsPath, platform = process.platform) {
  if (platform !== 'win32') return fsPath;
  return fsPath.replace(/\\/g, '/').replace(/^([a-z]):/, (_, drive) => `${drive.toUpperCase()}:`);
}

// Sem arquivo: { cfg: null }. Com arquivo inválido: { error } com a mensagem da CLI (diz o campo)
export function loadRepoConfig(root) {
  if (!projectConfigExists(root)) return { cfg: null };
  try {
    return { cfg: loadProjectConfig(root) };
  } catch (err) {
    return { cfg: null, error: err.message };
  }
}
