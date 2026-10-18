import * as vscode from 'vscode';

// Canal "jira-commit" no painel Output: o que a extensão encontrou e decidiu. Nunca registra
// token nem cabeçalho de requisição
let channel;

export function createLog() {
  channel = vscode.window.createOutputChannel('jira-commit', { log: true });
  return channel;
}

export const log = {
  info: (text) => channel?.info(text),
  warn: (text) => channel?.warn(text),
  error: (text) => channel?.error(text),
};
