import { commentParagraphs } from '../core/document.js';
import { t } from '../i18n/index.js';
import { addComment } from '../infra/jira/api.js';
import { BACK, c, field, log, withSpinner } from '../ui/index.js';

export async function askComment(current = '') {
  const text = await field({
    message: `${t.comment.message} ${c.dim(`· ${t.comment.hint}`)}`,
    default: current || undefined,
    prefill: 'editable',
    back: true,
  });
  return text === BACK ? BACK : text.trim();
}

export async function sendComment(key, text) {
  const paragraphs = commentParagraphs(text);
  if (!paragraphs.length) return false;
  await withSpinner(t.comment.sending, () => addComment(key, paragraphs), {
    done: t.comment.sent(c.key(key)),
  });
  return true;
}

export async function postComment(key, text) {
  try {
    return await sendComment(key, text);
  } catch (err) {
    log.warn(t.comment.failed(key, err.message));
    return false;
  }
}
