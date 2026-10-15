import { bodyParagraphs } from '../core/document.js';
import { detailLines } from '../core/commit-message.js';
import { capitalizeTitle, mostCommonProduct, productOf, resolvePrefix } from '../core/issue-title.js';
import { t } from '../i18n/index.js';
import { aiEnabled, suggestTitle } from '../infra/ai.js';
import { stagedDiff, stagedFiles } from '../infra/git.js';
import { activeSprint, createIssue, getIssue, storyPointsField } from '../infra/jira/api.js';
import { setRepoState } from '../infra/storage/repo-state.js';
import { loadEpics, subtaskTypeName } from '../services/issues.js';
import { inBackground } from '../utils/promise.js';
import { BACK, exit, runSteps } from '../utils/steps.js';
import { c, confirm, field, withSpinner } from '../ui/index.js';
import { addToSprint, chooseInitialStatus } from './after-create.js';
import { askStoryPoints, chooseEpic, chooseKind, chooseParent, KIND } from './issue-fields.js';

export async function createFromCommit(cfg, commit, issues, keyRegex) {
  const epicsLookup = loadEpics(cfg).catch(() => null);
  const files = stagedFiles();
  const lookupsFor = cached((parent) => startLookups(cfg, parent));
  const suggestionFor = cached((parent) => suggestTitleFor(cfg, { commit, parent, files }));
  let epicsData = null;

  const answers = await runSteps([
    { key: 'kind', run: () => chooseKind(cfg) },
    {
      key: 'parent',
      when: (s) => s.kind === KIND.SUBTASK,
      run: () => loadParent(cfg, issues, keyRegex),
    },
    {
      key: 'epic',
      when: async (s) => {
        if (s.kind !== KIND.TASK) return false;
        epicsData = await withSpinner(t.create.loadingEpics, () => epicsLookup);
        return Boolean(epicsData?.epics.length);
      },
      run: () => chooseEpic(epicsData),
    },
    {
      key: 'summary',
      run: async (s) => askTitle(cfg, { commit, issues, parent: parentOf(s), suggestion: await suggestionFor(parentOf(s)) }),
    },
    {
      key: 'storyPoints',
      when: async (s) => Boolean(await lookupsFor(parentOf(s)).pointsField),
      run: async (s) => askStoryPoints(await lookupsFor(parentOf(s)).pointsField, cfg.storyPointsScale),
    },
    {
      run: async (s) => {
        const { issueType, sprint } = lookupsFor(parentOf(s));
        const ok = await confirmCreation(cfg, {
          parent: parentOf(s),
          issueType: await issueType,
          epic: epicOf(s),
          sprint: await sprint,
        });
        return ok === false ? exit(BACK) : ok;
      },
    },
  ]);
  if (answers === BACK) return BACK;

  const parent = parentOf(answers);
  const epic = epicOf(answers);
  const storyPoints = answers.storyPoints ?? null;
  const lookups = lookupsFor(parent);
  const issueType = await lookups.issueType;
  const sprint = await lookups.sprint;

  const key = await withSpinner(
    t.create.creating,
    () =>
      createIssue({
        projectKey: cfg.projectKey,
        summary: answers.summary,
        issueType,
        parentKey: parent?.key,
        epicKey: epic?.key,
        description: { paragraphs: bodyParagraphs(fullBody(commit)), files },
        // a sprint o Jira herda do pai; labels e componentes, não
        labels: parent?.labels,
        components: parent?.components,
        storyPoints,
      }),
    { done: (k) => t.create.created(c.key(k)) },
  );
  if (parent) setRepoState({ lastParent: parent.key });
  if (!parent && epicsData?.epics.length) setRepoState({ lastEpic: epic?.key ?? null }); // "sem épico" também é lembrado

  const inSprint = sprint && (await addToSprint(sprint, key));
  const movedTo = await chooseInitialStatus(key);
  return {
    key,
    title: answers.summary,
    created: true,
    parentKey: parent?.key,
    movedTo,
    epic: epic?.key,
    sprint: inSprint ? sprint.name : null,
    points: storyPoints?.value,
  };
}

// voltar e trocar o tipo deixa no state a resposta do outro caminho: só vale a do tipo atual
const parentOf = (s) => (s.kind === KIND.SUBTASK ? s.parent : null);
const epicOf = (s) => (s.kind === KIND.TASK ? (s.epic ?? null) : null);

function cached(fn) {
  const cache = new Map();
  return (parent) => {
    const id = parent?.key ?? null;
    if (!cache.has(id)) cache.set(id, fn(parent));
    return cache.get(id);
  };
}

async function loadParent(cfg, issues, keyRegex) {
  const chosen = await chooseParent(cfg, issues, keyRegex);
  if (chosen === BACK) return BACK;
  return withSpinner(t.create.loading(chosen.key), () => getIssue(chosen.key));
}

function startLookups(cfg, parent) {
  const issueType = inBackground(parent ? subtaskTypeName(cfg) : Promise.resolve(cfg.issueType));
  return {
    issueType,
    sprint: parent ? Promise.resolve(null) : activeSprint(cfg.projectKey, cfg.boardId).catch(() => null),
    pointsField:
      cfg.storyPoints === false
        ? Promise.resolve(null)
        : issueType.then((type) => storyPointsField(cfg.projectKey, type)).catch(() => null),
  };
}

function suggestTitleFor(cfg, { commit, parent, files }) {
  if (!aiEnabled(cfg)) return Promise.resolve(null);
  return withSpinner(
    t.create.askingAi,
    () => suggestTitle(cfg, { diff: stagedDiff(), files, subject: commit.subject, parentSummary: parent?.summary }),
    { done: (s) => c.dim(s ? t.create.aiReady : t.create.aiNone) },
  );
}

async function askTitle(cfg, { commit, issues, parent, suggestion }) {
  const product = parent
    ? productOf(parent.summary, cfg.productSeparator)
    : mostCommonProduct(issues, cfg.productSeparator);
  const prefix = resolvePrefix(cfg.summaryPrefix, product);
  const title = await field({
    message: suggestion ? `${t.create.title} ${c.dim(`· ${t.create.suggestedByAi}`)}` : t.create.title,
    default: capitalizeTitle(prefix + (suggestion ?? commit.subject), prefix),
    prefill: 'editable',
    validate: (v) => v.trim().length > 0 || t.create.titleEmpty,
    back: true,
  });
  if (title === BACK) return BACK;
  return capitalizeTitle(title.trim(), prefix);
}

function confirmCreation(cfg, { parent, issueType, epic, sprint }) {
  const where = parent
    ? t.create.subtaskOf(c.key(parent.key))
    : t.create.inProject(issueType, c.key(cfg.projectKey)) +
      (epic ? t.create.inEpic(c.key(epic.key)) : '') +
      (sprint ? t.create.inSprint(c.accent(sprint.name)) : '');
  return confirm({ message: t.create.confirm(where), default: true, back: true });
}

function fullBody(commit) {
  return [detailLines(commit.details).join('\n').trim(), commit.body].filter(Boolean).join('\n\n');
}
