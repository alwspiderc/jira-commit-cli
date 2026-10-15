export function wikiText({ paragraphs = [], files = [], filesTitle = 'Arquivos alterados' }) {
  const parts = [...paragraphs];
  if (files.length) parts.push(`h4. ${filesTitle}`, files.map((f) => `* {{${f}}}`).join('\n'));
  return parts.length ? parts.join('\n\n') : undefined;
}
