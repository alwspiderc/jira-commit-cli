import en from './en.js';
import pt from './pt.js';

const CATALOGS = { pt, en };

export const LANGUAGES = Object.keys(CATALOGS);

// Pelo Intl e não pelo LANG: o Git Bash costuma definir LANG=en_US mesmo num Windows em português
export function detectLanguage(env = process.env, locale = Intl.DateTimeFormat().resolvedOptions().locale) {
  if (CATALOGS[env.JIRA_COMMIT_LANG]) return env.JIRA_COMMIT_LANG;
  return /^pt/i.test(locale ?? '') ? 'pt' : 'en';
}

let current = detectLanguage();

export function setLanguage(lang) {
  if (CATALOGS[lang]) current = lang;
}

export const language = () => current;

export const catalogs = CATALOGS;

// t.secao.chave lê o catálogo do idioma atual na hora do acesso, então trocar o idioma depois
// de importar (o .jira-commit.json só é lido depois) já vale
export const t = new Proxy({}, { get: (_, section) => CATALOGS[current][section] });
