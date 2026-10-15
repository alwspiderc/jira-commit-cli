import { styleText } from 'node:util';
import { t } from '../i18n/index.js';

const style = (format) => (text) => styleText(format, String(text));

export const c = {
  brand: style(['bold', 'magentaBright']),
  title: style(['bold', 'magentaBright']),
  accent: style('cyanBright'),
  key: style(['bold', 'cyanBright']),
  ok: style('greenBright'),
  warn: style('yellowBright'),
  err: style('redBright'),
  info: style('blueBright'),
  link: style(['underline', 'blueBright']),
  dim: style('dim'),
  bold: style('bold'),
};

export const icon = {
  brand: c.brand('◆'),
  done: c.ok('◇'),
  ok: c.ok('✔'),
  warn: c.warn('▲'),
  err: c.err('✖'),
  info: c.info('●'),
  link: c.info('↗'),
  branch: c.brand('⎇'),
};

const BADGES = {
  brand: ['bgMagenta', 'whiteBright', 'bold'],
  ok: ['bgGreen', 'black', 'bold'],
  info: ['bgCyan', 'black', 'bold'],
  warn: ['bgYellow', 'black', 'bold'],
  err: ['bgRed', 'whiteBright', 'bold'],
};

export const badge = (text, kind = 'brand') => styleText(BADGES[kind], ` ${text} `);

export const wordmark = () => styleText(['bold', 'blueBright'], 'jira') + styleText(['bold', 'magentaBright'], '-commit');

const TYPE_COLORS = {
  feat: 'greenBright',
  patch: 'green',
  fix: 'redBright',
  revert: 'red',
  docs: 'blueBright',
  style: 'magentaBright',
  refactor: 'cyanBright',
  perf: 'yellowBright',
  test: 'yellow',
  build: 'blue',
  ci: 'blue',
  chore: 'gray',
  wip: 'gray',
  merge: 'magenta',
};

export const typeColor = (type) => style(TYPE_COLORS[type] ?? 'cyanBright');

const CONVENTIONAL = /^(\w+)(\([^)]*\))?(!?:)/;

// "feat(home): APP-12 adiciona card": o tipo na cor dele, o escopo e a chave em destaque
export function colorCommitLine(line, key) {
  const match = line.match(CONVENTIONAL);
  let text = line;
  if (match) {
    const [head, type, scope = '', colon] = match;
    text = typeColor(type)(type) + (scope ? c.accent(scope) : '') + c.dim(colon) + line.slice(head.length);
  }
  return key ? text.replace(key, c.key(key)) : text;
}

export const STATUS_COLORS = { new: 'blueBright', indeterminate: 'yellowBright', done: 'greenBright' };

export const promptTheme = {
  prefix: { idle: icon.brand, done: icon.done },
  icon: { cursor: c.brand('❯') },
  style: {
    message: (text) => c.bold(text),
    answer: (text) => c.accent(text),
    searchTerm: (text) => c.warn(text),
    highlight: (text) => c.bold(text),
    description: (text) => c.dim(`  ${text}`),
    keysHelpTip: (keys) =>
      keys.map(([k, action]) => `${c.brand(k)} ${c.dim(t.common[action] ?? action)}`).join(c.dim('  ·  ')),
  },
};
