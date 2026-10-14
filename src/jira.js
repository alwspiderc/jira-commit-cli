import { loadCredentials } from './config.js';

const TIMEOUT_MS = 10_000; // o commit não pode ficar travado esperando o Jira

async function request(path, { method = 'GET', body } = {}) {
  const { baseUrl, email, token } = loadCredentials();
  const auth = Buffer.from(`${email}:${token}`).toString('base64');

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira respondeu ${res.status} em ${method} ${path}: ${text.slice(0, 300)}`);
  }
  return res.status === 204 ? null : res.json();
}

/** Busca issues via JQL (endpoint novo /search/jql). */
export async function searchIssues(jql, maxResults = 20) {
  const params = new URLSearchParams({
    jql,
    fields: 'summary,status,issuetype,parent',
    maxResults: String(maxResults),
  });
  const data = await request(`/rest/api/3/search/jql?${params}`);
  return data.issues.map((i) => {
    const isSubtask = Boolean(i.fields.issuetype?.subtask);
    const parent = i.fields.parent;
    return {
      key: i.key,
      summary: i.fields.summary,
      status: i.fields.status?.name,
      statusCategory: i.fields.status?.statusCategory?.key, // new | indeterminate | done
      type: i.fields.issuetype?.name,
      // só subtarefa tem "pai" aqui; o pai de uma task comum é o épico, que não interessa
      parent:
        isSubtask && parent
          ? {
              key: parent.key,
              summary: parent.fields?.summary ?? '',
              status: parent.fields?.status?.name,
              statusCategory: parent.fields?.status?.statusCategory?.key,
            }
          : null,
    };
  });
}

/** Status do projeto como { id, name }, com o nome no idioma do usuário (ex.: "Tarefas pendentes"). */
export async function projectStatuses(projectKey) {
  const data = await request(`/rest/api/3/project/${encodeURIComponent(projectKey)}/statuses`);
  const byId = new Map();
  for (const type of data) for (const s of type.statuses) byId.set(s.id, { id: s.id, name: s.name });
  return [...byId.values()];
}

export async function getIssue(key) {
  const data = await request(
    `/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,status,labels,components`,
  );
  return {
    key: data.key,
    summary: data.fields.summary,
    status: data.fields.status?.name,
    labels: data.fields.labels ?? [],
    components: (data.fields.components ?? []).map((c) => ({ id: c.id })),
  };
}

/** Tipos de issue que dá para criar no projeto: { id, name, subtask }. */
export async function issueTypes(projectKey) {
  const data = await request(`/rest/api/3/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes`);
  return data.issueTypes.map((t) => ({ id: t.id, name: t.name, subtask: Boolean(t.subtask) }));
}

export function getMyself() {
  return request('/rest/api/3/myself');
}

/**
 * Cria a issue já atribuída a quem está commitando e devolve a chave (ex.: PROJ-123).
 * Com parentKey vira subtarefa (o sprint vem do pai automaticamente).
 * description é um documento ADF (ver adf.js).
 */
export async function createIssue({ projectKey, summary, issueType, parentKey, description, labels, components }) {
  const me = await getMyself();
  const fields = {
    project: { key: projectKey },
    summary,
    issuetype: { name: issueType },
    assignee: { accountId: me.accountId },
  };
  if (parentKey) fields.parent = { key: parentKey };
  if (description) fields.description = description;
  if (labels?.length) fields.labels = labels;
  if (components?.length) fields.components = components;

  const data = await request('/rest/api/3/issue', { method: 'POST', body: { fields } });
  return data.key;
}

/** Transições possíveis a partir do status atual: { id, to }. */
export async function getTransitions(key) {
  const data = await request(`/rest/api/3/issue/${encodeURIComponent(key)}/transitions`);
  return data.transitions.map((t) => ({ id: t.id, to: t.to?.name ?? t.name }));
}

export function transitionIssue(key, transitionId) {
  return request(`/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, {
    method: 'POST',
    body: { transition: { id: transitionId } },
  });
}
