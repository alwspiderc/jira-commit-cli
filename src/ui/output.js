import { stripVTControlCharacters } from 'node:util';
import { badge, c, icon, wordmark } from './theme.js';

export const log = {
  ok: (msg) => console.log(`${icon.ok} ${msg}`),
  warn: (msg) => console.warn(`${icon.warn} ${c.warn(msg)}`),
  err: (msg) => console.error(`${icon.err} ${c.err(msg)}`),
  info: (msg) => console.log(`${icon.info} ${msg}`),
  hint: (msg) => console.log(c.dim(`  ${msg}`)),
};

export function header(title, context, { project } = {}) {
  console.log();
  const tag = project ? `${badge(project)} ` : '';
  console.log(`${icon.brand} ${wordmark()}  ${tag}${c.accent(title)}`);
  if (context) console.log(`${c.brand('│')} ${context}`);
  console.log();
}

const visibleWidth = (s) => stripVTControlCharacters(s).length;

const ANSI = /\x1b\[[0-9;]*m/y;
const RESET = '\x1b[0m';

// Corta pelo texto visível sem perder as cores do pedaço que fica
export function truncateVisible(text, max) {
  if (visibleWidth(text) <= max) return text;
  let out = '';
  let visible = 0;
  for (let i = 0; i < text.length; ) {
    ANSI.lastIndex = i;
    const code = ANSI.exec(text);
    if (code) {
      out += code[0];
      i += code[0].length;
    } else if (visible === max - 1) {
      out += '…';
      break;
    } else {
      out += text[i++];
      visible++;
    }
  }
  return out.includes('\x1b') ? out + RESET : out;
}

export function card(title, lines, { color = c.ok } = {}) {
  const max = Math.min(process.stdout.columns || 100, 100) - 4;
  const fit = (s) => truncateVisible(s, max);
  const body = lines.map(fit);
  const inner = Math.max(visibleWidth(title) + 3, ...body.map(visibleWidth));

  const top = `${color('╭─')} ${title} ${color(`${'─'.repeat(Math.max(0, inner - visibleWidth(title) - 1))}╮`)}`;
  const rows = body.map((l) => `${color('│')} ${l}${' '.repeat(inner - visibleWidth(l))} ${color('│')}`);
  const bottom = color(`╰${'─'.repeat(inner + 2)}╯`);

  console.log();
  console.log(top);
  rows.forEach((r) => console.log(r));
  console.log(bottom);
  console.log();
}
