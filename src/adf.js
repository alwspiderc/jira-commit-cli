// A API v3 do Jira só aceita descrição em ADF (Atlassian Document Format).

const text = (t) => ({ type: 'text', text: t });
const paragraph = (t) => ({ type: 'paragraph', content: [text(t)] });

/**
 * Descrição de uma issue criada a partir de um commit:
 * corpo do commit em parágrafos + lista de arquivos alterados.
 * Devolve undefined se não houver nada para pôr.
 */
export function commitDescription({ body = '', files = [] }) {
  const content = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(paragraph);

  if (files.length) {
    content.push({
      type: 'heading',
      attrs: { level: 4 },
      content: [text('Arquivos alterados')],
    });
    content.push({
      type: 'bulletList',
      content: files.map((f) => ({
        type: 'listItem',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: f, marks: [{ type: 'code' }] }] }],
      })),
    });
  }

  return content.length ? { type: 'doc', version: 1, content } : undefined;
}
