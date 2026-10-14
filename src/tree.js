import { styleText } from 'node:util';

/**
 * Agrupa subtarefas debaixo da tarefa pai, mantendo a ordem da busca.
 * Quando o pai não veio na busca (outro status, outro responsável), ele aparece
 * mesmo assim como cabeçalho, com inList = false.
 * focusKey (ex.: chave da branch) puxa a família dele para o topo.
 */
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

/**
 * Linhas da árvore prontas para imprimir:
 * { issue, text, selectable }. `gutter` é quanto o chamador põe antes de cada linha.
 */
export function treeLines(families, { width = process.stdout.columns || 100, gutter = 0 } = {}) {
  const all = families.flatMap((f) => [f.root, ...f.children]);
  if (!all.length) return [];
  const keyWidth = Math.max(...all.map((i) => i.key.length));
  const statusWidth = Math.max(...all.map((i) => (i.status ?? '').length));
  // largura do título numa linha sem "├─ "; status fica alinhado numa coluna à direita
  const summaryWidth = Math.max(20, width - gutter - keyWidth - 2 - 2 - statusWidth - 1);

  const line = (issue, branch, selectable) => {
    const status = statusTag(issue);
    const max = summaryWidth - branch.length;
    const summary = truncate(issue.summary.trim(), max).padEnd(max);
    const key = selectable
      ? styleText(['bold', 'cyan'], issue.key.padEnd(keyWidth))
      : styleText('dim', issue.key.padEnd(keyWidth));
    const tree = styleText('dim', branch);
    return `${tree}${key}  ${selectable ? highlight(summary) : styleText('dim', summary)}  ${status}`;
  };

  const lines = [];
  for (const f of families) {
    lines.push({ issue: f.root, selectable: f.inList, text: line(f.root, '', f.inList) });
    f.children.forEach((c, idx) => {
      const branch = idx === f.children.length - 1 ? '└─ ' : '├─ ';
      lines.push({ issue: c, selectable: true, text: line(c, branch, true) });
    });
  }
  return lines;
}

const STATUS_COLORS = { new: 'blue', indeterminate: 'yellow', done: 'green' };

function statusTag(issue) {
  return styleText(STATUS_COLORS[issue.statusCategory] ?? 'gray', issue.status ?? '');
}

// "LOJA DO BAIRRO | Mobile: ..." → produto apagado, título em destaque
function highlight(summary) {
  const sep = summary.indexOf(' | ');
  return sep < 0 ? summary : styleText('dim', summary.slice(0, sep + 3)) + summary.slice(sep + 3);
}

function truncate(text, max) {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}
