import { loadProjectConfig, buildJql } from '../config.js';
import { searchIssues } from '../jira.js';
import { buildTree, treeLines } from '../tree.js';
import { c, header, log, withSpinner } from '../ui.js';

/** jira-commit list [--todos] [--status "NOME"] */
export async function list(args = []) {
  const cfg = loadProjectConfig();
  const all = args.includes('--todos') || args.includes('--all');
  const statusIdx = args.indexOf('--status');
  const status = statusIdx >= 0 ? args[statusIdx + 1] : undefined;
  if (statusIdx >= 0 && !status) throw new Error('Uso: jira-commit list --status "NOME DO STATUS"');

  const filter = status
    ? `status ${status}`
    : all
      ? 'todas as abertas'
      : cfg.jql
        ? 'JQL do projeto'
        : (cfg.statuses?.join(', ') ?? 'todas as abertas');
  header(`${cfg.projectKey} · suas atividades`, c.dim(filter));

  const issues = await withSpinner('Buscando no Jira…', async () =>
    searchIssues(await buildJql(cfg, { all, status }), cfg.maxResults),
  );

  if (!issues.length) {
    log.info('Nenhuma atividade encontrada com esse filtro.');
    if (!all) log.hint('Tente: jira-commit list --todos');
    console.log();
    return;
  }

  for (const l of treeLines(buildTree(issues))) console.log(l.text);

  console.log();
  const limitHit = issues.length >= cfg.maxResults;
  log.hint(
    `${issues.length} atividade${issues.length === 1 ? '' : 's'}` +
      (limitHit ? ` (limite de ${cfg.maxResults}, aumente "maxResults")` : '') +
      (!all && !status ? '  ·  --todos para ver todas' : ''),
  );
  console.log();
}
