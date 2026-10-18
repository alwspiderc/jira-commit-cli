import * as vscode from 'vscode';

// A extensão git que vem com o VS Code já sabe quais repositórios estão abertos, a branch de cada
// um, a caixa de mensagem do commit e quando algo muda. Tudo o que a extensão usa dela passa por
// aqui, para isolar a API (versão 1)
export async function getGitApi() {
  const ext = vscode.extensions.getExtension('vscode.git');
  const git = ext.isActive ? ext.exports : await ext.activate();
  return git.getAPI(1);
}

export const branchOf = (repo) => repo.state.HEAD?.name ?? '';
export const readMessage = (repo) => repo.inputBox.value;
export const writeMessage = (repo, value) => {
  repo.inputBox.value = value;
};
