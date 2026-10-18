import { after, afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// O estado (última atividade, último pai, último épico) fica em ~/.config/jira-commit: um home
// temporário evita gravar no da pessoa. Precisa vir antes de importar os módulos, que leem o home
// ao carregar
const home = mkdtempSync(join(tmpdir(), 'jira-commit-home-'));
process.env.HOME = home;
process.env.USERPROFILE = home;

const { useSite } = await import('../src/infra/jira/client.js');
const { getRepoState, setRepoState } = await import('../src/infra/storage/repo-state.js');
const { createActivity, creationLookups, parentCandidates, statusOptions, titleSuggestion } = await import(
  '../src/services/create-issue.js'
);
const { setLanguage } = await import('../src/i18n/index.js');

setLanguage('pt');

const CLOUD = { url: 'https://a.atlassian.net', type: 'cloud', email: 'e@a', token: 't' };
const realFetch = globalThis.fetch;
let calls;
let routes;
let root;

const route = (pattern, reply) => routes.push([pattern, reply]);
const cfgFor = (extra = {}) => ({ projectKey: 'APP', issueType: 'Tarefa', root, ...extra });

beforeEach(() => {
  calls = [];
  routes = [];
  root = `C:/repo-${Math.random()}`;
  useSite(CLOUD);
  globalThis.fetch = async (url, init) => {
    const call = { url: String(url), method: init.method, body: init.body && JSON.parse(init.body) };
    calls.push(call);
    const found = routes.find(([pattern]) => pattern.test(call.url));
    if (!found) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify(found[1](call)), { status: 200 });
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  useSite(null);
});

after(() => rmSync(home, { recursive: true, force: true }));

describe('criar atividade', () => {
  beforeEach(() => {
    route(/myself/, () => ({ accountId: 'acc-1' }));
    route(/\/issue$/, () => ({ key: 'APP-9' }));
  });

  const created = () => calls.find((c) => c.method === 'POST' && /\/issue$/.test(c.url)).body.fields;

  it('subtarefa: herda labels e componentes do pai e lembra o pai', async () => {
    const parent = { key: 'APP-2', summary: 'Pai', labels: ['mobile'], components: [{ id: '7' }] };
    const key = await createActivity(cfgFor(), { summary: 'T', issueType: 'Subtask', parent, epicAsked: false });

    assert.equal(key, 'APP-9');
    assert.deepEqual(created().parent, { key: 'APP-2' });
    assert.deepEqual(created().labels, ['mobile']);
    assert.deepEqual(created().components, [{ id: '7' }]);
    assert.equal(getRepoState(root).lastParent, 'APP-2');
  });

  it('tarefa com épico: liga ao épico e lembra o épico', async () => {
    await createActivity(cfgFor(), { summary: 'T', issueType: 'Tarefa', epic: { key: 'APP-1' }, epicAsked: true });
    assert.deepEqual(created().parent, { key: 'APP-1' });
    assert.equal(getRepoState(root).lastEpic, 'APP-1');
  });

  it('"sem épico" também é lembrado, mas só se a pergunta apareceu', async () => {
    await createActivity(cfgFor(), { summary: 'T', issueType: 'Tarefa', epic: null, epicAsked: true });
    assert.equal(getRepoState(root).lastEpic, null);

    root = `C:/outro-${Math.random()}`;
    await createActivity(cfgFor(), { summary: 'T', issueType: 'Tarefa', epic: null, epicAsked: false });
    assert.ok(!('lastEpic' in getRepoState(root)));
  });

  it('manda a descrição e os story points', async () => {
    await createActivity(cfgFor(), {
      summary: 'T',
      issueType: 'Tarefa',
      description: { paragraphs: ['corpo'], files: ['M a.js'] },
      storyPoints: { field: 'customfield_5', value: 3 },
    });
    assert.equal(created().description.type, 'doc');
    assert.equal(created().customfield_5, 3);
  });
});

describe('candidatos a pai', () => {
  const issues = [
    { key: 'APP-1', summary: 'Tarefa 1', parent: null },
    { key: 'APP-3', summary: 'Sub', parent: { key: 'APP-1', summary: 'Tarefa 1' } },
    { key: 'APP-2', summary: 'Tarefa 2', parent: null },
  ];

  it('lista as raízes da árvore e marca o último pai', () => {
    setRepoState(root, { lastParent: 'APP-2' });
    const { roots, lastParent, lastParentListed } = parentCandidates(cfgFor(), issues);
    assert.deepEqual(roots.map((r) => r.key).sort(), ['APP-1', 'APP-2']);
    assert.equal(lastParent, 'APP-2');
    assert.equal(lastParentListed, true);
  });

  it('avisa quando o último pai não está na lista', () => {
    setRepoState(root, { lastParent: 'APP-50' });
    assert.equal(parentCandidates(cfgFor(), issues).lastParentListed, false);
  });
});

describe('buscas em segundo plano', () => {
  it('subtarefa: tipo de subtarefa do projeto e nenhuma sprint', async () => {
    route(/createmeta\/APP\/issuetypes$/, () => ({ issueTypes: [{ id: '1', name: 'Tarefa' }, { id: '2', name: 'Subtask', subtask: true }] }));
    route(/createmeta\/APP\/issuetypes\/2/, () => ({ fields: [] }));
    const lookups = creationLookups(cfgFor({ subtaskType: undefined }), { key: 'APP-1' });
    assert.equal(await lookups.issueType, 'Subtask');
    assert.equal(await lookups.sprint, null);
    assert.ok(!calls.some((c) => /agile/.test(c.url)));
  });

  it('tarefa: o tipo do .jira-commit.json e a sprint ativa do quadro', async () => {
    route(/agile\/1\.0\/board\?/, () => ({ values: [{ id: 10 }] }));
    route(/board\/10\/sprint/, () => ({ values: [{ id: 62, name: 'Sprint 62' }] }));
    route(/createmeta/, () => ({ issueTypes: [{ id: '1', name: 'Tarefa' }], fields: [] }));
    const lookups = creationLookups(cfgFor(), null);
    assert.equal(await lookups.issueType, 'Tarefa');
    assert.deepEqual(await lookups.sprint, { id: 62, name: 'Sprint 62' });
  });

  it('"storyPoints": false não procura o campo de estimativa', async () => {
    const lookups = creationLookups(cfgFor({ storyPoints: false }), null);
    assert.equal(await lookups.pointsField, null);
    await lookups.sprint;
    assert.ok(!calls.some((c) => /createmeta/.test(c.url)));
  });

  it('com a IA desligada, não há sugestão de título', () => {
    assert.equal(titleSuggestion(cfgFor(), { subject: 'x', files: [] }), null);
  });
});

describe('status inicial', () => {
  it('oferece as transições, sem o status atual', async () => {
    route(/transitions/, () => ({ transitions: [{ id: '11', to: { name: 'A fazer' } }, { id: '21', to: { name: 'Em andamento' } }] }));
    route(/\/issue\/APP-9\?/, () => ({ key: 'APP-9', fields: { summary: 'T', status: { name: 'A fazer' } } }));
    assert.deepEqual(await statusOptions('APP-9'), { current: 'A fazer', transitions: [{ id: '21', to: 'Em andamento' }] });
  });

  it('sem resposta do Jira, não oferece nada', async () => {
    assert.equal(await statusOptions('APP-9'), null);
  });
});
