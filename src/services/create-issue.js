import { buildTree } from '../core/issue-tree.js';
import { aiEnabled, suggestTitle } from '../infra/ai.js';
import { stagedDiff } from '../infra/git.js';
import { activeSprint, createIssue, getIssue, getTransitions, storyPointsField } from '../infra/jira/api.js';
import { getRepoState, setRepoState } from '../infra/storage/repo-state.js';
import { inBackground } from '../utils/promise.js';
import { subtaskTypeName } from './issues.js';

// Regras da criação de atividade, sem perguntas nem terminal: quem pergunta é o flow (ou outra
// interface, como uma extensão de editor)

// Tarefas que podem ser pai de uma subtarefa: as raízes da árvore e, mesmo fora da lista, a
// última usada neste repositório
export function parentCandidates(cfg, issues) {
  const roots = buildTree(issues).map(({ root }) => ({ key: root.key, summary: root.summary }));
  const lastParent = getRepoState(cfg.root).lastParent ?? null;
  return { roots, lastParent, lastParentListed: roots.some((r) => r.key === lastParent) };
}

// Com summary, labels e componentes: a subtarefa herda labels e componentes do pai
export const loadParent = (key) => getIssue(key);

// Começam assim que o tipo é escolhido, em segundo plano, para não esperar no fim
export function creationLookups(cfg, parent) {
  const issueType = inBackground(parent ? subtaskTypeName(cfg) : Promise.resolve(cfg.issueType));
  return {
    issueType,
    // a subtarefa fica na sprint do pai, que o Jira aplica sozinho
    sprint: parent ? Promise.resolve(null) : activeSprint(cfg.projectKey, cfg.boardId).catch(() => null),
    pointsField:
      cfg.storyPoints === false
        ? Promise.resolve(null)
        : issueType.then((type) => storyPointsField(cfg.projectKey, type)).catch(() => null),
  };
}

// null quando a IA está desligada; senão, a promessa da sugestão (que pode ser null)
export function titleSuggestion(cfg, { subject, parent, files }) {
  if (!aiEnabled(cfg)) return null;
  return stagedDiff(cfg.root).then((diff) => suggestTitle(cfg, { diff, files, subject, parentSummary: parent?.summary }));
}

// epicAsked: a pergunta do épico apareceu; aí até "sem épico" é lembrado para a próxima
export async function createActivity(cfg, { summary, issueType, parent, epic, epicAsked, storyPoints, description }) {
  const key = await createIssue({
    projectKey: cfg.projectKey,
    summary,
    issueType,
    parentKey: parent?.key,
    epicKey: epic?.key,
    description,
    // a sprint o Jira herda do pai; labels e componentes, não
    labels: parent?.labels,
    components: parent?.components,
    storyPoints,
  });
  if (parent) setRepoState(cfg.root, { lastParent: parent.key });
  if (!parent && epicAsked) setRepoState(cfg.root, { lastEpic: epic?.key ?? null });
  return key;
}

// Status para onde a atividade recém-criada pode ir, sem o atual. null se o Jira não responder:
// a atividade já existe, então só não se oferece a troca
export async function statusOptions(key) {
  try {
    const [transitions, { status: current }] = await Promise.all([getTransitions(key), getIssue(key)]);
    return { current, transitions: transitions.filter((tr) => tr.to !== current) };
  } catch {
    return null;
  }
}
