import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hasDependency, withHusky } from '../src/infra/package-json.js';
import { envSite, isSecureUrl, migrateCredentials } from '../src/infra/storage/credentials.js';
import { aiEnabled, suggestSubject } from '../src/infra/ai.js';
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
  const AI_VARS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'];
  // Sem as variáveis de ambiente de quem roda os testes; restaura no fim
  const withEnv = async (vars, run) => {
    const saved = Object.fromEntries(AI_VARS.map((name) => [name, process.env[name]]));
    for (const name of AI_VARS) delete process.env[name];
    Object.assign(process.env, vars);
    try {
      return await run();
    } finally {
      for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  };

  // Responde como a API da Anthropic e guarda a chave que chegou no cabeçalho
  const withFakeApi = async (run) => {
    const realFetch = globalThis.fetch;
    const keys = [];
    globalThis.fetch = async (url, init) => {
      keys.push(new Headers(init.headers).get('x-api-key'));
      const message = { id: 'msg', type: 'message', role: 'assistant', model: 'm', stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'adiciona card de benefício' }], usage: { input_tokens: 1, output_tokens: 1 } };
      return new Response(JSON.stringify(message), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    try {
      return { result: await run(), keys };
    } finally {
      globalThis.fetch = realFetch;
    }
  };

  const STAGE = { diff: '+novo', files: ['A card.js'], examples: [] };

  it('fica desligada sem "ai": true, mesmo com a chave', () =>
    withEnv({ ANTHROPIC_API_KEY: 'k' }, () => {
      assert.equal(aiEnabled({}), false);
      assert.equal(aiEnabled({ ai: true }), true);
    }));

  it('liga com a chave recebida, sem variável de ambiente', () =>
    withEnv({}, () => {
      assert.equal(aiEnabled({ ai: true }), false);
      assert.equal(aiEnabled({ ai: true }, { apiKey: 'k' }), true);
      assert.equal(aiEnabled({}, { apiKey: 'k' }), false);
    }));

  it('manda a chave recebida para a API', () =>
    withEnv({ ANTHROPIC_API_KEY: 'da-variavel' }, async () => {
      const { result, keys } = await withFakeApi(() => suggestSubject({ ai: true }, STAGE, { apiKey: 'do-cofre' }));
      assert.equal(result, 'adiciona card de benefício');
      assert.deepEqual(keys, ['do-cofre']);
    }));

  it('sem chave recebida, usa a variável de ambiente', () =>
    withEnv({ ANTHROPIC_API_KEY: 'da-variavel' }, async () => {
      const { keys } = await withFakeApi(() => suggestSubject({ ai: true }, STAGE));
      assert.deepEqual(keys, ['da-variavel']);
    }));

  it('sem chave nenhuma, nem chama a API', () =>
    withEnv({}, async () => {
      const { result, keys } = await withFakeApi(() => suggestSubject({ ai: true }, STAGE));
      assert.equal(result, null);
      assert.deepEqual(keys, []);
    }));
});
