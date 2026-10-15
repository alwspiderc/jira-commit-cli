import { buildTree } from '../core/issue-tree.js';
import { truncate } from '../utils/text.js';
import { treeLines } from './issue-lines.js';
import { notice, Separator } from './prompts.js';
import { c } from './theme.js';

export const LAST_TAG = c.ok('★ última usada');

export function issueChoices(issues, branchKey, lastKey) {
  if (!issues.length) return [notice('Nenhuma atividade encontrada nesses status')];

  return treeLines(buildTree(issues, branchKey), { gutter: 2 }).map((l) =>
    l.selectable
      ? {
          name: l.text,
          value: l.issue.key,
          short: `${l.issue.key}  ${truncate(l.issue.summary, 60)}`,
          description: [l.issue.key === lastKey && LAST_TAG, l.issue.summary, l.issue.status]
            .filter(Boolean)
            .join('  ·  '),
        }
      : new Separator(' ' + l.text),
  );
}
