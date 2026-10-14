// Questionário do commit: tipo, escopo e descrição, com tipos e escopos do .jira-commit.json.
// Corpo e BREAKING CHANGE são opcionais e ficam num atalho do menu de atividades.
import { search, input, Separator, c, withSpinner } from './ui.js';

const NO_SCOPE = '__none__';

/**
 * Pergunta tipo, escopo e descrição e devolve a 1ª linha: "feat(home): adiciona card".
 * suggestion é a promessa da descrição sugerida pela IA (ou null), já disparada antes.
 */
export async function askCommit(cfg, opts, suggestion) {
  const width = Math.max(...opts.types.map((t) => t.value.length));
  const type = await search({
    message: `Tipo ${c.dim('· digite para filtrar')}`,
    pageSize: 15,
    source: (term) =>
      filterChoices(
        opts.types.map((t) => ({
          name: t.description ? `${t.value.padEnd(width)}  ${c.dim(t.description)}` : t.value,
          short: t.value,
          value: t.value,
          keywords: `${t.value} ${t.description ?? ''}`,
        })),
        term,
      ),
  });

  let scope = null;
  if (opts.scopes.length) {
    const none = { name: c.dim('— sem escopo'), short: 'sem escopo', value: NO_SCOPE, keywords: 'sem escopo' };
    const choice = await search({
      message: `Escopo ${c.dim('· digite para filtrar')}`,
      pageSize: 15,
      source: (term) => filterChoices([...opts.scopes.map((s) => ({ name: s, value: s, keywords: s })), none], term),
    });
    if (choice !== NO_SCOPE) scope = choice;
  }

  const prefix = `${type}${scope ? `(${scope})` : ''}: `;
  const max = opts.headerMaxLength - prefix.length - keyReserve(cfg);
  const suggested = suggestion
    ? await withSpinner('Pedindo uma sugestão de descrição à IA…', () => suggestion)
    : null;

  const subject = await input({
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
  return prefix + subject.trim();
}

/** Corpo (com "|" quebrando linha, como no cz) e BREAKING CHANGE. Atualiza details no lugar. */
export async function askDetails(details) {
  details.body = (
    await input({
      message: `Corpo ${c.dim('· use | para quebrar linha, vazio para nenhum')}`,
      default: details.body || undefined,
      prefill: 'editable',
    })
  ).trim();
  details.breaking = (
    await input({
      message: `BREAKING CHANGE ${c.dim('· o que deixa de ser compatível, vazio para nenhum')}`,
      default: details.breaking || undefined,
      prefill: 'editable',
    })
  ).trim();
}

/** Linhas que vão depois do cabeçalho: linha em branco, corpo, linha em branco, rodapé. */
export function detailLines({ body = '', breaking = '' } = {}) {
  const lines = [];
  const text = body
    .split('|')
    .map((l) => l.trim())
    .filter(Boolean);
  if (text.length) lines.push('', ...text);
  if (breaking) lines.push('', `BREAKING CHANGE: ${breaking}`);
  return lines;
}

/** Quanto a chave ocupa no cabeçalho depois do format, ex.: "ABDP-00000 " em "{prefix}{key} {subject}". */
function keyReserve(cfg) {
  return cfg.format
    .replace('{prefix}', '')
    .replace('{subject}', '')
    .replace('{message}', '')
    .replace('{key}', `${cfg.projectKey}-00000`).length;
}

/** Filtro sem acento e sem maiúscula: quem começa com o termo vem antes de quem só contém. */
export function filterChoices(choices, term) {
  if (!term) return choices;
  const t = normalize(term);
  const starts = [];
  const contains = [];
  for (const ch of choices) {
    const words = normalize(ch.keywords);
    if (words.startsWith(t)) starts.push(ch);
    else if (words.includes(t)) contains.push(ch);
  }
  const found = [...starts, ...contains];
  // sem isso o prompt mostra "No results found", em inglês
  return found.length ? found : [new Separator(c.dim('  Nada encontrado'))];
}

export const normalize = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
