import { readFileSync, writeFileSync } from 'node:fs';
import { loadProjectConfig, loadCredentials, buildJql, getRepoState, setRepoState } from '../config.js';
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
import { select, input, confirm, Separator, c, icon, log, header, withSpinner, card } from '../ui.js';

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
  const branch = currentBranch();
  header(`${cfg.projectKey} · ${branch}`, firstLine ? c.accent(firstLine) : c.dim('(mensagem vazia)'));

  const body = commitBody(lines);
  const result = await chooseIssue(cfg, { subject, body }, keyRegex, branch);
  if (!result) {
    log.hint('Commit seguirá sem chave do Jira.');
    console.log();
    return;
  }

  lines[0] = cfg.format
    .replace('{key}', result.key)
    .replace('{message}', firstLine)
    .replace('{prefix}', prefix)
    .replace('{subject}', subject);
  writeFileSync(msgFile, lines.join('\n'));

  summaryCard(result, lines[0]);
}

/** Cartão final: atividade, o que foi criado/movido, a mensagem nova e o link. */
function summaryCard({ key, title, created, parentKey, movedTo }, message) {
  let link;
  try {
    link = `${loadCredentials().baseUrl}/browse/${key}`;
  } catch {
    // sem credenciais não há link; o resto do cartão segue
  }

  const details = [
    created && (parentKey ? `nova subtarefa de ${c.key(parentKey)}` : 'nova atividade'),
    movedTo && `status ${c.accent(movedTo)}`,
  ].filter(Boolean);

  card(created ? `${icon.ok} Atividade criada e vinculada` : `${icon.ok} Commit vinculado`, [
    `${c.key(key)}  ${title ?? ''}`,
    ...(details.length ? [c.dim(details.join('  ·  '))] : []),
    '',
    c.dim(message),
    ...(link ? [`${icon.link} ${c.dim(link)}`] : []),
  ]);
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

/** Devolve { key, title, created?, parentKey?, movedTo? } ou null para pular. */
async function chooseIssue(cfg, commit, keyRegex, branch) {
  // Se a branch tiver uma chave (ex.: feature/PROJ-42-login), ela vem primeiro
  const branchKey = branch.match(keyRegex)?.[0];
  let all = false;
  let choice;
  let issues = [];

  do {
    try {
      issues = await withSpinner(
        all ? 'Buscando todas as suas atividades abertas…' : 'Buscando suas atividades no Jira…',
        async () => searchIssues(await buildJql(cfg, { all }), cfg.maxResults),
      );
    } catch (err) {
      log.warn(`Não consegui falar com o Jira (${err.message}).`);
      return manualKey(cfg, keyRegex, { offline: true });
    }
    const taskChoices = issueChoices(issues, branchKey);
    const firstTask = taskChoices.find((ch) => ch.value)?.value;

    choice = await select({
      message: all
        ? `Qual atividade é esse commit? ${c.dim('· todos os status')}`
        : 'Qual atividade é esse commit?',
      pageSize: 15,
      loop: false, // para no fim da lista em vez de voltar ao começo
      // cursor começa na task da branch ou na primeira task, nunca numa ação
      default: issues.some((i) => i.key === branchKey) ? branchKey : firstTask,
      choices: [
        {
          name: c.ok('+ Criar nova atividade'),
          short: 'Criar nova atividade',
          value: NEW,
          description: 'Cria uma tarefa ou subtarefa no Jira a partir deste commit e já vincula',
        },
        all
          ? { name: c.warn('← Voltar aos status padrão'), short: 'Status padrão', value: OTHER_STATUSES }
          : {
              name: c.warn('⋯ Ver outros status'),
              short: 'Outros status',
              value: OTHER_STATUSES,
              description: 'Mostra todas as suas atividades abertas, não só as dos status padrão',
            },
        {
          name: c.accent('✎ Digitar a chave'),
          short: 'Digitar a chave',
          value: MANUAL,
          description: 'Para uma atividade que não é sua ou não aparece na lista',
        },
        {
          name: c.dim('↷ Pular'),
          short: 'Pular',
          value: SKIP,
          description: 'Commita sem chave do Jira',
        },
        new Separator(c.dim(`── ${all ? 'todas as abertas' : 'suas atividades'} (${issues.length}) `.padEnd(40, '─'))),
        ...taskChoices,
      ],
    });
    if (choice === OTHER_STATUSES) all = !all;
  } while (choice === OTHER_STATUSES);

  if (choice === SKIP) return null;
  if (choice === MANUAL) return manualKey(cfg, keyRegex);
  if (choice === NEW) return createFromCommit(cfg, commit, issues, keyRegex);
  return { key: choice, title: issues.find((i) => i.key === choice)?.summary };
}

/** Tarefas com as subtarefas penduradas embaixo; a família da branch vem primeiro. */
export function issueChoices(issues, branchKey) {
  if (!issues.length) return [new Separator(c.dim(' Nenhuma atividade encontrada nesses status'))];

  // o select põe "❯ " antes das opções e só " " antes dos separadores
  return treeLines(buildTree(issues, branchKey), { gutter: 2 }).map((l) =>
    l.selectable
      ? {
          name: l.text,
          value: l.issue.key,
          short: `${l.issue.key}  ${truncate(l.issue.summary, 60)}`,
          // título completo embaixo da lista, já que na linha ele é cortado
          description: `${l.issue.summary}  ·  ${l.issue.status}`,
        }
      : new Separator(' ' + l.text),
  );
}

function truncate(text, max) {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

const SUBTASK = '__subtask__';
const TASK = '__task__';

async function createFromCommit(cfg, commit, issues, keyRegex) {
  const kind = await select({
    message: 'Que tipo de atividade?',
    choices: [
      {
        name: '↳ Subtarefa',
        value: SUBTASK,
        description: 'Fica embaixo de uma tarefa existente e herda sprint, labels e componentes',
      },
      { name: `▣ ${cfg.issueType}`, value: TASK, description: 'Tarefa nova, sem pai' },
    ],
  });

  let parent = null;
  if (kind === SUBTASK) {
    const chosen = await chooseParent(issues, keyRegex, cfg);
    if (!chosen) return null;
    parent = await withSpinner(`Carregando ${chosen.key}…`, () => getIssue(chosen.key));
  }

  // Título: prefixo do produto + sugestão da IA (ou o texto do commit), tudo editável
  const files = stagedFiles();
  const suggestion = aiEnabled(cfg)
    ? await withSpinner(
        'Pedindo uma sugestão de título à IA…',
        () => suggestTitle(cfg, { diff: stagedDiff(), files, subject: commit.subject, parentSummary: parent?.summary }),
        { done: (s) => (s ? c.dim('Sugestão da IA pronta') : c.dim('Sem sugestão da IA, usando o commit')) },
      )
    : null;
  const prefix = resolvePrefix(cfg.summaryPrefix, parent ? productOf(parent.summary) : mostCommonProduct(issues));

  const summary = (
    await input({
      message: suggestion ? `Título ${c.dim('· sugerido pela IA')}` : 'Título',
      default: prefix + (suggestion ?? commit.subject),
      prefill: 'editable',
      validate: (v) => v.trim().length > 0 || 'O título não pode ficar vazio',
    })
  ).trim();

  const issueType = parent ? await subtaskTypeName(cfg) : cfg.issueType;
  const where = parent ? `subtarefa de ${c.key(parent.key)}` : `${issueType} em ${c.key(cfg.projectKey)}`;
  const ok = await confirm({ message: `Criar ${where}?`, default: true });
  if (!ok) return null;

  const key = await withSpinner(
    'Criando no Jira…',
    () =>
      createIssue({
        projectKey: cfg.projectKey,
        summary,
        issueType,
        parentKey: parent?.key,
        description: commitDescription({ body: commit.body, files }),
        // o sprint o Jira herda do pai sozinho; labels e componentes, não
        labels: parent?.labels,
        components: parent?.components,
      }),
    { done: (k) => `${c.key(k)} criada no Jira` },
  );
  if (parent) setRepoState({ lastParent: parent.key });

  const movedTo = await chooseInitialStatus(key);
  return { key, title: summary, created: true, parentKey: parent?.key, movedTo };
}

/** Pai da subtarefa: as tarefas da árvore atual, com a última usada pré-selecionada. */
async function chooseParent(issues, keyRegex, cfg) {
  const roots = buildTree(issues).map((f) => f.root);
  const { lastParent } = getRepoState();
  const lastTag = c.ok('  ★ última usada');
  const choices = roots.map((r) => ({
    name: `${c.key(r.key)}  ${truncate(r.summary, 70)}${r.key === lastParent ? lastTag : ''}`,
    short: `${r.key}  ${truncate(r.summary, 60)}`,
    value: r.key,
    description: r.summary,
  }));
  if (lastParent && !roots.some((r) => r.key === lastParent)) {
    choices.unshift({ name: `${c.key(lastParent)}${lastTag}`, short: lastParent, value: lastParent });
  }

  const choice = await select({
    message: 'Subtarefa de qual tarefa?',
    pageSize: 15,
    loop: false,
    default: lastParent,
    choices: [
      { name: c.accent('✎ Digitar a chave da tarefa pai'), short: 'Digitar a chave', value: MANUAL },
      new Separator(c.dim(`── tarefas (${choices.length}) `.padEnd(40, '─'))),
      ...choices,
    ],
  });
  return choice === MANUAL ? manualKey(cfg, keyRegex) : { key: choice };
}

/** Status inicial: "manter" ou qualquer transição que o workflow permitir. Devolve o novo status. */
async function chooseInitialStatus(key) {
  let transitions = [];
  let current;
  try {
    [transitions, { status: current }] = await Promise.all([getTransitions(key), getIssue(key)]);
  } catch {
    return null; // a issue já existe; status é detalhe, não trava o commit
  }

  const choice = await select({
    message: `Status de ${c.key(key)}`,
    choices: [
      { name: `● Manter em ${c.accent(current)}`, short: `Manter em ${current}`, value: null },
      ...transitions
        .filter((t) => t.to !== current)
        .map((t) => ({ name: `→ ${t.to}`, short: t.to, value: t.id })),
    ],
  });
  if (!choice) return null;

  const to = transitions.find((t) => t.id === choice).to;
  try {
    await withSpinner(`Movendo para ${to}…`, () => transitionIssue(key, choice), {
      done: `${c.key(key)} movida para ${c.accent(to)}`,
    });
    return to;
  } catch (err) {
    log.warn(`Não consegui mudar o status (${err.message}).`);
    return null;
  }
}

let subtaskTypeCache;
async function subtaskTypeName(cfg) {
  if (cfg.subtaskType) return cfg.subtaskType;
  subtaskTypeCache ??= (await issueTypes(cfg.projectKey)).find((t) => t.subtask)?.name;
  if (!subtaskTypeCache) throw new Error(`O projeto ${cfg.projectKey} não tem tipo de subtarefa.`);
  return subtaskTypeCache;
}

/** "{product} | Mobile: " + "TÁTICO CIDADÃO" → "TÁTICO CIDADÃO | Mobile: " (sem produto, sem prefixo) */
export function resolvePrefix(template, product) {
  if (!template) return '';
  if (!template.includes('{product}')) return template;
  return product ? template.replace('{product}', product) : '';
}

/** "TÁTICO CIDADÃO | Mobile - Benefícios: ..." → "TÁTICO CIDADÃO" */
export function productOf(summary = '') {
  const idx = summary.indexOf(' | ');
  return idx > 0 ? summary.slice(0, idx).trim() : '';
}

/** Para tarefa sem pai: o produto que mais aparece nas suas tasks (ex.: "TÁTICO CIDADÃO"). */
export function mostCommonProduct(issues) {
  const count = new Map();
  for (const i of issues) {
    const p = productOf(i.summary);
    if (p) count.set(p, (count.get(p) ?? 0) + 1);
  }
  const [best] = [...count.entries()].sort((a, b) => b[1] - a[1]);
  return best?.[0] ?? '';
}

/**
 * Pede a chave e confere no Jira se ela existe. Com o Jira fora do ar (offline),
 * aceita qualquer chave no formato certo para não travar o commit.
 */
async function manualKey(cfg, keyRegex, { offline = false } = {}) {
  let title;
  const key = await input({
    message: `Chave da atividade ${c.dim(`· ex.: ${cfg.projectKey}-123, vazio para pular`)}`,
    validate: async (v) => {
      if (!v) return true;
      if (!keyRegex.test(v.toUpperCase())) return `Formato inválido, use ${cfg.projectKey}-123`;
      if (offline) return true;
      try {
        title = (await getIssue(v.toUpperCase())).summary;
        return true;
      } catch (err) {
        if (/respondeu 404/.test(err.message)) return `${v.toUpperCase()} não existe no Jira`;
        return true; // erro de rede: aceita a chave mesmo sem confirmar
      }
    },
  });
  return key ? { key: key.toUpperCase(), title } : null;
}
