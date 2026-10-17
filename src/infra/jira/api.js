import { defaultClient } from './client.js';
import { t } from '../../i18n/index.js';

const enc = encodeURIComponent;
const EPIC_LINK = 'com.pyxis.greenhopper.jira:gh-epic-link';

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

// As chamadas ao Jira de um cliente (createJiraClient). Os caches valem só para esse cliente
export function createJiraApi(client) {
  const { request, dialect } = client;
  const api = (path) => `${dialect().api}${path}`;
  let epicLinkCache;

  async function search(jql, fields, maxResults) {
    const params = new URLSearchParams({ jql, fields, maxResults: String(maxResults) });
    return (await request(`${dialect().searchPath}?${params}`)).issues;
  }

  async function searchIssues(jql, maxResults = 20) {
    return (await search(jql, 'summary,status,issuetype,parent', maxResults)).map(toIssue);
  }

  async function projectStatuses(projectKey) {
    const data = await request(api(`/project/${enc(projectKey)}/statuses`));
    const byId = new Map();
    for (const type of data) for (const s of type.statuses) byId.set(s.id, { id: s.id, name: s.name });
    return [...byId.values()];
  }

  async function getIssue(key) {
    const data = await request(api(`/issue/${enc(key)}?fields=summary,status,labels,components`));
    return {
      key: data.key,
      summary: data.fields.summary,
      status: data.fields.status?.name,
      labels: data.fields.labels ?? [],
      components: (data.fields.components ?? []).map((c) => ({ id: c.id })),
    };
  }

  async function issueTypes(projectKey) {
    const data = await request(api(`/issue/createmeta/${enc(projectKey)}/issuetypes`));
    return (data.issueTypes ?? data.values).map((t) => ({
      id: t.id,
      name: t.name,
      subtask: Boolean(t.subtask),
      level: t.hierarchyLevel,
    }));
  }

  // Cloud liga a tarefa ao épico pelo parent; Server/DC, pelo campo personalizado "Epic Link"
  async function epicLink() {
    if (dialect().epicByParent) return { field: 'parent', jql: 'parent', value: (key) => ({ key }) };
    if (epicLinkCache === undefined) {
      const field = (await request(api('/field'))).find((f) => f.schema?.custom === EPIC_LINK);
      epicLinkCache = field ? { field: field.id, jql: `cf[${field.schema.customId}]`, value: (key) => key } : null;
    }
    return epicLinkCache;
  }

  async function openEpics(projectKey) {
    const ids = (await issueTypes(projectKey)).filter(dialect().isEpic).map((t) => t.id);
    if (!ids.length || !(await epicLink())) return [];
    const jql = `project = ${projectKey} AND issuetype in (${ids.join(', ')}) AND statusCategory != Done ORDER BY updated DESC`;
    return (await searchIssues(jql, 200)).map(({ key, summary }) => ({ key, summary }));
  }

  async function mostUsedEpic(projectKey, epicKeys) {
    const link = await epicLink();
    if (!link) return null;
    const jql = `project = ${projectKey} AND assignee = currentUser() AND ${link.jql} is not EMPTY ORDER BY created DESC`;
    const count = new Map();
    for (const issue of await search(jql, link.field, 50)) {
      const value = issue.fields[link.field];
      const key = typeof value === 'string' ? value : value?.key;
      if (epicKeys.has(key)) count.set(key, (count.get(key) ?? 0) + 1);
    }
    return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }

  function getMyself() {
    return request(api('/myself'));
  }

  async function storyPointsField(projectKey, issueTypeName) {
    const type = (await issueTypes(projectKey)).find((t) => t.name === issueTypeName);
    if (!type) return null;
    const data = await request(api(`/issue/createmeta/${enc(projectKey)}/issuetypes/${type.id}?maxResults=200`));
    const points = (data.fields ?? data.values).filter((f) => /story point/i.test(f.name) && f.schema?.type === 'number');
    return (points.find((f) => /estimate/i.test(f.name)) ?? points[0])?.fieldId ?? null;
  }

  async function activeSprint(projectKey, boardId) {
    const boards = boardId
      ? [{ id: boardId }]
      : ((await request(`/rest/agile/1.0/board?projectKeyOrId=${enc(projectKey)}`)).values ?? []);
    for (const board of boards) {
      try {
        const sprints = await request(`/rest/agile/1.0/board/${board.id}/sprint?state=active`);
        if (sprints.values?.length) return { id: sprints.values[0].id, name: sprints.values[0].name };
      } catch {
        // quadro Kanban não tem sprints e responde erro: tenta o próximo
      }
    }
    return null;
  }

  function moveToSprint(sprintId, key) {
    return request(`/rest/agile/1.0/sprint/${sprintId}/issue`, { method: 'POST', body: { issues: [key] } });
  }

  // description é { paragraphs, files }: o dialeto formata (ADF no Cloud, wiki markup no Server)
  async function createIssue({
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
      assignee: dialect().assignee(me),
    };
    if (parentKey) fields.parent = { key: parentKey };
    else if (epicKey) {
      const link = await epicLink();
      if (link) fields[link.field] = link.value(epicKey);
    }
    const text = description && dialect().document({ ...description, filesTitle: t.jira.changedFiles });
    if (text) fields.description = text;
    if (labels?.length) fields.labels = labels;
    if (components?.length) fields.components = components;
    if (storyPoints) fields[storyPoints.field] = storyPoints.value;

    const data = await request(api('/issue'), { method: 'POST', body: { fields } });
    return data.key;
  }

  async function getTransitions(key) {
    const data = await request(api(`/issue/${enc(key)}/transitions`));
    return data.transitions.map((t) => ({ id: t.id, to: t.to?.name ?? t.name }));
  }

  function addComment(key, paragraphs) {
    return request(api(`/issue/${enc(key)}/comment`), {
      method: 'POST',
      body: { body: dialect().document({ paragraphs, filesTitle: t.jira.changedFiles }) },
    });
  }

  function transitionIssue(key, transitionId) {
    return request(api(`/issue/${enc(key)}/transitions`), {
      method: 'POST',
      body: { transition: { id: transitionId } },
    });
  }

  return {
    searchIssues,
    projectStatuses,
    getIssue,
    issueTypes,
    openEpics,
    mostUsedEpic,
    getMyself,
    storyPointsField,
    activeSprint,
    moveToSprint,
    createIssue,
    getTransitions,
    addComment,
    transitionIssue,
  };
}

// Atalhos para a CLI: as mesmas funções, no cliente padrão (o do useSite). A API é recriada só
// quando o cliente padrão muda, para o cache do Epic Link valer durante o comando
let cached = { client: null, api: null };
function defaultApi() {
  const client = defaultClient();
  if (cached.client !== client) cached = { client, api: createJiraApi(client) };
  return cached.api;
}

export const searchIssues = (...args) => defaultApi().searchIssues(...args);
export const projectStatuses = (...args) => defaultApi().projectStatuses(...args);
export const getIssue = (...args) => defaultApi().getIssue(...args);
export const issueTypes = (...args) => defaultApi().issueTypes(...args);
export const openEpics = (...args) => defaultApi().openEpics(...args);
export const mostUsedEpic = (...args) => defaultApi().mostUsedEpic(...args);
export const getMyself = (...args) => defaultApi().getMyself(...args);
export const storyPointsField = (...args) => defaultApi().storyPointsField(...args);
export const activeSprint = (...args) => defaultApi().activeSprint(...args);
export const moveToSprint = (...args) => defaultApi().moveToSprint(...args);
export const createIssue = (...args) => defaultApi().createIssue(...args);
export const getTransitions = (...args) => defaultApi().getTransitions(...args);
export const addComment = (...args) => defaultApi().addComment(...args);
export const transitionIssue = (...args) => defaultApi().transitionIssue(...args);
