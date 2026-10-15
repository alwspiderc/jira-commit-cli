import { buildTree } from '../core/issue-tree.js';
import { t } from '../i18n/index.js';
import { findMyIssues } from '../services/issues.js';
import { openProject } from '../services/project.js';
import { c, header, log, treeLines, withSpinner } from '../ui/index.js';

export async function list(args = []) {
  const cfg = openProject();
  const { all, status } = parseArgs(args);
  header(`${cfg.projectKey} · ${t.list.title}`, c.dim(filterLabel(cfg, { all, status })));

  const issues = await withSpinner(t.list.searching, () => findMyIssues(cfg, { all, status }));

  if (!issues.length) {
    log.info(t.list.none);
    if (!all) log.hint(t.list.tryAll);
    console.log();
    return;
  }

  for (const l of treeLines(buildTree(issues), { productSeparator: cfg.productSeparator })) console.log(l.text);

  console.log();
  const limitHit = issues.length >= cfg.maxResults;
  log.hint(
    t.list.count(issues.length) + (limitHit ? t.list.limit(cfg.maxResults) : '') + (!all && !status ? t.list.showAll : ''),
  );
  console.log();
}

function parseArgs(args) {
  const all = args.includes('--todos') || args.includes('--all');
  const statusIdx = args.indexOf('--status');
  const status = statusIdx >= 0 ? args[statusIdx + 1] : undefined;
  if (statusIdx >= 0 && !status) throw new Error(t.errors.listStatusUsage);
  return { all, status };
}

function filterLabel(cfg, { all, status }) {
  if (status) return t.list.status(status);
  if (all) return t.list.allOpen;
  if (cfg.jql) return t.list.projectJql;
  return cfg.statuses?.join(', ') ?? t.list.allOpen;
}
