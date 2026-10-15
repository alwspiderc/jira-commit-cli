import { t } from '../i18n/index.js';
import { card } from './output.js';
import { badge, c, colorCommitLine, icon } from './theme.js';

export function summaryCard({ key, title, created, parentKey, movedTo, epic, sprint, points, commented }, message, link) {
  const details = [
    created && (parentKey ? t.card.newSubtask(c.key(parentKey)) : c.ok(t.card.newIssue)),
    epic && t.card.epic(c.key(epic)),
    sprint && c.info(sprint),
    points && c.warn(t.card.points(points)),
    movedTo && t.card.status(c.accent(movedTo)),
    commented && c.ok(t.card.commented),
  ].filter(Boolean);

  card(
    `${icon.ok} ${c.bold(created ? t.card.created : t.card.linked)}`,
    [
      `${badge(key, created ? 'ok' : 'info')}  ${c.bold(title ?? '')}`,
      ...(details.length ? [details.join(c.dim('  ·  '))] : []),
      '',
      colorCommitLine(message, key),
      ...(link ? [`${icon.link} ${c.link(link)}`] : []),
    ],
    { color: created ? c.ok : c.accent },
  );
}
