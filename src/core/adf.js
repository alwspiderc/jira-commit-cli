const text = (t, marks) => ({ type: 'text', text: t, ...(marks && { marks }) });
const paragraph = (t, marks) => ({ type: 'paragraph', content: [text(t, marks)] });
const code = (t) => paragraph(t, [{ type: 'code' }]);
const doc = (content) => (content.length ? { type: 'doc', version: 1, content } : undefined);

const paragraphs = (body, separator) =>
  body
    .split(separator)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => paragraph(p));

export function commentDocument(text = '') {
  return doc(paragraphs(text, '|'));
}

export function commitDescription({ body = '', files = [] }) {
  const content = paragraphs(body, /\n\s*\n/);

  if (files.length) {
    content.push({
      type: 'heading',
      attrs: { level: 4 },
      content: [text('Arquivos alterados')],
    });
    content.push({
      type: 'bulletList',
      content: files.map((f) => ({ type: 'listItem', content: [code(f)] })),
    });
  }

  return doc(content);
}
