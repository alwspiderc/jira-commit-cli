import { readFileSync, writeFileSync } from 'node:fs';
import { styleText } from 'node:util';
import { select, input, confirm, Separator } from '@inquirer/prompts';
import { loadProjectConfig, buildJql, getRepoState, setRepoState } from '../config.js';
import {
  searchIssues,
  createIssue,
  getIssue,
  issueTypes,
  getTransitions,
  transitionIssue,
} from '../jira.js';
import { currentBranch, stagedFiles, stagedDiff } from '../git.js';
import { commitDescription } from '../adf.js';
import { suggestTitle, aiEnabled } from '../ai.js';
import { buildTree, treeLines } from '../tree.js';

const OTHER_STATUSES = '__other__';
const NEW = '__new__';
const MANUAL = '__manual__';
const SKIP = '__skip__';

/**
 * Chamado pelo git como: jira-commit hook <arquivo-da-mensagem> <origem>
 * origem: vazio (editor), "message" (-m), "template", "merge", "squash" ou "commit" (--amend)
 */
export async function hook(msgFile, source) {
  if (!msgFile) throw new Error('Uso: jira-commit hook <arquivo-msg> [origem]');

  // Merge, squash e amend já têm mensagem pronta: não mexe
  if (['merge', 'squash', 'commit'].includes(source)) return;

  const cfg = loadProjectConfig();
  const raw = readFileSync(msgFile, 'utf8');
  const lines = raw.split('\n');
  const firstLine = lines[0].trim();

  const keyRegex = new RegExp(`\\b${cfg.projectKey}-\\d+\\b`);
  if (keyRegex.test(firstLine)) return; // já tem a tag, nada a fazer

  const { prefix, subject } = splitConventional(firstLine);

  const body = commitBody(lines);
  const key = await chooseIssue(cfg, { subject, body }, keyRegex);
  if (!key) return; // pessoa escolheu pular

  lines[0] = cfg.format
    .replace('{key}', key)
    .replace('{message}', firstLine)
    .replace('{prefix}', prefix)
    .replace('{subject}', subject);
  writeFileSync(msgFile, lines.join('\n'));
  console.log(`✔ Commit vinculado a ${key}`);
}

/**
 * Separa "feat(home): adiciona card" em prefix "feat(home): " e subject "adiciona card".
 * Sem prefixo Conventional Commits, prefix fica vazio e subject é a linha inteira.
 */
export function splitConventional(line) {
  const m = line.match(/^(\w+(?:\([^)]*\))?!?:\s*)(.*)$/);
  return m ? { prefix: m[1], subject: m[2] } : { prefix: '', subject: line };
}

/** Corpo do commit: tudo depois da 1ª linha, sem comentários do git nem o que vem após a tesoura. */
export function commitBody(lines) {
  const out = [];
  for (const line of lines.slice(1)) {
    if (/^# -+ >8 -+/.test(line)) break;
    if (!line.startsWith('#')) out.push(line);
  }
  return out.join('\n').trim();
}

async function chooseIssue(cfg, commit, keyRegex) {
  // Se a branch tiver uma chave (ex.: feature/PROJ-42-login), ela vem primeiro
  const branchKey = currentBranch().match(keyRegex)?.[0];
  let all = false;
  let choice;
  let issues = [];

  do {
    try {
      issues = await searchIssues(await buildJql(cfg, { all }), cfg.maxResults);
    } catch (err) {
      console.warn(`⚠ Não consegui falar com o Jira (${err.message}).`);
      return manualKey(cfg, keyRegex);
    }
    const taskChoices = issueChoices(issues, branchKey);
    const firstTask = taskChoices.find((c) => c.value)?.value;

    choice = await select({
      message: all
        ? 'Qual atividade do Jira é esse commit? ' + style('dim', '(todos os status)')
        : 'Qual atividade do Jira é esse commit?',
      pageSize: 15,
      loop: false, // para no fim da lista em vez de voltar ao começo
      // cursor começa na task da branch ou na primeira task, nunca numa ação
      default: issues.some((i) => i.key === branchKey) ? branchKey : firstTask,
      choices: [
        { name: style('green', '＋ Criar nova atividade a partir deste commit'), value: NEW },
        all
          ? { name: style('yellow', '← Voltar aos status padrão'), value: OTHER_STATUSES }
          : { name: style('yellow', '⋯ Ver tasks de outros status'), value: OTHER_STATUSES },
        { name: style('blue', '✎ Digitar a chave manualmente'), value: MANUAL },
        { name: style('gray', '↷ Pular (commit sem tag)'), value: SKIP },
        new Separator(' '),
        ...taskChoices,
      ],
    });
    if (choice === OTHER_STATUSES) all = !all;
  } while (choice === OTHER_STATUSES);

  if (choice === SKIP) return null;
  if (choice === MANUAL) return manualKey(cfg, keyRegex);
  if (choice === NEW) return createFromCommit(cfg, commit, issues, keyRegex);
  return choice;
}

const style = (format, text) => styleText(format, text);

/** Tarefas com as subtarefas penduradas embaixo; a família da branch vem primeiro. */
export function issueChoices(issues, branchKey) {
  if (!issues.length) return [new Separator(style('dim', ' Nenhuma task encontrada'))];

  // o select põe "❯ " antes das opções e só " " antes dos separadores
  return treeLines(buildTree(issues, branchKey), { gutter: 2 }).map((l) =>
    l.selectable ? { name: l.text, value: l.issue.key } : new Separator(' ' + l.text),
  );
}

const SUBTASK = '__subtask__';
const TASK = '__task__';

async function createFromCommit(cfg, commit, issues, keyRegex) {
  const kind = await select({
    message: 'Que tipo de atividade?',
    choices: [
      { name: '↳ Subtarefa de uma tarefa existente', value: SUBTASK },
      { name: `▣ ${cfg.issueType} (tarefa sem pai)`, value: TASK },
    ],
  });

  let parent = null;
  if (kind === SUBTASK) {
    const parentKey = await chooseParent(issues, keyRegex, cfg);
    if (!parentKey) return null;
    parent = await getIssue(parentKey);
  }

  // Título: prefixo do produto + sugestão da IA (ou o texto do commit), tudo editável
  const files = stagedFiles();
  if (aiEnabled(cfg)) console.log(style('dim', '  … pedindo sugestão de título à IA'));
  const suggestion = await suggestTitle(cfg, {
    diff: stagedDiff(),
    files,
    subject: commit.subject,
    parentSummary: parent?.summary,
  });
  const prefix = resolvePrefix(cfg.summaryPrefix, parent ? productOf(parent.summary) : mostCommonProduct(issues));

  const summary = (
    await input({
      message: suggestion ? 'Título (sugerido pela IA):' : 'Título da nova atividade:',
      default: prefix + (suggestion ?? commit.subject),
      prefill: 'editable',
      validate: (v) => v.trim().length > 0 || 'O título não pode ficar vazio',
    })
  ).trim();

  const issueType = parent ? await subtaskTypeName(cfg) : cfg.issueType;
  const where = parent ? `subtarefa de ${parent.key}` : `${issueType} em ${cfg.projectKey}`;
  const ok = await confirm({ message: `Criar ${where}: "${summary}"?`, default: true });
  if (!ok) return null;

  const key = await createIssue({
    projectKey: cfg.projectKey,
    summary,
    issueType,
    parentKey: parent?.key,
    description: commitDescription({ body: commit.body, files }),
    // o sprint o Jira herda do pai sozinho; labels e componentes, não
    labels: parent?.labels,
    components: parent?.components,
  });
  console.log(style('green', `✔ ${key} criada no Jira`) + (parent ? style('dim', ` (subtarefa de ${parent.key})`) : ''));
  if (parent) setRepoState({ lastParent: parent.key });

  await chooseInitialStatus(key);
  return key;
}

/** Pai da subtarefa: as tarefas da árvore atual, com a última usada pré-selecionada. */
async function chooseParent(issues, keyRegex, cfg) {
  const roots = buildTree(issues).map((f) => f.root);
  const { lastParent } = getRepoState();
  const choices = roots.map((r) => ({
    name: `${style(['bold', 'cyan'], r.key)}  ${r.summary}${r.key === lastParent ? style('dim', '  (última usada)') : ''}`,
    value: r.key,
  }));
  if (lastParent && !roots.some((r) => r.key === lastParent)) {
    choices.unshift({ name: `${style(['bold', 'cyan'], lastParent)}  ${style('dim', '(última usada)')}`, value: lastParent });
  }

  const choice = await select({
    message: 'Subtarefa de qual tarefa?',
    pageSize: 15,
    loop: false,
    default: lastParent,
    choices: [
      { name: style('blue', '✎ Digitar a chave da tarefa pai'), value: MANUAL },
      new Separator(' '),
      ...choices,
    ],
  });
  return choice === MANUAL ? manualKey(cfg, keyRegex) : choice;
}

/** Status inicial: "manter" ou qualquer transição que o workflow permitir. */
async function chooseInitialStatus(key) {
  let transitions = [];
  let current;
  try {
    [transitions, { status: current }] = await Promise.all([getTransitions(key), getIssue(key)]);
  } catch {
    return; // a issue já existe; status é detalhe, não trava o commit
  }

  const choice = await select({
    message: `Status de ${key}:`,
    choices: [
      { name: `Manter em ${current}`, value: null },
      ...transitions.filter((t) => t.to !== current).map((t) => ({ name: `→ ${t.to}`, value: t.id })),
    ],
  });
  if (!choice) return;
  try {
    await transitionIssue(key, choice);
    console.log(style('green', `✔ ${key} movida para ${transitions.find((t) => t.id === choice).to}`));
  } catch (err) {
    console.warn(`⚠ Não consegui mudar o status (${err.message}).`);
  }
}

let subtaskTypeCache;
async function subtaskTypeName(cfg) {
  if (cfg.subtaskType) return cfg.subtaskType;
  subtaskTypeCache ??= (await issueTypes(cfg.projectKey)).find((t) => t.subtask)?.name;
  if (!subtaskTypeCache) throw new Error(`O projeto ${cfg.projectKey} não tem tipo de subtarefa.`);
  return subtaskTypeCache;
}

/** "{product} | Mobile: " + "LOJA DO BAIRRO" → "LOJA DO BAIRRO | Mobile: " (sem produto, sem prefixo) */
export function resolvePrefix(template, product) {
  if (!template) return '';
  if (!template.includes('{product}')) return template;
  return product ? template.replace('{product}', product) : '';
}

/** "LOJA DO BAIRRO | Mobile - Benefícios: ..." → "LOJA DO BAIRRO" */
export function productOf(summary = '') {
  const idx = summary.indexOf(' | ');
  return idx > 0 ? summary.slice(0, idx).trim() : '';
}

/** Para tarefa sem pai: o produto que mais aparece nas suas tasks (ex.: "LOJA DO BAIRRO"). */
export function mostCommonProduct(issues) {
  const count = new Map();
  for (const i of issues) {
    const p = productOf(i.summary);
    if (p) count.set(p, (count.get(p) ?? 0) + 1);
  }
  const [best] = [...count.entries()].sort((a, b) => b[1] - a[1]);
  return best?.[0] ?? '';
}

async function manualKey(cfg, keyRegex) {
  const key = await input({
    message: `Chave da atividade (ex.: ${cfg.projectKey}-123), vazio pra pular:`,
    validate: (v) => !v || keyRegex.test(v.toUpperCase()) || 'Formato inválido',
  });
  return key ? key.toUpperCase() : null;
}
