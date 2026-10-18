import { formatMessage, issueKeyRegex } from '../../src/core/commit-message.js';

// Põe a chave na primeira linha da mensagem que está na caixa do Source Control, seguindo o
// "format" do .jira-commit.json. Já tem chave do projeto: troca pela nova. Vazia: só a chave.
// O corpo (linhas depois da primeira) fica como está
export function linkMessage(cfg, current, key) {
  const [first = '', ...rest] = current.split('\n');
  const re = issueKeyRegex(cfg.projectKey);
  if (re.test(first)) return [first.replace(re, key), ...rest].join('\n');
  if (!first.trim()) return [`${key} `, ...rest].join('\n');
  return [formatMessage(cfg.format, key, first), ...rest].join('\n');
}
