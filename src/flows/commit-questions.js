import { keyReserve, splitConventional } from '../core/commit-message.js';
import { rankChoices } from '../core/issue-match.js';
import { c, field, notice, search, withSpinner } from '../ui/index.js';

const NO_SCOPE = '__none__';
const PAGE_SIZE = 15;

export async function askCommit(cfg, opts, suggestion) {
  const type = await askType(opts.types);
  const scope = await askScope(opts.scopes);
  const prefix = `${type}${scope ? `(${scope})` : ''}: `;
  const subject = await askSubject({
    prefix,
    max: opts.headerMaxLength - prefix.length - keyReserve(cfg),
    suggestion,
  });
  return prefix + subject;
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
  });
}

async function askScope(scopes) {
  if (!scopes.length) return null;
  const none = { name: c.dim('— sem escopo'), short: 'sem escopo', value: NO_SCOPE, keywords: 'sem escopo' };
  const choices = [...scopes.map((s) => ({ name: s, value: s, keywords: s })), none];
  const choice = await search({
    message: `Escopo ${c.dim('· digite para filtrar')}`,
    pageSize: PAGE_SIZE,
    source: (term) => filterChoices(choices, term),
  });
  return choice === NO_SCOPE ? null : choice;
}

async function askSubject({ prefix, max, suggestion }) {
  const suggested = suggestion ? await withSpinner('Pedindo uma sugestão de descrição à IA…', () => suggestion) : null;
  const subject = await field({
    message: `Descrição ${c.dim(suggested ? '· sugerida pela IA' : `· ${c.accent(prefix.trim())} …`)}`,
    default: suggested?.slice(0, max) ?? undefined,
    prefill: 'editable',
    validate: (v) => {
      const len = v.trim().length;
      if (!len) return 'A descrição não pode ficar vazia';
      if (len > max) return `Muito longa: ${len} de no máximo ${max} caracteres`;
      return true;
    },
  });
  return subject.trim();
}

export async function askMessage(cfg) {
  const conventional = cfg.format.includes('{prefix}');
  const message = await field({
    message: `Mensagem do commit ${c.dim(conventional ? '· ex.: feat(home): adiciona card' : '· ex.: adiciona card')}`,
    validate: (v) => {
      if (!v.trim()) return 'A mensagem não pode ficar vazia';
      if (conventional && !splitConventional(v.trim()).prefix) return 'Use o formato tipo(escopo): descrição';
      return true;
    },
  });
  return message.trim();
}

export async function askDetails(details) {
  details.body = await editableField(`Corpo ${c.dim('· use | para quebrar linha, vazio para nenhum')}`, details.body);
  details.breaking = await editableField(
    `BREAKING CHANGE ${c.dim('· o que deixa de ser compatível, vazio para nenhum')}`,
    details.breaking,
  );
}

async function editableField(message, current) {
  return (await field({ message, default: current || undefined, prefill: 'editable' })).trim();
}

function filterChoices(choices, term) {
  const found = rankChoices(choices, term);
  return found.length ? found : [notice(' Nada encontrado')];
}
