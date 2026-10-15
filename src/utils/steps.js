export const BACK = Symbol('back');

const EXIT = Symbol('exit');

export const exit = (value) => ({ [EXIT]: value });

const isExit = (result) => typeof result === 'object' && result !== null && EXIT in result;

// BACK volta ao último passo que de fato rodou (os pulados por `when` não contam).
// Com resume, começa no último passo, como se os anteriores já tivessem sido respondidos.
export async function runSteps(steps, state = {}, { resume = false } = {}) {
  const applies = async (step) => !step.when || (await step.when(state));
  const history = [];
  let i = 0;

  if (resume) {
    for (let j = 0; j < steps.length; j++) if (await applies(steps[j])) history.push(j);
    i = history.pop() ?? 0;
  }

  while (i < steps.length) {
    const step = steps[i];
    if (!(await applies(step))) {
      i++;
      continue;
    }
    const result = await step.run(state);
    if (result === BACK) {
      if (!history.length) return BACK;
      i = history.pop();
    } else if (isExit(result)) {
      return result[EXIT];
    } else {
      if (step.key) state[step.key] = result;
      history.push(i);
      i++;
    }
  }
  return state;
}
