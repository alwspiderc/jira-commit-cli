import { commentParagraphs } from '../core/document.js';
import { addComment } from '../infra/jira/api.js';
import { BACK, c, field, log, withSpinner } from '../ui/index.js';

export async function askComment(current = '') {
  const text = await field({
    message: `Comentário na atividade ${c.dim('· use | para quebrar linha, vazio para nenhum')}`,
    default: current || undefined,
    prefill: 'editable',
    back: true,
  });
  return text === BACK ? BACK : text.trim();
}

export async function sendComment(key, text) {
  const paragraphs = commentParagraphs(text);
  if (!paragraphs.length) return false;
  await withSpinner('Comentando no Jira…', () => addComment(key, paragraphs), {
    done: `Comentário adicionado em ${c.key(key)}`,
  });
  return true;
}

export async function postComment(key, text) {
  try {
    return await sendComment(key, text);
  } catch (err) {
    log.warn(`Não consegui comentar em ${key} (${err.message}). O commit segue normalmente.`);
    return false;
  }
}
