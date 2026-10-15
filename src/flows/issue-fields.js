import { buildTree } from '../core/issue-tree.js';
import { matchIssues } from '../core/issue-match.js';
import { getRepoState } from '../infra/storage/repo-state.js';
import { truncate } from '../utils/text.js';
import { c, LAST_TAG, notice, searchSelect, section, select } from '../ui/index.js';
import { manualKey } from './manual-key.js';

export const KIND = { SUBTASK: '__subtask__', TASK: '__task__' };

const MANUAL = '__manual__';
const NO_EPIC = '__no_epic__';
const STORY_POINTS = [1, 2, 3, 5, 8, 13];
const PAGE_SIZE = 15;

export function chooseKind(cfg) {
  return select({
    message: 'Que tipo de atividade?',
    choices: [
      {
        name: '↳ Subtarefa',
        value: KIND.SUBTASK,
        description: 'Fica embaixo de uma tarefa existente e herda sprint, labels e componentes',
      },
      { name: `▣ ${cfg.issueType}`, value: KIND.TASK, description: 'Tarefa nova, num épico, já na sprint ativa' },
    ],
  });
}

export async function chooseParent(cfg, issues, keyRegex) {
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
    pageSize: PAGE_SIZE,
    loop: false,
    default: lastParent,
    choices: [
      { name: c.accent('✎ Digitar a chave da tarefa pai'), short: 'Digitar a chave', value: MANUAL },
      section(`── tarefas (${choices.length})`),
      ...choices,
    ],
  });
  return choice === MANUAL ? manualKey(cfg, keyRegex) : { key: choice };
}

export async function chooseEpic({ epics, suggested, why }) {
  if (!epics.length) return null;
  const width = Math.max(...epics.map((e) => e.key.length));
  const option = (e) => ({
    name: `${c.key(e.key.padEnd(width))}  ${e.summary}${e.key === suggested ? `  ${c.ok(`★ ${why}`)}` : ''}`,
    short: `${e.key}  ${e.summary}`,
    value: e.key,
  });
  const none = { name: c.dim('— sem épico'), short: 'sem épico', value: NO_EPIC };

  const choice = await searchSelect({
    message: `Épico da tarefa ${c.dim('· digite para buscar')}`,
    pageSize: PAGE_SIZE,
    default: suggested ?? NO_EPIC,
    items: (term) => {
      if (!term) return [none, section(`── épicos abertos (${epics.length})`), ...epics.map(option)];
      const found = matchIssues(epics, term);
      const list = found.length ? found.map(option) : [notice('Nenhum épico encontrado')];
      return [...list, section('──'), none];
    },
  });
  return choice === NO_EPIC ? null : epics.find((e) => e.key === choice);
}

export async function askStoryPoints(field) {
  if (!field) return null;
  const value = await select({
    message: `Story points ${c.dim('· opcional')}`,
    choices: [
      { name: c.dim('— sem estimativa'), short: 'sem estimativa', value: null },
      ...STORY_POINTS.map((n) => ({ name: String(n), value: n })),
    ],
  });
  return value === null ? null : { field, value };
}
