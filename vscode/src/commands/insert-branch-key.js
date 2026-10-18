import * as vscode from 'vscode';
import { basename } from 'node:path';
import { issueKeyRegex } from '../../../src/core/commit-message.js';
import { t } from '../../../src/i18n/index.js';
import { branchOf, readMessage, writeMessage } from '../git-api.js';
import { applyLanguage } from '../i18n.js';
import { linkMessage } from '../message.js';

// Primeiro comando da extensão (fase 1): lê a chave do nome da branch (ex.: feature/KAN-7-tema)
// e põe na mensagem do commit. Serve para provar o caminho até a caixa do Source Control
export async function insertBranchKey(registry, sourceControl) {
  const ctx = await pickContext(registry, sourceControl);
  if (!ctx) return;
  applyLanguage(ctx.cfg);
  if (!ctx.cfg) {
    vscode.window.showWarningMessage(ctx.error ? t.vscode.invalidConfig(basename(ctx.root), ctx.error) : t.vscode.notConfigured(basename(ctx.root)));
    return;
  }

  const branch = branchOf(ctx.repo);
  if (!branch) {
    vscode.window.showWarningMessage(t.vscode.noBranch);
    return;
  }
  const key = branch.match(issueKeyRegex(ctx.cfg.projectKey))?.[0];
  if (!key) {
    vscode.window.showInformationMessage(t.vscode.noBranchKey(branch, ctx.cfg.projectKey));
    return;
  }

  writeMessage(ctx.repo, linkMessage(ctx.cfg, readMessage(ctx.repo), key));
  vscode.window.setStatusBarMessage(`$(check) ${t.vscode.keyInserted(key)}`, 3000);
}

// Pelo botão do Source Control, vem o repositório clicado. Pela paleta: o único configurado, ou
// a pessoa escolhe
async function pickContext(registry, sourceControl) {
  if (sourceControl?.rootUri) return registry.get(sourceControl.rootUri);
  const all = registry.all();
  const configured = all.filter((c) => c.cfg);
  if (configured.length === 1) return configured[0];
  if (!all.length) return undefined;
  const picked = await vscode.window.showQuickPick(
    all.map((ctx) => ({ label: basename(ctx.root), description: ctx.root, ctx })),
    { placeHolder: t.vscode.pickRepository },
  );
  return picked?.ctx;
}
