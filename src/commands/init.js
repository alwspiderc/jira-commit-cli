import { existsSync, readFileSync, readdirSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { input, select, confirm, c, header, log, withSpinner } from '../ui.js';
import { saveProjectConfig, commitOptions, CONVENTIONAL_TYPES, PROJECT_FILE } from '../config.js';
import { issueTypes } from '../jira.js';
import { repoRoot, hooksDir } from '../git.js';

// Só abre o terminal se existir um (clientes gráficos tipo VS Code não têm /dev/tty)
const HOOK_LINE =
  'if sh -c ": >/dev/tty" 2>/dev/null; then npx --no-install jira-commit hook "$1" "$2" < /dev/tty; fi';

// Commita com a mensagem que o hook monta, sem abrir o editor do git no fim
const COMMIT_SCRIPT = 'git commit --no-edit';

export async function init() {
  const root = repoRoot();
  header('init', c.dim(root));
  const commitlint = usesCommitlint(root);

  if (!existsSync(join(root, PROJECT_FILE))) {
    const projectKey = await input({
      message: `Chave do projeto no Jira ${c.dim('· ex.: APP')}`,
      validate: (v) => /^[A-Z][A-Z0-9]+$/.test(v.toUpperCase()) || 'Chave inválida',
    });
    // Tipos reais do projeto (o "Task" padrão nem sempre existe, ex.: LOJA só tem Mobile, Backend...)
    let types = [];
    try {
      types = await withSpinner('Buscando os tipos de atividade do projeto…', async () =>
        (await issueTypes(projectKey.toUpperCase())).filter((t) => !t.subtask && t.name !== 'Epic'),
      );
    } catch (err) {
      log.warn(`Não consegui listar os tipos do projeto (${err.message}).`);
    }
    const issueType = types.length
      ? await select({
          message: 'Tipo das tarefas criadas sem pai',
          choices: types.map((t) => ({ name: t.name, value: t.name })),
        })
      : await input({ message: 'Tipo das tarefas criadas sem pai', default: 'Task' });
    const summaryPrefix = await input({
      message: `Prefixo do título ${c.dim('· {product} = produto da tarefa pai, vazio = sem prefixo')}`,
      default: `{product} | ${issueType}: `,
    });
    // Com commitlint, o tipo precisa continuar no início: "feat(home): APP-12 adiciona..."
    const format = await input({
      message: `Formato da mensagem ${c.dim('· {key} {message} {prefix} {subject}')}`,
      default: commitlint ? '{prefix}{key} {subject}' : '{key}: {message}',
    });
    saveProjectConfig({ projectKey: projectKey.toUpperCase(), issueType, summaryPrefix, format });
    console.log();
    log.ok(`${c.bold(PROJECT_FILE)} criado ${c.dim('· commite esse arquivo, ele é a config do time')}`);
  }

  // Questionário do commit: também roda em quem já tinha o arquivo, antes dessa seção existir
  const cfg = JSON.parse(readFileSync(join(root, PROJECT_FILE), 'utf8'));
  if (!('commit' in cfg)) {
    cfg.commit = await commitSection(root, commitlint);
    saveProjectConfig(cfg);
    if (cfg.commit) log.ok(`Questionário do commit salvo em ${c.bold(PROJECT_FILE)}`);
  }
  const questions = Boolean(commitOptions(cfg));

  installHook(root, questions && (await removeCz(root)));
  if (questions) await commitScript(root);
  // o snippet do commitlint só aparece enquanto ele ainda não lê o .jira-commit.json
  nextSteps(questions, commitlint && !commitlintReadsConfig(root));
}

/** Tipos e escopos do commit: importados do .cz-config.js, se houver, ou os do Conventional Commits. */
async function commitSection(root, commitlint) {
  const cz = loadCzConfig(root);
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
  return ok ? { types: CONVENTIONAL_TYPES, scopes: [], headerMaxLength: 100 } : false;
}

/** .cz-config.js (cz-customizable) → seção "commit". "feat:     Uma nova…" vira a descrição "Uma nova…". */
export function fromCz(cz) {
  return {
    types: (cz.types ?? []).map((t) => {
      const description = (t.name ?? '').replace(/^\s*[\w-]+:?\s*/, '').trim();
      return description ? { value: t.value, description } : t.value;
    }),
    scopes: (cz.scopes ?? []).map((s) => (typeof s === 'string' ? s : (s.value ?? s.name))).filter(Boolean),
    headerMaxLength: cz.subjectLimit ?? 100,
  };
}

function loadCzConfig(root) {
  const pkg = readPackage(root)?.json;
  const file = join(root, pkg?.config?.['cz-customizable']?.config ?? '.cz-config.js');
  if (!existsSync(file)) return null;
  try {
    return createRequire(join(root, 'package.json'))(file);
  } catch (err) {
    log.warn(`Não consegui ler o ${file} (${err.message}).`);
    return null;
  }
}

/** Pergunta se tira o "cz --hook" do prepare-commit-msg (o questionário agora é do jira-commit). */
async function removeCz(root) {
  const current = readHook(root).content;
  if (!current?.split('\n').some((l) => /\bcz --hook\b/.test(l))) return false;
  return confirm({
    message: `Tirar o commitizen do hook? ${c.dim('· senão as perguntas aparecem duas vezes')}`,
    default: true,
  });
}

function readHook(root) {
  // Husky, se o projeto usar; senão, .git/hooks
  const huskyDir = join(root, '.husky');
  const dir = existsSync(huskyDir) ? huskyDir : join(root, hooksDir());
  const path = join(dir, 'prepare-commit-msg');
  return { dir, path, content: existsSync(path) ? readFileSync(path, 'utf8') : null };
}

function installHook(root, withoutCz) {
  const { dir, path, content: before } = readHook(root);
  let hook = before ?? '#!/bin/sh\n';

  if (withoutCz) {
    hook = hook
      .split('\n')
      .filter((l) => !/\bcz --hook\b/.test(l))
      .join('\n')
      .replace(/^\n+/, '');
  }
  // Já existe um hook (ex.: a padronização de vocês): adiciona sem apagar
  if (!hook.includes('jira-commit')) {
    hook = [hook.trimEnd(), `# jira-commit\n${HOOK_LINE}`].filter(Boolean).join(before ? '\n\n' : '\n') + '\n';
  }

  if (hook === before) {
    log.ok(`Hook já estava instalado ${c.dim(path)}`);
    return;
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, hook);
  chmodSync(path, 0o755);
  log.ok(`${before?.includes('jira-commit') ? 'Hook atualizado' : 'Hook instalado'} ${c.dim(path)}`);
}

/** "npm run commit" = git commit --no-edit: as perguntas do hook e nenhum editor no fim. */
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

  pkg.json.scripts = { ...pkg.json.scripts, commit: COMMIT_SCRIPT };
  // mantém a indentação e a quebra de linha final do arquivo
  const indent = pkg.text.match(/^[ \t]+(?=")/m)?.[0] ?? '  ';
  writeFileSync(pkg.path, JSON.stringify(pkg.json, null, indent) + (pkg.text.endsWith('\n') ? '\n' : ''));
  log.ok(`Script ${c.bold('npm run commit')} criado no package.json`);
}

function readPackage(root) {
  const path = join(root, 'package.json');
  if (!existsSync(path)) return null;
  const text = readFileSync(path, 'utf8');
  return { path, text, json: JSON.parse(text) };
}

function commitlintFiles(root) {
  return readdirSync(root).filter((f) => /^(\.)?commitlint(rc)?\b/.test(f));
}

function usesCommitlint(root) {
  return commitlintFiles(root).length > 0;
}

function commitlintReadsConfig(root) {
  return commitlintFiles(root).some((f) => readFileSync(join(root, f), 'utf8').includes(PROJECT_FILE));
}

function nextSteps(questions, commitlint) {
  console.log();
  log.hint('Pronto! No próximo git commit (pelo terminal) o menu do Jira aparece.');
  if (questions) log.hint('Para commitar sem abrir o editor no fim: npm run commit');
  log.hint('Para conferir suas atividades agora: jira-commit list');
  if (questions && commitlint) {
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
