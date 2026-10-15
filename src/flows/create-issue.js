import { commitDescription } from '../core/adf.js';
import { detailLines } from '../core/commit-message.js';
import { capitalizeTitle, mostCommonProduct, productOf, resolvePrefix } from '../core/issue-title.js';
import { aiEnabled, suggestTitle } from '../infra/ai.js';
import { stagedDiff, stagedFiles } from '../infra/git.js';
import { activeSprint, createIssue, getIssue, storyPointsField } from '../infra/jira/api.js';
import { setRepoState } from '../infra/storage/repo-state.js';
import { loadEpics, subtaskTypeName } from '../services/issues.js';
import { inBackground } from '../utils/promise.js';
import { c, confirm, field, withSpinner } from '../ui/index.js';
import { addToSprint, chooseInitialStatus } from './after-create.js';
import { askStoryPoints, chooseEpic, chooseKind, chooseParent, KIND } from './issue-fields.js';

export async function createFromCommit(cfg, commit, issues, keyRegex) {
  const epicsLookup = loadEpics(cfg).catch(() => null);
  const kind = await chooseKind(cfg);

  let parent = null;
  if (kind === KIND.SUBTASK) {
    parent = await loadParent(cfg, issues, keyRegex);
    if (!parent) return null;
  }

  const epics = kind === KIND.TASK ? await withSpinner('Buscando os épicos…', () => epicsLookup) : null;
  const epic = epics ? await chooseEpic(epics) : null;

  const lookups = startLookups(cfg, parent);
  const files = stagedFiles();
  const summary = await askTitle(cfg, { commit, parent, issues, files });

  const issueType = await lookups.issueType;
  const storyPoints = await askStoryPoints(await lookups.pointsField);
  const sprint = await lookups.sprint;
  if (!(await confirmCreation(cfg, { parent, issueType, epic, sprint }))) return null;

  const key = await withSpinner(
    'Criando no Jira…',
    () =>
      createIssue({
        projectKey: cfg.projectKey,
        summary,
        issueType,
        parentKey: parent?.key,
        epicKey: epic?.key,
        description: commitDescription({ body: fullBody(commit), files }),
        // a sprint o Jira herda do pai; labels e componentes, não
        labels: parent?.labels,
        components: parent?.components,
        storyPoints,
      }),
    { done: (k) => `${c.key(k)} criada no Jira` },
  );
  if (parent) setRepoState({ lastParent: parent.key });
  if (epics?.epics.length) setRepoState({ lastEpic: epic?.key ?? null }); // "sem épico" também é lembrado

  const inSprint = sprint && (await addToSprint(sprint, key));
  const movedTo = await chooseInitialStatus(key);
  return {
    key,
    title: summary,
    created: true,
    parentKey: parent?.key,
    movedTo,
    epic: epic?.key,
    sprint: inSprint ? sprint.name : null,
    points: storyPoints?.value,
  };
}

async function loadParent(cfg, issues, keyRegex) {
  const chosen = await chooseParent(cfg, issues, keyRegex);
  return chosen && withSpinner(`Carregando ${chosen.key}…`, () => getIssue(chosen.key));
}

function startLookups(cfg, parent) {
  const issueType = inBackground(parent ? subtaskTypeName(cfg) : Promise.resolve(cfg.issueType));
  return {
    issueType,
    sprint: parent ? Promise.resolve(null) : activeSprint(cfg.projectKey).catch(() => null),
    pointsField:
      cfg.storyPoints === false
        ? Promise.resolve(null)
        : issueType.then((type) => storyPointsField(cfg.projectKey, type)).catch(() => null),
  };
}

async function askTitle(cfg, { commit, parent, issues, files }) {
  const suggestion = aiEnabled(cfg)
    ? await withSpinner(
        'Pedindo uma sugestão de título à IA…',
        () => suggestTitle(cfg, { diff: stagedDiff(), files, subject: commit.subject, parentSummary: parent?.summary }),
        { done: (s) => c.dim(s ? 'Sugestão da IA pronta' : 'Sem sugestão da IA, usando o commit') },
      )
    : null;
  const prefix = resolvePrefix(cfg.summaryPrefix, parent ? productOf(parent.summary) : mostCommonProduct(issues));

  const title = await field({
    message: suggestion ? `Título ${c.dim('· sugerido pela IA')}` : 'Título',
    default: capitalizeTitle(prefix + (suggestion ?? commit.subject), prefix),
    prefill: 'editable',
    validate: (v) => v.trim().length > 0 || 'O título não pode ficar vazio',
  });
  return capitalizeTitle(title.trim(), prefix);
}

function confirmCreation(cfg, { parent, issueType, epic, sprint }) {
  const where = parent
    ? `subtarefa de ${c.key(parent.key)}`
    : `${issueType} em ${c.key(cfg.projectKey)}` +
      (epic ? ` no épico ${c.key(epic.key)}` : '') +
      (sprint ? ` na ${c.accent(sprint.name)}` : '');
  return confirm({ message: `Criar ${where}?`, default: true });
}

function fullBody(commit) {
  return [detailLines(commit.details).join('\n').trim(), commit.body].filter(Boolean).join('\n\n');
}
