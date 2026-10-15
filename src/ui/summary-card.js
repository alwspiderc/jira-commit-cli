import { card } from './output.js';
import { c, icon } from './theme.js';

export function summaryCard({ key, title, created, parentKey, movedTo, epic, sprint, points, commented }, message, link) {
  const details = [
    created && (parentKey ? `nova subtarefa de ${c.key(parentKey)}` : 'nova atividade'),
    epic && `épico ${c.key(epic)}`,
    sprint && c.accent(sprint),
    points && `${points} pts`,
    movedTo && `status ${c.accent(movedTo)}`,
    commented && 'comentário adicionado',
  ].filter(Boolean);

  card(created ? `${icon.ok} Atividade criada e vinculada` : `${icon.ok} Commit vinculado`, [
    `${c.key(key)}  ${title ?? ''}`,
    ...(details.length ? [c.dim(details.join('  ·  '))] : []),
    '',
    c.dim(message),
    ...(link ? [`${icon.link} ${c.dim(link)}`] : []),
  ]);
}
