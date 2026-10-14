// Identidade visual da CLI: cores, ícones, tema dos prompts, spinner e cartões.
import { readFileSync } from 'node:fs';
import { styleText, stripVTControlCharacters } from 'node:util';
import * as inquirer from '@inquirer/prompts';

export const c = {
  brand: (t) => styleText(['bold', 'magenta'], t),
  accent: (t) => styleText('cyan', t),
  key: (t) => styleText(['bold', 'cyan'], t),
  ok: (t) => styleText('green', t),
  warn: (t) => styleText('yellow', t),
  err: (t) => styleText('red', t),
  dim: (t) => styleText('dim', t),
  bold: (t) => styleText('bold', t),
};

export const icon = {
  brand: c.brand('◆'),
  done: c.ok('◇'),
  ok: c.ok('✔'),
  warn: c.warn('▲'),
  err: c.err('✖'),
  info: c.accent('●'),
  link: c.dim('↗'),
};

export const VERSION = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;

// ---------- Prompts com o tema da CLI ----------

const KEY_LABELS = { navigate: 'navegar', select: 'escolher' };

const theme = {
  prefix: { idle: icon.brand, done: icon.done },
  icon: { cursor: c.brand('❯') },
  style: {
    message: (text) => c.bold(text),
    answer: (text) => c.accent(text),
    highlight: (text) => text,
    description: (text) => c.dim(`  ${text}`),
    keysHelpTip: (keys) =>
      c.dim(keys.map(([k, action]) => `${k} ${KEY_LABELS[action] ?? action}`).join('  ·  ')),
  },
};

const themed = (fn) => (config) => fn({ ...config, theme: { ...theme, ...config.theme } });

export const select = themed(inquirer.select);
export const input = themed(inquirer.input);
export const confirm = themed(inquirer.confirm);
export const password = themed(inquirer.password);
export const search = themed(inquirer.search); // select com filtro: digitar "fe" acha "feat"
export const { Separator } = inquirer;

// ---------- Mensagens ----------

export const log = {
  ok: (msg) => console.log(`${icon.ok} ${msg}`),
  warn: (msg) => console.warn(`${icon.warn} ${c.warn(msg)}`),
  err: (msg) => console.error(`${icon.err} ${c.err(msg)}`),
  info: (msg) => console.log(`${icon.info} ${msg}`),
  hint: (msg) => console.log(c.dim(`  ${msg}`)),
};

/** Linha de abertura: "◆ jira-commit  LOJA · develop" + uma linha de contexto. */
export function header(title, context) {
  console.log();
  console.log(`${icon.brand} ${c.brand('jira-commit')}  ${c.dim(title)}`);
  if (context) console.log(`${c.dim('│')} ${context}`);
  console.log();
}

// ---------- Spinner ----------

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Mostra um spinner enquanto a promessa roda e troca por ✔/✖ no fim.
 * Fora de um terminal interativo, só roda a promessa.
 */
export async function withSpinner(text, task, { done } = {}) {
  const out = process.stderr;
  if (!out.isTTY) return task();

  let i = 0;
  const draw = (frame) => out.write(`\r\x1b[2K${frame} ${c.dim(text)}`);
  draw(c.brand(FRAMES[0]));
  const timer = setInterval(() => draw(c.brand(FRAMES[++i % FRAMES.length])), 80);
  try {
    const result = await task();
    clearInterval(timer);
    const msg = typeof done === 'function' ? done(result) : done;
    out.write(`\r\x1b[2K${msg ? `${icon.ok} ${msg}\n` : ''}`);
    return result;
  } catch (err) {
    clearInterval(timer);
    out.write(`\r\x1b[2K${icon.err} ${c.err(text)}\n`);
    throw err;
  }
}

// ---------- Cartão ----------

const width = (s) => stripVTControlCharacters(s).length;

/** Caixa com título na borda: usada no resumo final. */
export function card(title, lines, { color = c.ok } = {}) {
  const max = Math.min(process.stdout.columns || 100, 100) - 4;
  const fit = (s) => {
    if (width(s) <= max) return s;
    // corta pelo texto visível (só usado em linhas sem cor no fim, como links e títulos)
    return stripVTControlCharacters(s).slice(0, max - 1) + '…';
  };
  const body = lines.map(fit);
  const inner = Math.max(width(title) + 3, ...body.map(width));

  const top = `╭─ ${title} ${'─'.repeat(Math.max(0, inner - width(title) - 1))}╮`;
  const rows = body.map((l) => `${color('│')} ${l}${' '.repeat(inner - width(l))} ${color('│')}`);
  const bottom = `╰${'─'.repeat(inner + 2)}╯`;

  console.log();
  console.log(color(top.replace(title, '\0')).replace('\0', title));
  rows.forEach((r) => console.log(r));
  console.log(color(bottom));
  console.log();
}
