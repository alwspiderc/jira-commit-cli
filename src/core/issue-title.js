const PRODUCT_SEPARATOR = ' | ';

export function capitalizeTitle(title, prefix = '') {
  const head = prefix && title.startsWith(prefix) ? prefix : '';
  return head + title.slice(head.length).replace(/^(\s*)(\p{Ll})/u, (_, space, letter) => space + letter.toUpperCase());
}

export function resolvePrefix(template, product) {
  if (!template) return '';
  if (!template.includes('{product}')) return template;
  return product ? template.replace('{product}', product) : '';
}

export function productOf(summary = '') {
  const idx = summary.indexOf(PRODUCT_SEPARATOR);
  return idx > 0 ? summary.slice(0, idx).trim() : '';
}

export function mostCommonProduct(issues) {
  const count = new Map();
  for (const i of issues) {
    const p = productOf(i.summary);
    if (p) count.set(p, (count.get(p) ?? 0) + 1);
  }
  const [best] = [...count.entries()].sort((a, b) => b[1] - a[1]);
  return best?.[0] ?? '';
}
