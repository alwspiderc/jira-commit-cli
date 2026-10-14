import { readFileSync, writeFileSync } from 'node:fs';
import {
  loadProjectConfig,
  loadCredentials,
  buildJql,
  getRepoState,
  setRepoState,
  commitOptions,
} from '../config.js';
import {
  searchIssues,
  createIssue,
  getIssue,
  issueTypes,
  getTransitions,
  transitionIssue,
} from '../jira.js';
import { currentBranch, stagedFiles, stagedDiff, recentSubjects } from '../git.js';
import { commitDescription } from '../adf.js';
import { suggestTitle, suggestSubject, aiEnabled } from '../ai.js';
import { askCommit, askDetails, detailLines } from '../message.js';
import { buildTree, treeLines } from '../tree.js';
import { select, input, confirm, Separator, c, icon, log, header, withSpinner, card } from '../ui.js';

const OTHER_STATUSES = '__other__';
const NEW = '__new__';
const MANUAL = '__manual__';
const DETAILS = '__details__';
const SKIP = '__skip__';
const LAST_TAG = c.ok('★ última usada');

/**
 * Chamado pelo git como: jira-commit hook <arquivo-da-mensagem> <origem>
 * origem: vazio (editor), "message" (-m), "template", "merge", "squash" ou "commit" (--amend)
 */
export async function hook(msgFile, source) {
  if (!msgFile) throw new Error('Uso: jira-commit hook <arquivo-msg> [origem]');

  // Merge, squash e amend já têm mensagem pronta: não mexe
  if (['merge', 'squash', 'commit'].includes(source)) return;

  const cfg = loadProjectConfig();
  const [first, ...rest] = readFileSync(msgFile, 'utf8').split('\n');
  let firstLine = first.trim();

  const keyRegex = new RegExp(`\\b${cfg.projectKey}-\\d+\\b`);
  if (keyRegex.test(firstLine)) return; // já tem a tag, nada a fazer

  const branch = currentBranch();
  header(`${cfg.projectKey} · ${branch}`, firstLine ? c.accent(firstLine) : c.dim('(mensagem vazia)'));

  // Busca no Jira e sugestão da IA começam já: rodam enquanto a pessoa responde as perguntas
  const prefetch = prefetchIssues(cfg);
  const opts = !firstLine && commitOptions(cfg);
  const suggestion =
    opts && aiEnabled(cfg)
      ? suggestSubject(cfg, { diff: stagedDiff(), files: stagedFiles(), examples: recentSubjects() })
      : null;

  const details = { body: '', breaking: '' }; // preenchidos pelo atalho do menu de atividades
  const save = (line) => writeFileSync(msgFile, [line, ...detailLines(details), ...rest].join('\n'));

  // git commit sem -m: a mensagem chega vazia, então o jira-commit pergunta
  if (!firstLine) {
    firstLine = opts ? await askCommit(cfg, opts, suggestion) : await askMessage(cfg);
    save(firstLine); // vale mesmo se a pessoa pular a atividade
    if (keyRegex.test(firstLine)) return;
  }

  const { prefix, subject } = splitConventional(firstLine);
  const commit = { subject, body: commitBody([firstLine, ...rest]), details };
  const result = await chooseIssue(cfg, commit, keyRegex, branch, prefetch);
  if (!result) {
    save(firstLine); // o corpo pode ter vindo do atalho
    log.hint('Commit seguirá sem chave do Jira.');
    console.log();
    return;
  }

  const message = cfg.format
    .replace('{key}', result.key)
    .replace('{message}', firstLine)
    .replace('{prefix}', prefix)
    .replace('{subject}', subject);
  save(message);

  const { lastIssueByBranch } = getRepoState();
  setRepoState({ lastIssueByBranch: { ...lastIssueByBranch, [branch]: result.key } });

  summaryCard(result, message);
}

/** Dispara a busca nos status padrão sem esperar; o erro é tratado por quem usar o resultado. */
function prefetchIssues(cfg) {
  const issues = buildJql(cfg).then((jql) => searchIssues(jql, cfg.maxResults));
  issues.catch(() => {}); // sem isso o Node avisa de rejeição não tratada antes do menu usar
  return issues;
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

/** Pede a 1ª linha do commit. Com {prefix} no format (commitlint), exige "tipo(escopo): descrição". */
async function askMessage(cfg) {
  const conventional = cfg.format.includes('{prefix}');
  const message = await input({
    message: `Mensagem do commit ${c.dim(conventional ? '· ex.: feat(home): adiciona card' : '· ex.: adiciona card')}`,
    validate: (v) => {
      if (!v.trim()) return 'A mensagem não pode ficar vazia';
      if (conventional && !splitConventional(v.trim()).prefix) return 'Use o formato tipo(escopo): descrição';
      return true;
    },
  });
  return message.trim();
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
async function chooseIssue(cfg, commit, keyRegex, branch, prefetch) {
  // Se a branch tiver uma chave (ex.: feature/PROJ-42-login), ela vem primeiro;
  // senão, a do último commit nesta branch (commits seguidos costumam ser da mesma atividade)
  const branchKey = branch.match(keyRegex)?.[0];
  const lastKey = getRepoState().lastIssueByBranch?.[branch];
  let all = false;
  let choice;
  let issues = null;

  for (;;) {
    if (!issues) {
      try {
        issues = await withSpinner(
          all ? 'Buscando todas as suas atividades abertas…' : 'Buscando suas atividades no Jira…',
          async () => (prefetch && !all ? prefetch : searchIssues(await buildJql(cfg, { all }), cfg.maxResults)),
        );
        prefetch = null; // a busca antecipada só vale para a primeira lista
      } catch (err) {
        log.warn(`Não consegui falar com o Jira (${err.message}).`);
        return manualKey(cfg, keyRegex, { offline: true });
      }
    }
    const taskChoices = issueChoices(issues, branchKey, lastKey);
    // a última usada saiu da lista (mudou de status, por exemplo): entra no topo
    const lastChoice =
      lastKey && lastKey !== branchKey && !issues.some((i) => i.key === lastKey)
        ? [{ name: `${c.key(lastKey)}  ${LAST_TAG}`, short: lastKey, value: lastKey }]
        : [];
    const keys = new Set([...lastChoice, ...taskChoices].map((ch) => ch.value).filter(Boolean));
    const hasDetails = Boolean(commit.details.body || commit.details.breaking);

    choice = await select({
      message: all
        ? `Qual atividade é esse commit? ${c.dim('· todos os status')}`
        : 'Qual atividade é esse commit?',
      pageSize: 15,
      loop: false, // para no fim da lista em vez de voltar ao começo
      // cursor começa na task da branch, na última usada ou na primeira task, nunca numa ação
      default: [branchKey, lastKey].find((k) => keys.has(k)) ?? taskChoices.find((ch) => ch.value)?.value,
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
          name: c.accent(`¶ ${hasDetails ? 'Editar' : 'Adicionar'} corpo / BREAKING CHANGE`),
          short: 'Corpo / BREAKING CHANGE',
          value: DETAILS,
          description: 'Texto mais longo e quebra de compatibilidade, os dois opcionais. Depois volta para esta lista',
        },
        {
          name: c.dim('↷ Pular'),
          short: 'Pular',
          value: SKIP,
          description: 'Commita sem chave do Jira',
        },
        new Separator(c.dim(`── ${all ? 'todas as abertas' : 'suas atividades'} (${issues.length}) `.padEnd(40, '─'))),
        ...lastChoice,
        ...taskChoices,
      ],
    });
    if (choice === OTHER_STATUSES) {
      all = !all;
      issues = null;
    } else if (choice === DETAILS) {
      await askDetails(commit.details);
    } else {
      break;
    }
  }

  if (choice === SKIP) return null;
  if (choice === MANUAL) return manualKey(cfg, keyRegex);
  if (choice === NEW) return createFromCommit(cfg, commit, issues, keyRegex);
  return { key: choice, title: issues.find((i) => i.key === choice)?.summary };
}

/** Tarefas com as subtarefas penduradas embaixo; a família da branch vem primeiro. */
export function issueChoices(issues, branchKey, lastKey) {
  if (!issues.length) return [new Separator(c.dim(' Nenhuma atividade encontrada nesses status'))];

  // o select põe "❯ " antes das opções e só " " antes dos separadores
  return treeLines(buildTree(issues, branchKey), { gutter: 2 }).map((l) =>
    l.selectable
      ? {
          name: l.text,
          value: l.issue.key,
          short: `${l.issue.key}  ${truncate(l.issue.summary, 60)}`,
          // título completo embaixo da lista, já que na linha ele é cortado (e a linha já
          // ocupa a largura toda, por isso a marca de "última usada" fica aqui)
          description: [l.issue.key === lastKey && LAST_TAG, l.issue.summary, l.issue.status]
            .filter(Boolean)
            .join('  ·  '),
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
        // corpo que veio na mensagem + o que foi digitado no atalho de detalhes
        description: commitDescription({
          body: [detailLines(commit.details).join('\n').trim(), commit.body].filter(Boolean).join('\n\n'),
          files,
        }),
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
  const lastTag = `  ${LAST_TAG}`;
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
