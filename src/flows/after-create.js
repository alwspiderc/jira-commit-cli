import { t } from '../i18n/index.js';
import { getIssue, getTransitions, moveToSprint, transitionIssue } from '../infra/jira/api.js';
import { c, log, select, withSpinner } from '../ui/index.js';

export async function addToSprint(sprint, key) {
  try {
    await withSpinner(t.afterCreate.movingToSprint(sprint.name), () => moveToSprint(sprint.id, key), {
      done: t.afterCreate.inSprint(c.key(key), c.accent(sprint.name)),
    });
    return true;
  } catch (err) {
    log.warn(t.afterCreate.sprintFailed(sprint.name, err.message));
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
    message: t.afterCreate.status(c.key(key)),
    choices: [
      { name: t.afterCreate.keep(c.accent(current)), short: t.afterCreate.keepShort(current), value: null },
      ...transitions
        .filter((tr) => tr.to !== current)
        .map((tr) => ({ name: `→ ${tr.to}`, short: tr.to, value: tr.id })),
    ],
  });
  if (!choice) return null;

  const to = transitions.find((tr) => tr.id === choice).to;
  try {
    await withSpinner(t.afterCreate.moving(to), () => transitionIssue(key, choice), {
      done: t.afterCreate.moved(c.key(key), c.accent(to)),
    });
    return to;
  } catch (err) {
    log.warn(t.afterCreate.statusFailed(err.message));
    return null;
  }
}
