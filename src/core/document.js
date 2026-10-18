import { detailLines } from './commit-message.js';

const split = (text, separator) =>
  text
    .split(separator)
    .map((p) => p.trim())
    .filter(Boolean);

export const bodyParagraphs = (body = '') => split(body, /\n\s*\n/);

export const commentParagraphs = (text = '') => split(text, '|');

// Descrição da atividade criada a partir do commit: corpo e BREAKING CHANGE (das perguntas e da
// mensagem) em parágrafos, mais a lista de arquivos do stage
export function issueDescription(commit, files = []) {
  const details = detailLines(commit.details).join('\n').trim();
  const body = [details, commit.body].filter(Boolean).join('\n\n');
  return { paragraphs: bodyParagraphs(body), files };
}
