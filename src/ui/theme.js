import { styleText } from 'node:util';
import { t } from '../i18n/index.js';

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

export const promptTheme = {
  prefix: { idle: icon.brand, done: icon.done },
  icon: { cursor: c.brand('❯') },
  style: {
    message: (text) => c.bold(text),
    answer: (text) => c.accent(text),
    searchTerm: (text) => c.accent(text),
    highlight: (text) => text,
    description: (text) => c.dim(`  ${text}`),
    keysHelpTip: (keys) => c.dim(keys.map(([k, action]) => `${k} ${t.common[action] ?? action}`).join('  ·  ')),
  },
};
