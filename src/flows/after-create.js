import { getIssue, getTransitions, moveToSprint, transitionIssue } from '../infra/jira/api.js';
import { c, log, select, withSpinner } from '../ui/index.js';

export async function addToSprint(sprint, key) {
  try {
    await withSpinner(`Colocando na ${sprint.name}…`, () => moveToSprint(sprint.id, key), {
      done: `${c.key(key)} na ${c.accent(sprint.name)}`,
    });
    return true;
  } catch (err) {
    log.warn(`Não consegui colocar na ${sprint.name} (${err.message}). A atividade ficou no backlog.`);
    return false;
  }
}

export async function chooseInitialStatus(key) {
  let transitions;
  let current;
  try {
    [transitions, { status: current }] = await Promise.all([getTransitions(key), getIssue(key)]);
  } catch {
    return null;
  }

  const choice = await select({
    message: `Status de ${c.key(key)}`,
    choices: [
      { name: `● Manter em ${c.accent(current)}`, short: `Manter em ${current}`, value: null },
      ...transitions
        .filter((t) => t.to !== current)
        .map((t) => ({ name: `→ ${t.to}`, short: t.to, value: t.id })),
    ],
  });
  if (!choice) return null;

  const to = transitions.find((t) => t.id === choice).to;
  try {
    await withSpinner(`Movendo para ${to}…`, () => transitionIssue(key, choice), {
      done: `${c.key(key)} movida para ${c.accent(to)}`,
    });
    return to;
  } catch (err) {
    log.warn(`Não consegui mudar o status (${err.message}).`);
    return null;
  }
}
