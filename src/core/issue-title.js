export const DEFAULT_PRODUCT_SEPARATOR = ' | ';

export function capitalizeTitle(title, prefix = '') {
  const head = prefix && title.startsWith(prefix) ? prefix : headLike(title, prefix);
  return head + title.slice(head.length).replace(/^([^\p{L}\p{N}]*)(\p{Ll})/u, (_, lead, letter) => lead + letter.toUpperCase());
}

/** Prefixo editado ("OUTRO | Mobile: ..."): vale o trecho até o mesmo sinal que fecha o prefixo (":"). */
function headLike(title, prefix) {
  const end = prefix.trimEnd().slice(-1);
  if (!end || /[\p{L}\p{N}]/u.test(end)) return '';
  const idx = title.indexOf(end);
  return idx >= 0 ? title.slice(0, idx + 1) : '';
}

export function resolvePrefix(template, product) {
  if (!template) return '';
  if (!template.includes('{product}')) return template;
  return product ? template.replace('{product}', product) : '';
}

export function productOf(summary = '', separator = DEFAULT_PRODUCT_SEPARATOR) {
  const idx = summary.indexOf(separator);
  return idx > 0 ? summary.slice(0, idx).trim() : '';
}

export function mostCommonProduct(issues, separator = DEFAULT_PRODUCT_SEPARATOR) {
  const count = new Map();
  for (const i of issues) {
    const p = productOf(i.summary, separator);
    if (p) count.set(p, (count.get(p) ?? 0) + 1);
  }
  const [best] = [...count.entries()].sort((a, b) => b[1] - a[1]);
  return best?.[0] ?? '';
}
