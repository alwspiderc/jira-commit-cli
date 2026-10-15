import * as inquirer from '@inquirer/prompts';
import searchSelectPrompt from './search-select.js';
import { withBack } from './back.js';
import { c, promptTheme } from './theme.js';

const backTheme = {
  style: { ...promptTheme.style, keysHelpTip: (keys) => promptTheme.style.keysHelpTip([...keys, ['esc', 'back']]) },
};

const themed = (fn) => (config, context) => {
  const { back = false, ...rest } = config;
  const run = (cfg, ctx) => fn({ ...cfg, theme: { ...promptTheme, ...(back && backTheme), ...cfg.theme } }, ctx);
  return back ? withBack(run)(rest, context) : run(rest, context);
};

export const select = themed(inquirer.select);
export const input = themed(inquirer.input);
export const confirm = themed(inquirer.confirm);
export const password = themed(inquirer.password);
export const search = themed(inquirer.search);
export const searchSelect = themed(searchSelectPrompt);
export const { Separator } = inquirer;

const SECTION_WIDTH = 40;

export const section = (label = '') => {
  const text = label.replace(/^──\s*/, '');
  if (!text) return new Separator(c.dim('─'.repeat(SECTION_WIDTH)));
  const rest = Math.max(2, SECTION_WIDTH - text.length - 4);
  return new Separator(`${c.dim('──')} ${c.title(text)} ${c.dim('─'.repeat(rest))}`);
};

export const notice = (text) => new Separator(c.dim(` ${text}`));

// O @inquirer quebra a linha por palavra mas calcula o cursor por caractere: com NBSP (só na tela)
// a quebra cai onde o cursor espera
export function fieldTransformer(value, { isFinal }) {
  if (isFinal) return c.accent(value);
  return `\n${value.replaceAll(' ', ' ') || ' '}`;
}

export const field = (config, context) => input({ transformer: fieldTransformer, ...config }, context);
