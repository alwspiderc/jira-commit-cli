export function buildTree(issues, focusKey) {
  const byKey = new Map(issues.map((i) => [i.key, i]));
  const families = new Map();

  for (const issue of issues) {
    const rootKey = issue.parent?.key ?? issue.key;
    if (!families.has(rootKey)) {
      const root = byKey.get(rootKey) ?? issue.parent;
      families.set(rootKey, { root, inList: byKey.has(rootKey), children: [] });
    }
    if (issue.parent) families.get(rootKey).children.push(issue);
  }

  const list = [...families.values()];
  const hasFocus = (f) => f.root.key === focusKey || f.children.some((c) => c.key === focusKey);
  return [...list.filter(hasFocus), ...list.filter((f) => !hasFocus(f))];
}
