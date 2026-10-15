import { matchIssues } from '../core/issue-match.js';
import { projectSearchJql } from '../core/jql.js';
import { getRepoState } from '../infra/storage/repo-state.js';
import { findMyIssues, searchProject } from '../services/issues.js';
import { BACK, c, issueChoices, LAST_TAG, log, notice, searchSelect, section, withSpinner } from '../ui/index.js';
import { askComment } from './comment.js';
import { askDetails } from './commit-questions.js';
import { createFromCommit } from './create-issue.js';
import { manualKey } from './manual-key.js';

const ACTION = {
  NEW: '__new__',
  TOGGLE_STATUSES: '__other__',
  MANUAL: '__manual__',
  DETAILS: '__details__',
  COMMENT: '__comment__',
  SKIP: '__skip__',
};
const PAGE_SIZE = 15;

export async function chooseIssue(cfg, { commit, keyRegex, branch, prefetch }) {
  const context = {
    cfg,
    commit,
    branchKey: branch.match(keyRegex)?.[0],
    lastKey: getRepoState().lastIssueByBranch?.[branch],
    found: new Map(),
  };
  let all = false;
  let issues = null;
  let pending = prefetch;

  for (;;) {
    if (!issues) {
      try {
        issues = await loadIssues(cfg, all, pending);
        pending = null;
      } catch (err) {
        log.warn(`Não consegui falar com o Jira (${err.message}).`);
        return manualKey(cfg, keyRegex, { offline: true });
      }
    }

    const choice = await issueMenu(context, issues, all);
    switch (choice) {
      case BACK:
        if (!all) return BACK;
        all = false;
        issues = null;
        break;
      case ACTION.TOGGLE_STATUSES:
        all = !all;
        issues = null;
        break;
      case ACTION.DETAILS:
        await askDetails(commit.details);
        break;
      case ACTION.COMMENT: {
        const comment = await askComment(commit.comment);
        if (comment !== BACK) commit.comment = comment;
        break;
      }
      case ACTION.SKIP:
        return null;
      case ACTION.MANUAL: {
        const typed = await manualKey(cfg, keyRegex);
        if (typed !== BACK) return typed;
        break;
      }
      case ACTION.NEW: {
        const created = await createFromCommit(cfg, commit, issues, keyRegex);
        if (created !== BACK) return created;
        break;
      }
      default:
        return { key: choice, title: (issues.find((i) => i.key === choice) ?? context.found.get(choice))?.summary };
    }
  }
}

function loadIssues(cfg, all, prefetch) {
  return withSpinner(
    all ? 'Buscando todas as suas atividades abertas…' : 'Buscando suas atividades no Jira…',
    () => (prefetch && !all ? prefetch : findMyIssues(cfg, { all })),
  );
}

function issueMenu({ cfg, commit, branchKey, lastKey, found }, issues, all) {
  const taskChoices = issueChoices(issues, branchKey, lastKey);
  const lastChoice =
    lastKey && lastKey !== branchKey && !issues.some((i) => i.key === lastKey)
      ? [{ name: `${c.key(lastKey)}  ${LAST_TAG}`, short: lastKey, value: lastKey }]
      : [];
  const keys = new Set([...lastChoice, ...taskChoices].map((ch) => ch.value).filter(Boolean));
  const actions = menuActions({
    all,
    hasDetails: Boolean(commit.details.body || commit.details.breaking),
    hasComment: Boolean(commit.comment),
  });

  return searchSelect({
    message: `Qual atividade é esse commit? ${c.dim(`${all ? '· todos os status ' : ''}· digite para buscar`)}`,
    pageSize: PAGE_SIZE,
    default: [branchKey, lastKey].find((k) => keys.has(k)) ?? taskChoices.find((ch) => ch.value)?.value,
    items: (term, remote) =>
      term
        ? searchResults(term, remote, { cfg, issues, branchKey, lastKey, actions })
        : [
            ...actions,
            section(`── ${all ? 'todas as abertas' : 'suas atividades'} (${issues.length})`),
            ...lastChoice,
            ...taskChoices,
          ],
    back: true,
    remote: async (term) => {
      const results = await searchProject(cfg, term);
      results.forEach((i) => found.set(i.key, i));
      return results;
    },
  });
}

function menuActions({ all, hasDetails, hasComment }) {
  return [
    {
      name: c.ok('+ Criar nova atividade'),
      short: 'Criar nova atividade',
      value: ACTION.NEW,
      description: 'Cria uma tarefa ou subtarefa no Jira a partir deste commit e já vincula',
    },
    all
      ? { name: c.warn('← Voltar aos status padrão'), short: 'Status padrão', value: ACTION.TOGGLE_STATUSES }
      : {
          name: c.warn('⋯ Ver outros status'),
          short: 'Outros status',
          value: ACTION.TOGGLE_STATUSES,
          description: 'Mostra todas as suas atividades abertas, não só as dos status padrão',
        },
    {
      name: c.accent('✎ Digitar a chave'),
      short: 'Digitar a chave',
      value: ACTION.MANUAL,
      description: 'Para uma atividade que não é sua ou não aparece na lista',
    },
    {
      name: c.accent(`¶ ${hasDetails ? 'Editar' : 'Adicionar'} corpo / BREAKING CHANGE`),
      short: 'Corpo / BREAKING CHANGE',
      value: ACTION.DETAILS,
      description: 'Texto mais longo e quebra de compatibilidade, os dois opcionais. Depois volta para esta lista',
    },
    {
      name: c.accent(`❝ ${hasComment ? 'Editar comentário' : 'Comentar'} na atividade`),
      short: 'Comentário na atividade',
      value: ACTION.COMMENT,
      description: 'Vai para a atividade que você escolher ou criar em seguida. Depois volta para esta lista',
    },
    {
      name: c.dim('↷ Pular'),
      short: 'Pular',
      value: ACTION.SKIP,
      description: 'Commita sem chave do Jira',
    },
  ];
}

function searchResults(term, remote, { cfg, issues, branchKey, lastKey, actions }) {
  const local = matchIssues(issues, term);
  const isMine = (r) => issues.some((i) => i.key === r.key);
  const mine = [...local, ...remote.results.filter((r) => isMine(r) && !local.some((l) => l.key === r.key))];
  const others = remote.results.filter((r) => !isMine(r));
  const searching = remote.status === 'loading' && Boolean(projectSearchJql(cfg.projectKey, term));
  const failed = remote.status === 'error';
  const nothing = !mine.length && !others.length && !searching && !failed;

  return [
    ...(mine.length ? [section(`── suas atividades (${mine.length})`), ...issueChoices(mine, branchKey, lastKey)] : []),
    ...(searching ? [section('── buscando no projeto…')] : []),
    ...(failed ? [section('── não consegui buscar no projeto')] : []),
    ...(others.length ? [section(`── outras no projeto (${others.length})`), ...issueChoices(others)] : []),
    ...(nothing ? [notice('Nenhuma atividade encontrada')] : []),
    section('── ações'),
    ...actions,
  ];
}
