import { parseIssueKey } from './commit-message.js';

export function myIssuesJql(projectKey, statusIds) {
  const filter = statusIds?.length ? `status IN (${statusIds.join(', ')})` : 'statusCategory != Done';
  return `project = ${projectKey} AND assignee = currentUser() AND ${filter} ORDER BY updated DESC`;
}

export function projectSearchJql(projectKey, term) {
  const t = term.trim();
  const key = parseIssueKey(projectKey, t);
  if (key) return `key = ${key}`;
  // apagar a pontuação colaria as palavras ("README.md" → "READMEmd")
  const words = t.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2);
  if (!words.length) return null;
  const title = words.map((w) => `summary ~ "${w}*"`).join(' AND ');
  return `project = ${projectKey} AND statusCategory != Done AND ${title} ORDER BY updated DESC`;
}
