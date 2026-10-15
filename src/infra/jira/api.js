import { request } from './client.js';

const enc = encodeURIComponent;
const EPIC_LEVEL = 1;

function toIssue(raw) {
  const { summary, status, issuetype, parent } = raw.fields;
  return {
    key: raw.key,
    summary,
    status: status?.name,
    statusCategory: status?.statusCategory?.key,
    type: issuetype?.name,
    parent:
      issuetype?.subtask && parent
        ? {
            key: parent.key,
            summary: parent.fields?.summary ?? '',
            status: parent.fields?.status?.name,
            statusCategory: parent.fields?.status?.statusCategory?.key,
          }
        : null,
  };
}

export async function searchIssues(jql, maxResults = 20) {
  const params = new URLSearchParams({
    jql,
    fields: 'summary,status,issuetype,parent',
    maxResults: String(maxResults),
  });
  const data = await request(`/rest/api/3/search/jql?${params}`);
  return data.issues.map(toIssue);
}

export async function projectStatuses(projectKey) {
  const data = await request(`/rest/api/3/project/${enc(projectKey)}/statuses`);
  const byId = new Map();
  for (const type of data) for (const s of type.statuses) byId.set(s.id, { id: s.id, name: s.name });
  return [...byId.values()];
}

export async function getIssue(key) {
  const data = await request(`/rest/api/3/issue/${enc(key)}?fields=summary,status,labels,components`);
  return {
    key: data.key,
    summary: data.fields.summary,
    status: data.fields.status?.name,
    labels: data.fields.labels ?? [],
    components: (data.fields.components ?? []).map((c) => ({ id: c.id })),
  };
}

export async function issueTypes(projectKey) {
  const data = await request(`/rest/api/3/issue/createmeta/${enc(projectKey)}/issuetypes`);
  return data.issueTypes.map((t) => ({
    id: t.id,
    name: t.name,
    subtask: Boolean(t.subtask),
    level: t.hierarchyLevel,
  }));
}

export async function openEpics(projectKey) {
  const ids = (await issueTypes(projectKey)).filter((t) => t.level === EPIC_LEVEL).map((t) => t.id);
  if (!ids.length) return [];
  const jql = `project = ${projectKey} AND issuetype in (${ids.join(', ')}) AND statusCategory != Done ORDER BY updated DESC`;
  return (await searchIssues(jql, 200)).map(({ key, summary }) => ({ key, summary }));
}

export async function mostUsedEpic(projectKey, epicKeys) {
  const params = new URLSearchParams({
    jql: `project = ${projectKey} AND assignee = currentUser() AND parent is not EMPTY ORDER BY created DESC`,
    fields: 'parent',
    maxResults: '50',
  });
  const data = await request(`/rest/api/3/search/jql?${params}`);
  const count = new Map();
  for (const i of data.issues) {
    const key = i.fields.parent?.key;
    if (epicKeys.has(key)) count.set(key, (count.get(key) ?? 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function getMyself() {
  return request('/rest/api/3/myself');
}

export async function storyPointsField(projectKey, issueTypeName) {
  const type = (await issueTypes(projectKey)).find((t) => t.name === issueTypeName);
  if (!type) return null;
  const data = await request(`/rest/api/3/issue/createmeta/${enc(projectKey)}/issuetypes/${type.id}?maxResults=200`);
  const points = data.fields.filter((f) => /story point/i.test(f.name) && f.schema?.type === 'number');
  return (points.find((f) => /estimate/i.test(f.name)) ?? points[0])?.fieldId ?? null;
}

export async function activeSprint(projectKey) {
  const boards = await request(`/rest/agile/1.0/board?projectKeyOrId=${enc(projectKey)}`);
  for (const board of boards.values ?? []) {
    try {
      const sprints = await request(`/rest/agile/1.0/board/${board.id}/sprint?state=active`);
      if (sprints.values?.length) return { id: sprints.values[0].id, name: sprints.values[0].name };
    } catch {
      // quadro Kanban não tem sprints e responde erro: tenta o próximo
    }
  }
  return null;
}

export function moveToSprint(sprintId, key) {
  return request(`/rest/agile/1.0/sprint/${sprintId}/issue`, { method: 'POST', body: { issues: [key] } });
}

export async function createIssue({
  projectKey,
  summary,
  issueType,
  parentKey,
  epicKey,
  description,
  labels,
  components,
  storyPoints,
}) {
  const me = await getMyself();
  const fields = {
    project: { key: projectKey },
    summary,
    issuetype: { name: issueType },
    assignee: { accountId: me.accountId },
  };
  if (parentKey || epicKey) fields.parent = { key: parentKey ?? epicKey };
  if (description) fields.description = description;
  if (labels?.length) fields.labels = labels;
  if (components?.length) fields.components = components;
  if (storyPoints) fields[storyPoints.field] = storyPoints.value;

  const data = await request('/rest/api/3/issue', { method: 'POST', body: { fields } });
  return data.key;
}

export async function getTransitions(key) {
  const data = await request(`/rest/api/3/issue/${enc(key)}/transitions`);
  return data.transitions.map((t) => ({ id: t.id, to: t.to?.name ?? t.name }));
}

export function addComment(key, body) {
  return request(`/rest/api/3/issue/${enc(key)}/comment`, { method: 'POST', body: { body } });
}

export function transitionIssue(key, transitionId) {
  return request(`/rest/api/3/issue/${enc(key)}/transitions`, {
    method: 'POST',
    body: { transition: { id: transitionId } },
  });
}
