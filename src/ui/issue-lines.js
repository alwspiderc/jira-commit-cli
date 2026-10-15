import { styleText } from 'node:util';
import { truncate } from '../utils/text.js';
import { STATUS_COLORS } from './theme.js';

const STATUS_DOT = '● ';

export function treeLines(families, { width = process.stdout.columns || 100, gutter = 0, productSeparator = ' | ' } = {}) {
  const all = families.flatMap((f) => [f.root, ...f.children]);
  if (!all.length) return [];
  const keyWidth = Math.max(...all.map((i) => i.key.length));
  const statusWidth = STATUS_DOT.length + Math.max(...all.map((i) => (i.status ?? '').length));
  const summaryWidth = Math.max(20, width - gutter - keyWidth - 2 - 2 - statusWidth - 1);

  const line = (issue, branch, selectable) => {
    const max = summaryWidth - branch.length;
    const summary = truncate(issue.summary.trim(), max).padEnd(max);
    const keyStyle = !selectable ? 'dim' : branch ? 'cyanBright' : ['bold', 'cyanBright'];
    const key = styleText(keyStyle, issue.key.padEnd(keyWidth));
    const title = selectable ? dimProduct(summary, productSeparator) : styleText('dim', summary);
    return `${styleText('magenta', branch)}${key}  ${title}  ${statusTag(issue)}`;
  };

  const lines = [];
  for (const f of families) {
    lines.push({ issue: f.root, selectable: f.inList, text: line(f.root, '', f.inList) });
    f.children.forEach((child, idx) => {
      const branch = idx === f.children.length - 1 ? '└─ ' : '├─ ';
      lines.push({ issue: child, selectable: true, text: line(child, branch, true) });
    });
  }
  return lines;
}

function statusTag(issue) {
  if (!issue.status) return '';
  return styleText(STATUS_COLORS[issue.statusCategory] ?? 'gray', STATUS_DOT + issue.status);
}

function dimProduct(summary, separator) {
  const idx = summary.indexOf(separator);
  if (idx <= 0) return summary;
  const end = idx + separator.length;
  return styleText('dim', summary.slice(0, end)) + summary.slice(end);
}
