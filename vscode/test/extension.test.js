// Carrega o bundle de verdade (dist/extension.cjs) com um módulo "vscode" falso: pega erro de
// carregamento (ex.: import.meta que sobrou) e testa a ligação entre as partes sem abrir o editor
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

function fakeVscode() {
  const calls = { commands: new Map(), context: {}, messages: [] };
  const event = () => () => ({ dispose() {} });
  const vscode = {
    env: { language: 'pt-br' },
    Uri: { file: (fsPath) => ({ fsPath }) },
    extensions: { getExtension: () => ({ isActive: true, exports: { getAPI: () => vscode.__git } }) },
    commands: {
      registerCommand: (id, fn) => {
        calls.commands.set(id, fn);
        return { dispose() {} };
      },
      executeCommand: async (id, key, value) => {
        if (id === 'setContext') calls.context[key] = value;
      },
    },
    window: {
      showErrorMessage: async (text) => void calls.messages.push(['error', text]),
      showWarningMessage: async (text) => void calls.messages.push(['warning', text]),
      showInformationMessage: async (text) => void calls.messages.push(['info', text]),
      showQuickPick: async (items) => items[0],
      setStatusBarMessage: (text) => void calls.messages.push(['status', text]),
      showTextDocument: async () => {},
    },
    workspace: {
      createFileSystemWatcher: () => ({ onDidChange: event(), onDidCreate: event(), onDidDelete: event(), dispose() {} }),
    },
  };
  return { vscode, calls };
}

function fakeRepo(root, branch, message = '') {
  return { rootUri: { fsPath: root }, state: { HEAD: { name: branch } }, inputBox: { value: message } };
}

describe('extensão (bundle)', () => {
  let dir;
  let fake;
  let realLoad;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'jc-ext-'));
    writeFileSync(join(dir, '.jira-commit.json'), JSON.stringify({ projectKey: 'KAN', format: '{prefix}{key} {subject}' }));
    fake = fakeVscode();
    realLoad = Module._load;
    Module._load = function load(request, ...rest) {
      return request === 'vscode' ? fake.vscode : realLoad.call(this, request, ...rest);
    };
  });

  after(() => {
    Module._load = realLoad;
    rmSync(dir, { recursive: true, force: true });
  });

  it('ativa, liga o botão e põe a chave da branch na mensagem', async () => {
    const repo = fakeRepo(dir, 'feature/KAN-7-tema', 'chore(tema): acrescenta o tema escuro');
    fake.vscode.__git = { repositories: [repo], onDidOpenRepository: () => ({ dispose() {} }), onDidCloseRepository: () => ({ dispose() {} }) };

    const extension = require('../dist/extension.cjs');
    const subscriptions = [];
    await extension.activate({ subscriptions });

    assert.equal(fake.calls.context['jiraCommit.configured'], true);
    assert.ok(fake.calls.commands.has('jiraCommit.insertBranchKey'));

    await fake.calls.commands.get('jiraCommit.insertBranchKey')({ rootUri: { fsPath: dir } });
    assert.equal(repo.inputBox.value, 'chore(tema): KAN-7 acrescenta o tema escuro');
    assert.match(fake.calls.messages.at(-1)[1], /KAN-7 na mensagem/);
  });

  it('avisa quando a branch não tem chave, sem mexer na mensagem', async () => {
    const repo = fakeRepo(dir, 'develop', 'docs: x');
    fake.vscode.__git.repositories.splice(0, 1, repo);
    const extension = require('../dist/extension.cjs');
    await extension.activate({ subscriptions: [] });

    await fake.calls.commands.get('jiraCommit.insertBranchKey')({ rootUri: { fsPath: dir } });
    assert.equal(repo.inputBox.value, 'docs: x');
    assert.match(fake.calls.messages.at(-1)[1], /"develop" não tem uma chave KAN-/);
  });
});
