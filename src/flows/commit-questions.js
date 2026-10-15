import { keyReserve, splitConventional } from '../core/commit-message.js';
import { rankChoices } from '../core/issue-match.js';
import { t } from '../i18n/index.js';
import { BACK, runSteps } from '../utils/steps.js';
import { c, field, notice, search, withSpinner } from '../ui/index.js';

const NO_SCOPE = '__none__';
const PAGE_SIZE = 15;

const prefixOf = ({ type, scope }) => `${type}${scope ? `(${scope})` : ''}: `;

export async function askCommit(cfg, opts, suggestion, previous) {
  let suggested;
  const steps = [
    { key: 'type', run: () => askType(opts.types) },
    { key: 'scope', when: () => opts.scopes.length > 0, run: () => askScope(opts.scopes) },
    {
      key: 'subject',
      run: async (s) => {
        suggested ??= suggestion ? await withSpinner(t.questions.askingAi, () => suggestion) : null;
        const prefix = prefixOf(s);
        const max = opts.headerMaxLength - prefix.length - keyReserve(cfg);
        return askSubject({ prefix, max, initial: s.subject ?? suggested, suggested: Boolean(suggested) });
      },
    },
  ];
  const answers = await runSteps(steps, { ...previous }, { resume: Boolean(previous) });
  return answers === BACK ? BACK : { line: prefixOf(answers) + answers.subject, answers };
}

function askType(types) {
  const width = Math.max(...types.map((t) => t.value.length));
  const choices = types.map((t) => ({
    name: t.description ? `${t.value.padEnd(width)}  ${c.dim(t.description)}` : t.value,
    short: t.value,
    value: t.value,
    keywords: `${t.value} ${t.description ?? ''}`,
  }));
  return search({
    message: `${t.questions.type} ${c.dim(`· ${t.common.typeToFilter}`)}`,
    pageSize: PAGE_SIZE,
    source: (term) => filterChoices(choices, term),
    back: true,
  });
}

async function askScope(scopes) {
  const none = {
    name: c.dim(t.questions.noScope),
    short: t.questions.noScopeShort,
    value: NO_SCOPE,
    keywords: t.questions.noScopeShort,
  };
  const choices = [...scopes.map((s) => ({ name: s, value: s, keywords: s })), none];
  const choice = await search({
    message: `${t.questions.scope} ${c.dim(`· ${t.common.typeToFilter}`)}`,
    pageSize: PAGE_SIZE,
    source: (term) => filterChoices(choices, term),
    back: true,
  });
  return choice === NO_SCOPE ? null : choice;
}

async function askSubject({ prefix, max, initial, suggested }) {
  const subject = await field({
    message: `${t.questions.subject} ${c.dim(suggested ? `· ${t.questions.suggestedByAi}` : `· ${c.accent(prefix.trim())} …`)}`,
    default: initial?.slice(0, max) ?? undefined,
    prefill: 'editable',
    validate: (v) => {
      const len = v.trim().length;
      if (!len) return t.questions.subjectEmpty;
      if (len > max) return t.questions.subjectTooLong(len, max);
      return true;
    },
    back: true,
  });
  return subject === BACK ? BACK : subject.trim();
}

export async function askMessage(cfg, previous) {
  const conventional = cfg.format.includes('{prefix}');
  const message = await field({
    message: `${t.questions.message} ${c.dim(`· ${conventional ? t.questions.messageExampleConventional : t.questions.messageExample}`)}`,
    default: previous,
    prefill: 'editable',
    validate: (v) => {
      if (!v.trim()) return t.questions.messageEmpty;
      if (conventional && !splitConventional(v.trim()).prefix) return t.questions.messageFormat;
      return true;
    },
    back: true,
  });
  return message === BACK ? BACK : message.trim();
}

export async function askDetails(details) {
  const state = await runSteps(
    [
      {
        key: 'body',
        run: (s) => editableField(`${t.questions.body} ${c.dim(`· ${t.questions.bodyHint}`)}`, s.body),
      },
      {
        key: 'breaking',
        run: (s) => editableField(`${t.questions.breaking} ${c.dim(`· ${t.questions.breakingHint}`)}`, s.breaking),
      },
    ],
    { ...details },
  );
  if (state !== BACK) Object.assign(details, state);
}

export async function editableField(message, current) {
  const value = await field({ message, default: current || undefined, prefill: 'editable', back: true });
  return value === BACK ? BACK : value.trim();
}

function filterChoices(choices, term) {
  const found = rankChoices(choices, term);
  return found.length ? found : [notice(` ${t.common.nothingFound}`)];
}
