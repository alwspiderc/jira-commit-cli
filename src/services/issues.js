import { issueTypes, mostUsedEpic, openEpics, projectStatuses, searchIssues } from '../infra/jira/api.js';
import { getRepoState } from '../infra/storage/repo-state.js';
import { myIssuesJql, projectSearchJql } from '../core/jql.js';
import { t } from '../i18n/index.js';

export async function buildJql(cfg, { all = false, status } = {}) {
  if (cfg.jql && !all && !status) return cfg.jql;
  const names = status ? [status] : all ? null : cfg.statuses;
  const ids = names?.length ? await statusIds(cfg.projectKey, names) : null;
  return myIssuesJql(cfg.projectKey, ids);
}

// O JQL só aceita o nome original do status; com o nome traduzido a busca volta vazia, sem erro
async function statusIds(projectKey, names) {
  const statuses = await projectStatuses(projectKey);
  const norm = (s) => s.trim().toLowerCase();
  return names.map((name) => {
    const found = statuses.find((s) => norm(s.name) === norm(name));
    if (!found) {
      const valid = statuses.map((s) => `"${s.name}"`).join(', ');
      throw new Error(t.errors.unknownStatus(name, projectKey, valid));
    }
    return found.id;
  });
}

export async function findMyIssues(cfg, filter) {
  return searchIssues(await buildJql(cfg, filter), cfg.maxResults);
}

export async function searchProject(cfg, term) {
  const jql = projectSearchJql(cfg.projectKey, term);
  return jql ? searchIssues(jql, cfg.maxResults) : [];
}

export async function loadEpics(cfg) {
  const epics = await openEpics(cfg.projectKey);
  const state = getRepoState();
  if ('lastEpic' in state) return { epics, suggested: state.lastEpic, why: t.fields.lastEpic };
  const keys = new Set(epics.map((e) => e.key));
  return { epics, suggested: epics.length ? await mostUsedEpic(cfg.projectKey, keys) : null, why: t.fields.mostUsedEpic };
}

let subtaskTypeCache;

export async function subtaskTypeName(cfg) {
  if (cfg.subtaskType) return cfg.subtaskType;
  subtaskTypeCache ??= (await issueTypes(cfg.projectKey)).find((t) => t.subtask)?.name;
  if (!subtaskTypeCache) throw new Error(t.errors.noSubtaskType(cfg.projectKey));
  return subtaskTypeCache;
}
