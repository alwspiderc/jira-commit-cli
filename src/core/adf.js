const text = (t, marks) => ({ type: 'text', text: t, ...(marks && { marks }) });
const paragraph = (t, marks) => ({ type: 'paragraph', content: [text(t, marks)] });
const code = (t) => paragraph(t, [{ type: 'code' }]);

export function commitDescription({ body = '', files = [] }) {
  const content = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => paragraph(p));

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

  return content.length ? { type: 'doc', version: 1, content } : undefined;
}
