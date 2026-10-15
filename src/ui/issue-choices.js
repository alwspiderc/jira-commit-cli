import { buildTree } from '../core/issue-tree.js';
import { truncate } from '../utils/text.js';
import { treeLines } from './issue-lines.js';
import { notice, Separator } from './prompts.js';
import { t } from '../i18n/index.js';
import { c } from './theme.js';

export const lastTag = () => c.ok(t.common.lastUsed);

export function issueChoices(issues, { branchKey, lastKey, productSeparator } = {}) {
  if (!issues.length) return [notice(t.common.noIssuesInStatuses)];

  return treeLines(buildTree(issues, branchKey), { gutter: 2, productSeparator }).map((l) =>
    l.selectable
      ? {
          name: l.text,
          value: l.issue.key,
          short: `${l.issue.key}  ${truncate(l.issue.summary, 60)}`,
          description: [l.issue.key === lastKey && lastTag(), l.issue.summary, l.issue.status]
            .filter(Boolean)
            .join('  ·  '),
        }
      : new Separator(' ' + l.text),
  );
}
