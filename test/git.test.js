import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  currentBranch,
  hooksPath,
  recentSubjects,
  repoRoot,
  setHooksPath,
  stagedDiff,
  stagedFiles,
} from '../src/infra/git.js';
import { installHook, readHook } from '../src/infra/git-hook.js';
import { loadProjectConfig, projectConfigExists, saveProjectConfig } from '../src/infra/storage/project-config.js';

// Os testes rodam com a pasta atual no repositório da CLI: passar o cwd de um repositório
// temporário prova que as funções não dependem da pasta atual do processo
const gitIn = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, stdio: 'pipe' });

function tempRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'jira-commit-git-'));
  gitIn(dir, 'init', '-q', '-b', 'feature/DEMO-5-login');
  writeFileSync(join(dir, 'marker.txt'), 'x\n');
  gitIn(dir, 'add', '.');
  gitIn(dir, 'commit', '-q', '-m', 'feat(home): DEMO-1 adiciona card');
  gitIn(dir, 'commit', '-q', '--allow-empty', '-m', 'fix: corrige foco');
  gitIn(dir, 'commit', '-q', '--allow-empty', '-m', 'mensagem fora do padrão');
  return dir;
}

describe('git', () => {
  let repo;
  let outside;
  before(() => {
    repo = tempRepo();
    outside = mkdtempSync(join(tmpdir(), 'jira-commit-nogit-'));
  });
  after(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it('acha a raiz do repositório pelo cwd', async () => {
    const root = await repoRoot(repo);
    assert.ok(existsSync(join(root, 'marker.txt')));
  });

  it('avisa quando o cwd não é um repositório', async () => {
    await assert.rejects(repoRoot(outside), /git/i);
  });

  it('lê a branch do repositório do cwd', async () => {
    assert.equal(await currentBranch(repo), 'feature/DEMO-5-login');
    assert.equal(await currentBranch(outside), '');
  });

  it('lista os arquivos e o diff do stage', async () => {
    writeFileSync(join(repo, 'novo.txt'), 'conteúdo novo\n');
    gitIn(repo, 'add', 'novo.txt');
    try {
      assert.deepEqual(await stagedFiles(repo), ['A novo.txt']);
      assert.match(await stagedDiff(repo), /\+conteúdo novo/);
      assert.match(await stagedDiff(repo, 20), /\[\.\.\. diff cortado \.\.\.\]$/);
    } finally {
      gitIn(repo, 'reset', '-q', 'novo.txt');
      rmSync(join(repo, 'novo.txt'));
    }
  });

  it('devolve vazio fora de um repositório, sem lançar erro', async () => {
    assert.deepEqual(await stagedFiles(outside), []);
    assert.equal(await stagedDiff(outside), '');
    assert.deepEqual(await recentSubjects(outside), []);
  });

  it('pega as últimas descrições sem tipo nem chave', async () => {
    assert.deepEqual(await recentSubjects(repo), ['corrige foco', 'adiciona card']);
    assert.deepEqual(await recentSubjects(repo, 1), ['corrige foco']);
  });

  it('lê e grava o core.hooksPath', async () => {
    assert.equal(await hooksPath(repo), '');
    await setHooksPath(repo, '.githooks');
    assert.equal(await hooksPath(repo), '.githooks');
    gitIn(repo, 'config', '--unset', 'core.hooksPath');
  });

  it('não usa chamadas síncronas, que travariam um editor', () => {
    const source = readFileSync(new URL('../src/infra/git.js', import.meta.url), 'utf8');
    assert.ok(!/\bexecSync\b|\bexecFileSync\b|\bspawnSync\b/.test(source));
  });
});

describe('git-hook', () => {
  let repo;
  before(() => {
    repo = tempRepo();
  });
  after(() => rmSync(repo, { recursive: true, force: true }));

  it('instala o hook no .git/hooks do repositório indicado', async () => {
    const { path, content } = await readHook(repo);
    assert.equal(content, null);
    assert.ok(path.endsWith(join('.git', 'hooks', 'prepare-commit-msg')));

    assert.equal((await installHook(repo)).result, 'installed');
    assert.match(readFileSync(path, 'utf8'), /jira-commit/);
    assert.equal((await installHook(repo)).result, 'unchanged');
  });
});

describe('project-config', () => {
  let root;
  before(() => {
    root = mkdtempSync(join(tmpdir(), 'jira-commit-cfg-'));
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  it('lê o .jira-commit.json da raiz indicada e guarda a raiz na config', () => {
    assert.equal(projectConfigExists(root), false);
    saveProjectConfig(root, { projectKey: 'DEMO' });
    assert.equal(projectConfigExists(root), true);

    const cfg = loadProjectConfig(root);
    assert.equal(cfg.projectKey, 'DEMO');
    assert.equal(cfg.maxResults, 20);
    assert.equal(cfg.root, root);
  });

  it('não grava a raiz no arquivo', () => {
    saveProjectConfig(root, { projectKey: 'DEMO' });
    assert.ok(!('root' in JSON.parse(readFileSync(join(root, '.jira-commit.json'), 'utf8'))));
  });
});
