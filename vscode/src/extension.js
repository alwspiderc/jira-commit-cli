import * as vscode from 'vscode';
import { insertBranchKey } from './commands/insert-branch-key.js';
import { getGitApi } from './git-api.js';
import { createLog, log } from './log.js';
import { createRegistry } from './registry.js';

export async function activate(context) {
  context.subscriptions.push(createLog());
  log.info(`ativada (${context.extension?.packageJSON?.version ?? 'dev'}, VS Code ${vscode.version})`);
  const registry = createRegistry(await getGitApi());
  context.subscriptions.push(
    registry,
    vscode.commands.registerCommand('jiraCommit.insertBranchKey', (sourceControl) => insertBranchKey(registry, sourceControl)),
  );
}

export function deactivate() {}
