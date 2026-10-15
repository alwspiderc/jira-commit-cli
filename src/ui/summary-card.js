import { card } from './output.js';
import { t } from '../i18n/index.js';
import { c, icon } from './theme.js';

export function summaryCard({ key, title, created, parentKey, movedTo, epic, sprint, points, commented }, message, link) {
  const details = [
    created && (parentKey ? t.card.newSubtask(c.key(parentKey)) : t.card.newIssue),
    epic && t.card.epic(c.key(epic)),
    sprint && c.accent(sprint),
    points && t.card.points(points),
    movedTo && t.card.status(c.accent(movedTo)),
    commented && t.card.commented,
  ].filter(Boolean);

  card(`${icon.ok} ${created ? t.card.created : t.card.linked}`, [
    `${c.key(key)}  ${title ?? ''}`,
    ...(details.length ? [c.dim(details.join('  ·  '))] : []),
    '',
    c.dim(message),
    ...(link ? [`${icon.link} ${c.dim(link)}`] : []),
  ]);
}
