import { loadProjectConfig, buildJql } from '../config.js';
import { searchIssues } from '../jira.js';
import { buildTree, treeLines } from '../tree.js';

/** jira-commit list [--todos] [--status "NOME"] */
export async function list(args = []) {
  const cfg = loadProjectConfig();
  const all = args.includes('--todos') || args.includes('--all');
  const statusIdx = args.indexOf('--status');
  const status = statusIdx >= 0 ? args[statusIdx + 1] : undefined;
  if (statusIdx >= 0 && !status) throw new Error('Uso: jira-commit list --status "NOME DO STATUS"');

  const issues = await searchIssues(await buildJql(cfg, { all, status }), cfg.maxResults);

  if (!issues.length) {
    console.log('Nenhuma atividade encontrada com esse filtro.');
    return;
  }
  for (const l of treeLines(buildTree(issues))) console.log(l.text);
}
