import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useSite } from '../src/infra/jira/client.js';
import { addComment, createIssue, mostUsedEpic, openEpics, searchIssues } from '../src/infra/jira/api.js';

const CLOUD = { url: 'https://a.atlassian.net', type: 'cloud', email: 'e@a', token: 't' };
const SERVER = { url: 'https://jira.cliente.com', type: 'server', token: 'pat' };

let calls;
let routes;
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  routes = [];
  globalThis.fetch = async (url, init) => {
    const call = { url: String(url), method: init.method, auth: init.headers.Authorization, body: init.body && JSON.parse(init.body) };
    calls.push(call);
    const route = routes.find(([pattern]) => pattern.test(call.url));
    return new Response(JSON.stringify(route ? route[1](call) : {}), { status: 200 });
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  useSite(null);
});

const route = (pattern, reply) => routes.push([pattern, reply]);
const jqlOf = (call) => new URL(call.url).searchParams.get('jql');

describe('Jira Cloud', () => {
  beforeEach(() => useSite(CLOUD));

  it('busca pelo /search/jql da API v3 com Basic', async () => {
    route(/search/, () => ({ issues: [] }));
    await searchIssues('project = APP');
    assert.match(calls[0].url, /^https:\/\/a\.atlassian\.net\/rest\/api\/3\/search\/jql\?/);
    assert.match(calls[0].auth, /^Basic /);
  });

  it('cria com accountId, épico no parent e descrição em ADF', async () => {
    route(/myself/, () => ({ accountId: 'acc-1' }));
    route(/\/issue$/, () => ({ key: 'APP-9' }));
    const key = await createIssue({
      projectKey: 'APP',
      summary: 'T',
      issueType: 'Task',
      epicKey: 'APP-1',
      description: { paragraphs: ['corpo'], files: [] },
    });
    const { fields } = calls.at(-1).body;
    assert.equal(key, 'APP-9');
    assert.deepEqual(fields.assignee, { accountId: 'acc-1' });
    assert.deepEqual(fields.parent, { key: 'APP-1' });
    assert.equal(fields.description.type, 'doc');
  });

  it('comenta em ADF', async () => {
    await addComment('APP-1', ['oi']);
    assert.match(calls[0].url, /\/rest\/api\/3\/issue\/APP-1\/comment$/);
    assert.equal(calls[0].body.body.type, 'doc');
  });
});

describe('Jira Server/Data Center', () => {
  beforeEach(() => useSite(SERVER));

  const epicField = () =>
    route(/\/field$/, () => [
      { id: 'summary', schema: {} },
      { id: 'customfield_10008', schema: { custom: 'com.pyxis.greenhopper.jira:gh-epic-link', customId: 10008 } },
    ]);

  it('busca pelo /search da API v2 com Bearer', async () => {
    route(/search/, () => ({ issues: [] }));
    await searchIssues('project = APP');
    assert.match(calls[0].url, /^https:\/\/jira\.cliente\.com\/rest\/api\/2\/search\?/);
    assert.equal(calls[0].auth, 'Bearer pat');
  });

  it('cria com o nome de usuário, épico pelo Epic Link e descrição em wiki markup', async () => {
    route(/myself/, () => ({ name: 'ester' }));
    epicField();
    route(/\/issue$/, () => ({ key: 'APP-9' }));
    await createIssue({
      projectKey: 'APP',
      summary: 'T',
      issueType: 'Task',
      epicKey: 'APP-1',
      description: { paragraphs: ['corpo'], files: ['M a.js'] },
    });
    const { fields } = calls.at(-1).body;
    assert.deepEqual(fields.assignee, { name: 'ester' });
    assert.equal(fields.customfield_10008, 'APP-1');
    assert.equal(fields.parent, undefined);
    assert.equal(fields.description, 'corpo\n\nh4. Arquivos alterados\n\n* {{M a.js}}');
  });

  it('subtarefa continua no parent', async () => {
    route(/myself/, () => ({ name: 'ester' }));
    route(/\/issue$/, () => ({ key: 'APP-10' }));
    await createIssue({ projectKey: 'APP', summary: 'T', issueType: 'Sub-task', parentKey: 'APP-2' });
    assert.deepEqual(calls.at(-1).body.fields.parent, { key: 'APP-2' });
  });

  it('acha épicos pelo nome do tipo e o mais usado pelo Epic Link', async () => {
    route(/issuetypes/, () => ({ values: [{ id: '10', name: 'Epic' }, { id: '3', name: 'Task' }] }));
    epicField();
    route(/search\?.*customfield/, () => ({
      issues: [{ fields: { customfield_10008: 'APP-1' } }, { fields: { customfield_10008: 'APP-1' } }],
    }));
    route(/search/, () => ({ issues: [{ key: 'APP-1', fields: { summary: 'Épico' } }] }));

    assert.deepEqual(await openEpics('APP'), [{ key: 'APP-1', summary: 'Épico' }]);
    assert.match(jqlOf(calls.at(-1)), /issuetype in \(10\)/);
    assert.equal(await mostUsedEpic('APP', new Set(['APP-1'])), 'APP-1');
    assert.match(jqlOf(calls.at(-1)), /cf\[10008\] is not EMPTY/);
  });

  it('comenta em wiki markup', async () => {
    await addComment('APP-1', ['oi', 'tchau']);
    assert.match(calls[0].url, /\/rest\/api\/2\/issue\/APP-1\/comment$/);
    assert.equal(calls[0].body.body, 'oi\n\ntchau');
  });
});
