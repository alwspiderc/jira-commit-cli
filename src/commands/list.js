import { buildTree } from '../core/issue-tree.js';
import { loadProjectConfig } from '../infra/storage/project-config.js';
import { findMyIssues } from '../services/issues.js';
import { c, header, log, treeLines, withSpinner } from '../ui/index.js';

export async function list(args = []) {
  const cfg = loadProjectConfig();
  const { all, status } = parseArgs(args);
  header(`${cfg.projectKey} · suas atividades`, c.dim(filterLabel(cfg, { all, status })));

  const issues = await withSpinner('Buscando no Jira…', () => findMyIssues(cfg, { all, status }));

  if (!issues.length) {
    log.info('Nenhuma atividade encontrada com esse filtro.');
    if (!all) log.hint('Tente: jira-commit list --todos');
    console.log();
    return;
  }

  for (const l of treeLines(buildTree(issues), { productSeparator: cfg.productSeparator })) console.log(l.text);

  console.log();
  const limitHit = issues.length >= cfg.maxResults;
  log.hint(
    `${issues.length} atividade${issues.length === 1 ? '' : 's'}` +
      (limitHit ? ` (limite de ${cfg.maxResults}, aumente "maxResults")` : '') +
      (!all && !status ? '  ·  --todos para ver todas' : ''),
  );
  console.log();
}

function parseArgs(args) {
  const all = args.includes('--todos') || args.includes('--all');
  const statusIdx = args.indexOf('--status');
  const status = statusIdx >= 0 ? args[statusIdx + 1] : undefined;
  if (statusIdx >= 0 && !status) throw new Error('Uso: jira-commit list --status "NOME DO STATUS"');
  return { all, status };
}

function filterLabel(cfg, { all, status }) {
  if (status) return `status ${status}`;
  if (all) return 'todas as abertas';
  if (cfg.jql) return 'JQL do projeto';
  return cfg.statuses?.join(', ') ?? 'todas as abertas';
}
