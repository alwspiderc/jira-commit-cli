import { keyReserve, splitConventional } from '../core/commit-message.js';
import { rankChoices } from '../core/issue-match.js';
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
        suggested ??= suggestion ? await withSpinner('Pedindo uma sugestão de descrição à IA…', () => suggestion) : null;
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
    message: `Tipo ${c.dim('· digite para filtrar')}`,
    pageSize: PAGE_SIZE,
    source: (term) => filterChoices(choices, term),
    back: true,
  });
}

async function askScope(scopes) {
  const none = { name: c.dim('— sem escopo'), short: 'sem escopo', value: NO_SCOPE, keywords: 'sem escopo' };
  const choices = [...scopes.map((s) => ({ name: s, value: s, keywords: s })), none];
  const choice = await search({
    message: `Escopo ${c.dim('· digite para filtrar')}`,
    pageSize: PAGE_SIZE,
    source: (term) => filterChoices(choices, term),
    back: true,
  });
  return choice === NO_SCOPE ? null : choice;
}

async function askSubject({ prefix, max, initial, suggested }) {
  const subject = await field({
    message: `Descrição ${c.dim(suggested ? '· sugerida pela IA' : `· ${c.accent(prefix.trim())} …`)}`,
    default: initial?.slice(0, max) ?? undefined,
    prefill: 'editable',
    validate: (v) => {
      const len = v.trim().length;
      if (!len) return 'A descrição não pode ficar vazia';
      if (len > max) return `Muito longa: ${len} de no máximo ${max} caracteres`;
      return true;
    },
    back: true,
  });
  return subject === BACK ? BACK : subject.trim();
}

export async function askMessage(cfg, previous) {
  const conventional = cfg.format.includes('{prefix}');
  const message = await field({
    message: `Mensagem do commit ${c.dim(conventional ? '· ex.: feat(home): adiciona card' : '· ex.: adiciona card')}`,
    default: previous,
    prefill: 'editable',
    validate: (v) => {
      if (!v.trim()) return 'A mensagem não pode ficar vazia';
      if (conventional && !splitConventional(v.trim()).prefix) return 'Use o formato tipo(escopo): descrição';
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
        run: (s) => editableField(`Corpo ${c.dim('· use | para quebrar linha, vazio para nenhum')}`, s.body),
      },
      {
        key: 'breaking',
        run: (s) => editableField(`BREAKING CHANGE ${c.dim('· o que deixa de ser compatível, vazio para nenhum')}`, s.breaking),
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
  return found.length ? found : [notice(' Nada encontrado')];
}
