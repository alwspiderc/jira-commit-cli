import { matchIssues } from '../core/issue-match.js';
import { t } from '../i18n/index.js';
import { parentCandidates } from '../services/create-issue.js';
import { truncate } from '../utils/text.js';
import { BACK, c, lastTag, notice, searchSelect, section, select } from '../ui/index.js';
import { manualKey } from './manual-key.js';

export const KIND = { SUBTASK: '__subtask__', TASK: '__task__' };

const MANUAL = '__manual__';
const NO_EPIC = '__no_epic__';
const PAGE_SIZE = 15;

export function chooseKind(cfg) {
  return select({
    message: t.fields.kind,
    choices: [
      { name: t.fields.subtask, value: KIND.SUBTASK, description: t.fields.subtaskHelp },
      { name: `▣ ${cfg.issueType}`, value: KIND.TASK, description: t.fields.taskHelp },
    ],
    back: true,
  });
}

export async function chooseParent(cfg, issues, keyRegex) {
  const { roots, lastParent, lastParentListed } = parentCandidates(cfg, issues);
  const tag = `  ${lastTag()}`;
  const choices = roots.map((r) => ({
    name: `${c.key(r.key)}  ${truncate(r.summary, 70)}${r.key === lastParent ? tag : ''}`,
    short: `${r.key}  ${truncate(r.summary, 60)}`,
    value: r.key,
    description: r.summary,
  }));
  if (lastParent && !lastParentListed) {
    choices.unshift({ name: `${c.key(lastParent)}${tag}`, short: lastParent, value: lastParent });
  }

  for (;;) {
    const choice = await select({
      message: t.fields.parent,
      pageSize: PAGE_SIZE,
      loop: false,
      default: lastParent,
      choices: [
        { name: c.accent(t.fields.typeParent), short: t.fields.typeParentShort, value: MANUAL },
        section(`── ${t.fields.tasks} (${choices.length})`),
        ...choices,
      ],
      back: true,
    });
    if (choice === BACK) return BACK;
    if (choice !== MANUAL) return { key: choice };
    const typed = await manualKey(cfg, keyRegex);
    if (typed && typed !== BACK) return typed;
  }
}

export async function chooseEpic({ epics, suggested, why }) {
  if (!epics.length) return null;
  const width = Math.max(...epics.map((e) => e.key.length));
  const option = (e) => ({
    name: `${c.key(e.key.padEnd(width))}  ${e.summary}${e.key === suggested ? `  ${c.ok(`★ ${why}`)}` : ''}`,
    short: `${e.key}  ${e.summary}`,
    value: e.key,
  });
  const none = { name: c.dim(t.fields.noEpic), short: t.fields.noEpicShort, value: NO_EPIC };

  const choice = await searchSelect({
    message: `${t.fields.epic} ${c.dim(`· ${t.common.typeToSearch}`)}`,
    pageSize: PAGE_SIZE,
    default: suggested ?? NO_EPIC,
    items: (term) => {
      if (!term) return [none, section(`── ${t.fields.openEpics} (${epics.length})`), ...epics.map(option)];
      const found = matchIssues(epics, term);
      const list = found.length ? found.map(option) : [notice(t.fields.noEpicFound)];
      return [...list, section('──'), none];
    },
    back: true,
  });
  if (choice === BACK) return BACK;
  return choice === NO_EPIC ? null : epics.find((e) => e.key === choice);
}

export async function askStoryPoints(field, scale) {
  if (!field) return null;
  const value = await select({
    message: `${t.fields.storyPoints} ${c.dim(`· ${t.fields.optional}`)}`,
    choices: [
      { name: c.dim(t.fields.noEstimate), short: t.fields.noEstimateShort, value: null },
      ...scale.map((n) => ({ name: String(n), value: n })),
    ],
    back: true,
  });
  if (value === BACK) return BACK;
  return value === null ? null : { field, value };
}
