import * as vscode from 'vscode';
import { basename } from 'node:path';
import { PROJECT_FILE } from '../../src/infra/storage/project-config.js';
import { t } from '../../src/i18n/index.js';
import { applyLanguage } from './i18n.js';
import { loadRepoConfig, normalizeRoot } from './repo-config.js';

// Um contexto por repositório aberto: o repositório do git, a raiz e a config do .jira-commit.json.
// Acompanha os repositórios que o VS Code abre e fecha e recarrega quando o arquivo muda
export function createRegistry(git) {
  const contexts = new Map();
  const warned = new Set();

  const refresh = (repo) => {
    const root = normalizeRoot(repo.rootUri.fsPath);
    const { cfg, error } = loadRepoConfig(root);
    contexts.set(root, { repo, root, cfg, error });
    if (error) warnInvalid(root, error);
    else warned.delete(root);
    updateWhenContext();
  };

  // Avisa uma vez por erro: o watcher dispara várias vezes enquanto a pessoa edita o arquivo
  const warnInvalid = async (root, error) => {
    const id = `${root}\n${error}`;
    if (warned.has(id)) return;
    warned.add(id);
    const open = t.vscode.openConfig;
    const choice = await vscode.window.showErrorMessage(t.vscode.invalidConfig(basename(root), error), open);
    if (choice === open) await vscode.window.showTextDocument(vscode.Uri.file(`${root}/${PROJECT_FILE}`));
  };

  // O botão do Source Control só aparece se algum repositório aberto estiver configurado
  const updateWhenContext = () =>
    vscode.commands.executeCommand('setContext', 'jiraCommit.configured', [...contexts.values()].some((c) => c.cfg));

  const rootOf = (uri) => {
    const path = normalizeRoot(uri.fsPath);
    return [...contexts.keys()].filter((root) => path === root || path.startsWith(`${root}/`)).sort((a, b) => b.length - a.length)[0];
  };

  const watcher = vscode.workspace.createFileSystemWatcher(`**/${PROJECT_FILE}`);
  const onFileChange = (uri) => {
    const root = rootOf(uri);
    if (root) refresh(contexts.get(root).repo);
  };

  applyLanguage(null);
  git.repositories.forEach(refresh);

  const disposables = [
    git.onDidOpenRepository(refresh),
    git.onDidCloseRepository((repo) => {
      contexts.delete(normalizeRoot(repo.rootUri.fsPath));
      updateWhenContext();
    }),
    watcher,
    watcher.onDidChange(onFileChange),
    watcher.onDidCreate(onFileChange),
    watcher.onDidDelete(onFileChange),
  ];

  return {
    all: () => [...contexts.values()],
    get: (uri) => contexts.get(rootOf(uri)),
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
