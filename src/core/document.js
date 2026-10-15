const split = (text, separator) =>
  text
    .split(separator)
    .map((p) => p.trim())
    .filter(Boolean);

export const bodyParagraphs = (body = '') => split(body, /\n\s*\n/);

export const commentParagraphs = (text = '') => split(text, '|');
