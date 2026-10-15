import { stripVTControlCharacters } from 'node:util';
import { c, icon } from './theme.js';

export const log = {
  ok: (msg) => console.log(`${icon.ok} ${msg}`),
  warn: (msg) => console.warn(`${icon.warn} ${c.warn(msg)}`),
  err: (msg) => console.error(`${icon.err} ${c.err(msg)}`),
  info: (msg) => console.log(`${icon.info} ${msg}`),
  hint: (msg) => console.log(c.dim(`  ${msg}`)),
};

export function header(title, context) {
  console.log();
  console.log(`${icon.brand} ${c.brand('jira-commit')}  ${c.dim(title)}`);
  if (context) console.log(`${c.dim('│')} ${context}`);
  console.log();
}

const visibleWidth = (s) => stripVTControlCharacters(s).length;

export function card(title, lines, { color = c.ok } = {}) {
  const max = Math.min(process.stdout.columns || 100, 100) - 4;
  const fit = (s) => {
    if (visibleWidth(s) <= max) return s;
    return stripVTControlCharacters(s).slice(0, max - 1) + '…';
  };
  const body = lines.map(fit);
  const inner = Math.max(visibleWidth(title) + 3, ...body.map(visibleWidth));

  const top = `╭─ ${title} ${'─'.repeat(Math.max(0, inner - visibleWidth(title) - 1))}╮`;
  const rows = body.map((l) => `${color('│')} ${l}${' '.repeat(inner - visibleWidth(l))} ${color('│')}`);
  const bottom = `╰${'─'.repeat(inner + 2)}╯`;

  console.log();
  console.log(color(top.replace(title, '\0')).replace('\0', title));
  rows.forEach((r) => console.log(r));
  console.log(color(bottom));
  console.log();
}
