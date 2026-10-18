import { matchIssues } from './issue-match.js';
import { buildTree } from './issue-tree.js';
import { projectSearchJql } from './jql.js';

// Regras do menu de atividades, sem aparência: quem desenha é a interface (terminal ou editor)

// A última usada nesta branch que saiu da lista (ex.: mudou de status) aparece à parte, no topo.
// Se ela é a da branch, não: a da branch já tem destaque próprio
export function unlistedLastKey(issues, { branchKey, lastKey }) {
  return lastKey && lastKey !== branchKey && !issues.some((i) => i.key === lastKey) ? lastKey : null;
}

// Onde o cursor começa: na atividade da branch, senão na última usada, senão na primeira que dá
// para escolher. Nunca numa ação, para um Enter sem querer não criar nada.
// extraKeys: chaves que aparecem no menu fora da lista (a última usada à parte)
export function initialKey(issues, { branchKey, lastKey, extraKeys = [] }) {
  const listed = new Set([...extraKeys, ...issues.map((i) => i.key)]);
  return [branchKey, lastKey].find((k) => k && listed.has(k)) ?? firstSelectable(issues, branchKey);
}

// Na árvore, a família da branch vem primeiro; o pai que não está na lista é só contexto
function firstSelectable(issues, focusKey) {
  const [first] = buildTree(issues, focusKey);
  if (!first) return undefined;
  return first.inList ? first.root.key : first.children[0]?.key;
}

// Busca no menu: as suas filtradas na hora, mais as do projeto que a busca no Jira trouxer.
// remote é { status: 'idle' | 'loading' | 'done' | 'error', results }
export function searchGroups(issues, term, remote, projectKey) {
  const local = matchIssues(issues, term);
  const isMine = (r) => issues.some((i) => i.key === r.key);
  const mine = [...local, ...remote.results.filter((r) => isMine(r) && !local.some((l) => l.key === r.key))];
  const others = remote.results.filter((r) => !isMine(r));
  // termo curto demais não vai para o Jira: não há o que esperar
  const searching = remote.status === 'loading' && Boolean(projectSearchJql(projectKey, term));
  const failed = remote.status === 'error';
  return { mine, others, searching, failed, empty: !mine.length && !others.length && !searching && !failed };
}
