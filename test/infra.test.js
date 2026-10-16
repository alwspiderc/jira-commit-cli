import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hasDependency, withHusky } from '../src/infra/package-json.js';
import { envSite, isSecureUrl, migrateCredentials } from '../src/infra/storage/credentials.js';
import { aiEnabled } from '../src/infra/ai.js';
import { addDevCommand, binCommand, detectPackageManager } from '../src/infra/package-manager.js';

describe('package-json', () => {
  it('acha a dependência em dependencies ou devDependencies', () => {
    assert.ok(hasDependency({ devDependencies: { husky: '^9' } }, 'husky'));
    assert.ok(hasDependency({ dependencies: { husky: '^9' } }, 'husky'));
    assert.ok(!hasDependency({}, 'husky'));
  });

  it('acrescenta o husky ao prepare sem apagar o que existe', () => {
    assert.equal(withHusky(undefined), 'husky');
    assert.equal(withHusky('npm run build'), 'npm run build && husky');
    assert.equal(withHusky('husky install'), 'husky install');
  });
});

describe('package-manager', () => {
  const withLockfile = (file, fn) => {
    const dir = mkdtempSync(join(tmpdir(), 'jira-commit-'));
    try {
      if (file) writeFileSync(join(dir, file), '');
      return fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('detecta o gerenciador pelo lockfile', () => {
    assert.equal(withLockfile('pnpm-lock.yaml', detectPackageManager), 'pnpm');
    assert.equal(withLockfile('yarn.lock', detectPackageManager), 'yarn');
    assert.equal(withLockfile('package-lock.json', detectPackageManager), 'npm');
    assert.equal(withLockfile(null, detectPackageManager), 'npm');
  });

  it('monta os comandos de cada gerenciador', () => {
    assert.deepEqual(addDevCommand('npm', ['husky']), ['npm', 'install', '--save-dev', 'husky']);
    assert.deepEqual(addDevCommand('yarn', ['husky']), ['yarn', 'add', '--dev', 'husky']);
    assert.deepEqual(binCommand('pnpm', 'husky'), ['pnpm', 'exec', 'husky']);
    assert.deepEqual(binCommand('npm', 'husky'), ['npx', '--no-install', 'husky']);
  });
});

describe('credentials', () => {
  it('converte o formato antigo de um site só', () => {
    assert.deepEqual(migrateCredentials({ baseUrl: 'https://a.atlassian.net/', email: 'e@x', token: 't' }), {
      default: 'https://a.atlassian.net',
      sites: { 'https://a.atlassian.net': { type: 'cloud', email: 'e@x', token: 't' } },
    });
  });

  it('mantém o formato novo', () => {
    const data = { default: 'https://a', sites: { 'https://a': { type: 'server', token: 't' } } };
    assert.deepEqual(migrateCredentials(data), data);
    assert.deepEqual(migrateCredentials({}), { default: null, sites: {} });
  });

  it('só usa o token das variáveis com JIRA_BASE_URL definida', () => {
    assert.equal(envSite({ JIRA_API_TOKEN: 't' }), null);
    assert.deepEqual(envSite({ JIRA_API_TOKEN: 't', JIRA_BASE_URL: 'https://a/', JIRA_EMAIL: 'e@x' }), {
      url: 'https://a',
      type: 'cloud',
      email: 'e@x',
      token: 't',
    });
  });

  it('aceita http só no localhost', () => {
    assert.ok(isSecureUrl('https://a.atlassian.net'));
    assert.ok(isSecureUrl('http://localhost:8080'));
    assert.ok(isSecureUrl('http://127.0.0.1/jira'));
    assert.ok(!isSecureUrl('http://jira.empresa.com'));
    assert.ok(!isSecureUrl('http://localhost.evil.com'));
    assert.ok(!isSecureUrl('https://'));
  });
});

describe('ai', () => {
  it('fica desligada sem "ai": true, mesmo com a chave', () => {
    const key = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'k';
    try {
      assert.equal(aiEnabled({}), false);
      assert.equal(aiEnabled({ ai: true }), true);
    } finally {
      if (key === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = key;
    }
  });
});
