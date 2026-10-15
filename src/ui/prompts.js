import * as inquirer from '@inquirer/prompts';
import searchSelectPrompt from './search-select.js';
import { withBack } from './back.js';
import { c, promptTheme } from './theme.js';

const backTheme = {
  style: { ...promptTheme.style, keysHelpTip: (keys) => promptTheme.style.keysHelpTip([...keys, ['esc', 'voltar']]) },
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

export const section = (label) => new Separator(c.dim(`${label} `.padEnd(40, '─')));

export const notice = (text) => new Separator(c.dim(` ${text}`));

// O @inquirer quebra a linha por palavra mas calcula o cursor por caractere: com NBSP (só na tela)
// a quebra cai onde o cursor espera
export function fieldTransformer(value, { isFinal }) {
  if (isFinal) return c.accent(value);
  return `\n${value.replaceAll(' ', ' ') || ' '}`;
}

export const field = (config, context) => input({ transformer: fieldTransformer, ...config }, context);
