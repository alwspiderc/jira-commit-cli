import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { hasCurrentBlock, isLegacy } from '../core/hook-script.js';
import { aiEnabled } from '../infra/ai.js';
import { hooksPath, repoRoot } from '../infra/git.js';
import { readHook, VERSIONED_HOOKS_DIR } from '../infra/git-hook.js';
import { getMyself, issueTypes } from '../infra/jira/api.js';
import { useSite } from '../infra/jira/client.js';
import { hasDependency, readPackage } from '../infra/package-json.js';
import { findOnPath } from '../infra/path-lookup.js';
import { loadSite } from '../infra/storage/credentials.js';
import { checkProjectConfig, PROJECT_FILE, projectConfigExists, readProjectFile } from '../infra/storage/project-config.js';

const MIN_NODE = 22;

const ok = (detail) => ({ status: 'ok', detail });
const info = (detail) => ({ status: 'info', detail });
const warn = (detail, fix) => ({ status: 'warn', detail, fix });
const fail = (detail, fix) => ({ status: 'fail', detail, fix });

export async function diagnose() {
  const results = [];
  const check = async (name, run) => {
    let result;
    try {
      result = await run();
    } catch (err) {
      result = fail(err.message);
    }
    results.push({ name, ...result });
    return result.status !== 'fail';
  };
  const skip = (name) => results.push({ name, status: 'skip' });

  await check('Node', () => {
    const version = process.versions.node;
    if (Number(version.split('.')[0]) >= MIN_NODE) return ok(`v${version}`);
    return fail(`v${version}`, `Instale o Node ${MIN_NODE} ou mais novo`);
  });

  let root;
  if (!(await check('Repositório git', () => ok((root = repoRoot()))))) return results;

  let cfg;
  const configOk = await check(PROJECT_FILE, () => {
    if (!projectConfigExists()) return fail('não encontrado', 'Rode: jira-commit init');
    cfg = readProjectFile();
    const { errors, warnings } = checkProjectConfig(cfg);
    if (errors.length) return fail(errors.join('; '), `Corrija o ${PROJECT_FILE}`);
    if (warnings.length) return warn(warnings.join('; '), 'São de uma versão mais nova da CLI? Atualize a CLI ou apague esses campos');
    return ok(`projeto ${cfg.projectKey}`);
  });

  let loggedIn = false;
  if (configOk) {
    loggedIn = await check('Login no Jira', () => {
      const site = loadSite(cfg.jiraUrl);
      useSite(site);
      return ok(`${site.url} (${site.type === 'server' ? 'Server/Data Center' : 'Cloud'})`);
    });
  } else skip('Login no Jira');

  let connected = false;
  if (loggedIn) {
    connected = await check('Conexão', async () => {
      try {
        return ok(`como ${(await getMyself()).displayName}`);
      } catch (err) {
        if (err.status === 401) return fail('token inválido ou expirado', 'Rode: jira-commit login');
        return fail(err.message, 'Confira o endereço do Jira e a sua rede');
      }
    });
  } else skip('Conexão');

  if (connected) {
    await check('Projeto no Jira', async () => {
      const names = (await issueTypes(cfg.projectKey)).map((t) => t.name);
      const issueType = cfg.issueType ?? 'Task';
      if (names.includes(issueType)) return ok(`${cfg.projectKey}, tipo "${issueType}"`);
      return warn(`o tipo "${issueType}" não existe. Disponíveis: ${names.join(', ')}`, `Ajuste "issueType" no ${PROJECT_FILE}`);
    });
  } else skip('Projeto no Jira');

  await check('Hook', () => {
    const { path, content } = readHook(root);
    const where = relative(root, path);
    if (!content?.includes('jira-commit')) return fail('não instalado', 'Rode: jira-commit init');
    if (isLegacy(content)) return warn(`${where} é de uma versão antiga (com npx)`, 'Rode: jira-commit init para atualizar');
    if (!hasCurrentBlock(content)) return warn(`${where} foi alterado à mão`, 'Rode: jira-commit init para restaurar o bloco');
    return ok(where);
  });

  await check('Pasta dos hooks', () => {
    const configured = hooksPath();
    if (existsSync(join(root, '.husky'))) {
      if (configured.startsWith('.husky')) return ok(`.husky (core.hooksPath = ${configured})`);
      return fail('o Husky não está ativo neste clone', 'Rode: npm install (o script "prepare" ativa o Husky)');
    }
    if (existsSync(join(root, VERSIONED_HOOKS_DIR))) {
      if (configured === VERSIONED_HOOKS_DIR) return ok(VERSIONED_HOOKS_DIR);
      return fail(`${VERSIONED_HOOKS_DIR} existe, mas não está ativa neste clone`, 'Rode: jira-commit init');
    }
    if (configured) return ok(configured);
    return warn('.git/hooks: o hook vale só nesta máquina', 'Rode: jira-commit init para versionar o hook');
  });

  await check('CLI para o hook', () => {
    if (existsSync(join(root, 'node_modules', '.bin', 'jira-commit'))) return ok('no node_modules do projeto');
    const global = findOnPath('jira-commit');
    if (global) return ok(`global (${global})`);
    return fail('não encontrada: o commit segue sem o menu', 'Instale no projeto (jira-commit init) ou global (npm i -g …)');
  });

  const pkg = readPackage(root);
  if (pkg && hasDependency(pkg.json, 'husky')) {
    await check('Husky', () => {
      if (/\bhusky\b/.test(pkg.json.scripts?.prepare ?? '')) return ok('script "prepare" configurado');
      return warn('falta o script "prepare": "husky"', 'Rode: jira-commit init');
    });
  }

  await check('IA', () => {
    if (cfg && aiEnabled(cfg)) return ok(`ligada (${cfg.aiModel ?? 'modelo padrão'})`);
    return info('desligada: defina ANTHROPIC_API_KEY para ter sugestões');
  });
  return results;
}
