import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { commitOptions, defaultCommitSection, fromCz } from '../core/commit-options.js';
import { commitlintReadsConfig, loadCzConfig, usesCommitlint } from '../infra/commit-tooling.js';
import { repoRoot } from '../infra/git.js';
import { hookHasCz, installHook } from '../infra/git-hook.js';
import { issueTypes } from '../infra/jira/api.js';
import { useSite } from '../infra/jira/client.js';
import { listSites } from '../infra/storage/credentials.js';
import { addDevCommand, binCommand, detectPackageManager, run } from '../infra/package-manager.js';
import { hasDependency, readPackage, setScript, withHusky } from '../infra/package-json.js';
import {
  PROJECT_FILE,
  SCHEMA_REF,
  projectConfigExists,
  readProjectFile,
  saveProjectConfig,
} from '../infra/storage/project-config.js';
import { PACKAGE_NAME, REPOSITORY } from '../version.js';
import { c, confirm, header, input, log, select, withSpinner } from '../ui/index.js';

const COMMIT_SCRIPT = 'git commit --no-edit';

const HOOK_MESSAGES = {
  unchanged: 'Hook já estava instalado',
  installed: 'Hook instalado',
  updated: 'Hook atualizado',
};

export async function init() {
  const root = repoRoot();
  header('init', c.dim(root));
  const commitlint = usesCommitlint(root);

  if (!projectConfigExists()) {
    saveProjectConfig(await askProjectConfig(commitlint));
    console.log();
    log.ok(`${c.bold(PROJECT_FILE)} criado ${c.dim('· commite esse arquivo, ele é a config do time')}`);
  }

  const cfg = readProjectFile();
  if (!('commit' in cfg)) {
    cfg.commit = await commitSection(root, commitlint);
    saveProjectConfig(cfg);
    if (cfg.commit) log.ok(`Questionário do commit salvo em ${c.bold(PROJECT_FILE)}`);
  }
  const questions = Boolean(commitOptions(cfg));

  const installed = await setupProject(root);
  linkSchema(root);

  const removeCz = questions && hookHasCz(root) && (await confirmRemoveCz());
  const { path, result } = installHook(root, { removeCz });
  log.ok(`${HOOK_MESSAGES[result]} ${c.dim(path)}`);

  if (questions) await commitScript(root);
  nextSteps({ questions, installed, showCommitlintSnippet: commitlint && !commitlintReadsConfig(root) });
}

function linkSchema(root) {
  const cfg = readProjectFile();
  if (cfg.$schema || !existsSync(join(root, SCHEMA_REF))) return;
  saveProjectConfig(cfg);
  log.ok(`Autocomplete do ${c.bold(PROJECT_FILE)} ligado no editor ${c.dim('($schema)')}`);
}

async function setupProject(root) {
  const pkg = readPackage(root);
  if (!pkg) {
    log.warn('Sem package.json: o hook fica só em .git/hooks e não vai para o repositório.');
    return false;
  }
  const legacyHusky = Boolean(pkg.json.husky?.hooks);
  if (legacyHusky) log.warn('O projeto usa o Husky 4 (configurado no package.json): o jira-commit não mexe nele.');

  const pm = detectPackageManager(root);
  const packages = [];
  if (!hasDependency(pkg.json, PACKAGE_NAME) && (await confirmCli())) packages.push(REPOSITORY);
  if (!legacyHusky && !hasDependency(pkg.json, 'husky') && (await confirmHusky())) packages.push('husky');
  const installed = packages.length > 0 && (await installPackages(root, pm, packages));

  const huskyInstalled = !legacyHusky && hasDependency(readPackage(root).json, 'husky');
  if (huskyInstalled && !existsSync(join(root, '.husky', '_'))) await setupHusky(root, pm);
  return installed;
}

function confirmCli() {
  return confirm({
    message: `Adicionar o jira-commit ao package.json? ${c.dim('· quem rodar npm install já fica com o hook funcionando')}`,
    default: true,
  });
}

function confirmHusky() {
  return confirm({
    message: `Instalar o Husky? ${c.dim('· o hook passa a ir para o repositório e vale para o time todo')}`,
    default: true,
  });
}

async function installPackages(root, pm, packages) {
  const names = packages.map((p) => (p === REPOSITORY ? 'jira-commit' : p)).join(' e ');
  const command = addDevCommand(pm, packages);
  try {
    await withSpinner(`Instalando ${names}…`, () => run(root, command), { done: `${names} no package.json` });
    return true;
  } catch (err) {
    log.warn(`Não consegui instalar ${names} (${err.message}). Rode à mão: ${command.join(' ')}`);
    return false;
  }
}

// husky init não serve: ele cria um pre-commit rodando "npm test", que o projeto não pediu
async function setupHusky(root, pm) {
  const pkg = readPackage(root);
  const current = pkg.json.scripts?.prepare;
  if (withHusky(current) !== current) setScript(pkg, 'prepare', withHusky(current));
  const command = binCommand(pm, 'husky');
  try {
    await withSpinner('Configurando o Husky…', () => run(root, command), {
      done: `Husky configurado ${c.dim('· script "prepare" e pasta .husky')}`,
    });
  } catch (err) {
    log.warn(`Não consegui configurar o Husky (${err.message}). Rode à mão: ${command.join(' ')}`);
  }
}

async function askProjectConfig(commitlint) {
  const projectKey = (
    await input({
      message: `Chave do projeto no Jira ${c.dim('· ex.: APP')}`,
      validate: (v) => /^[A-Z][A-Z0-9]+$/.test(v.toUpperCase()) || 'Chave inválida',
    })
  ).toUpperCase();
  const jiraUrl = await askJiraUrl();
  useSite(jiraUrl);
  const issueType = await askIssueType(projectKey);
  const summaryPrefix = await input({
    message: `Prefixo do título ${c.dim('· {product} = produto da tarefa pai, vazio = sem prefixo')}`,
    default: `{product} | ${issueType}: `,
  });
  const format = await input({
    message: `Formato da mensagem ${c.dim('· {key} {message} {prefix} {subject}')}`,
    default: commitlint ? '{prefix}{key} {subject}' : '{key}: {message}',
  });
  return { projectKey, ...(jiraUrl && { jiraUrl }), issueType, summaryPrefix, format };
}

async function askJiraUrl() {
  const sites = listSites();
  if (sites.length <= 1) return sites[0]?.url;
  return select({
    message: 'Qual Jira este repositório usa?',
    choices: sites.map((s) => ({ name: `${s.url}${s.isDefault ? c.dim('  · padrão') : ''}`, value: s.url })),
    default: sites.find((s) => s.isDefault)?.url,
  });
}

async function askIssueType(projectKey) {
  const message = 'Tipo das tarefas criadas sem pai';
  let types = [];
  try {
    types = await withSpinner('Buscando os tipos de atividade do projeto…', async () =>
      (await issueTypes(projectKey)).filter((t) => !t.subtask && t.name !== 'Epic'),
    );
  } catch (err) {
    log.warn(`Não consegui listar os tipos do projeto (${err.message}).`);
  }
  return types.length
    ? select({ message, choices: types.map((t) => ({ name: t.name, value: t.name })) })
    : input({ message, default: 'Task' });
}

async function commitSection(root, commitlint) {
  const cz = readCzConfig(root);
  if (cz) {
    const section = fromCz(cz);
    const ok = await confirm({
      message:
        `Importar ${section.types.length} tipos e ${section.scopes.length} escopos do ` +
        `${c.bold('.cz-config.js')}? ${c.dim('· o jira-commit passa a fazer as perguntas do commit')}`,
      default: true,
    });
    return ok ? section : false; // false: não pergunta de novo no próximo init
  }
  const ok = await confirm({
    message: `Perguntar tipo e escopo no commit? ${c.dim('· Conventional Commits, ex.: feat(home): …')}`,
    default: commitlint,
  });
  return ok ? defaultCommitSection() : false;
}

function readCzConfig(root) {
  try {
    return loadCzConfig(root);
  } catch (err) {
    log.warn(err.message);
    return null;
  }
}

function confirmRemoveCz() {
  return confirm({
    message: `Tirar o commitizen do hook? ${c.dim('· senão as perguntas aparecem duas vezes')}`,
    default: true,
  });
}

async function commitScript(root) {
  const pkg = readPackage(root);
  if (!pkg) return;
  const current = pkg.json.scripts?.commit;
  if (current === COMMIT_SCRIPT) return;

  const ok = await confirm({
    message: current
      ? `Trocar o script "commit" (${c.dim(current)}) por "${COMMIT_SCRIPT}"? ${c.dim('· commita sem abrir o editor')}`
      : `Criar o script ${c.bold('npm run commit')}? ${c.dim('· commita sem abrir o editor')}`,
    default: true,
  });
  if (!ok) return;

  setScript(pkg, 'commit', COMMIT_SCRIPT);
  log.ok(`Script ${c.bold('npm run commit')} criado no package.json`);
}

function nextSteps({ questions, installed, showCommitlintSnippet }) {
  console.log();
  if (installed) log.hint('Commite o package.json, o lock e a pasta .husky: assim o hook vale para o time todo.');
  log.hint('Pronto! No próximo git commit (pelo terminal) o menu do Jira aparece.');
  if (questions) log.hint('Para commitar sem abrir o editor no fim: npm run commit');
  log.hint('Para conferir suas atividades agora: jira-commit list');
  if (questions && showCommitlintSnippet) {
    console.log();
    log.hint(`Para o commitlint usar os mesmos tipos e escopos do ${PROJECT_FILE}:`);
    log.hint(`  const { commit } = require('./${PROJECT_FILE}');`);
    log.hint(`  'type-enum': [2, 'always', commit.types.map((t) => t.value ?? t)],`);
    log.hint(`  'scope-enum': [2, 'always', commit.scopes],`);
    log.hint(`  'header-max-length': [2, 'always', commit.headerMaxLength],`);
    log.hint(`  'subject-case': [0], // a descrição começa com a chave em maiúsculas (APP-12 …)`);
  }
  console.log();
}
