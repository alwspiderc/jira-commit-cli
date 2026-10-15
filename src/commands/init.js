import { commitOptions, defaultCommitSection, fromCz } from '../core/commit-options.js';
import { commitlintReadsConfig, loadCzConfig, usesCommitlint } from '../infra/commit-tooling.js';
import { repoRoot } from '../infra/git.js';
import { hookHasCz, installHook } from '../infra/git-hook.js';
import { issueTypes } from '../infra/jira/api.js';
import { readPackage, setScript } from '../infra/package-json.js';
import {
  PROJECT_FILE,
  projectConfigExists,
  readProjectFile,
  saveProjectConfig,
} from '../infra/storage/project-config.js';
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

  const removeCz = questions && hookHasCz(root) && (await confirmRemoveCz());
  const { path, result } = installHook(root, { removeCz });
  log.ok(`${HOOK_MESSAGES[result]} ${c.dim(path)}`);

  if (questions) await commitScript(root);
  nextSteps(questions, commitlint && !commitlintReadsConfig(root));
}

async function askProjectConfig(commitlint) {
  const projectKey = (
    await input({
      message: `Chave do projeto no Jira ${c.dim('· ex.: APP')}`,
      validate: (v) => /^[A-Z][A-Z0-9]+$/.test(v.toUpperCase()) || 'Chave inválida',
    })
  ).toUpperCase();
  const issueType = await askIssueType(projectKey);
  const summaryPrefix = await input({
    message: `Prefixo do título ${c.dim('· {product} = produto da tarefa pai, vazio = sem prefixo')}`,
    default: `{product} | ${issueType}: `,
  });
  const format = await input({
    message: `Formato da mensagem ${c.dim('· {key} {message} {prefix} {subject}')}`,
    default: commitlint ? '{prefix}{key} {subject}' : '{key}: {message}',
  });
  return { projectKey, issueType, summaryPrefix, format };
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

function nextSteps(questions, showCommitlintSnippet) {
  console.log();
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
