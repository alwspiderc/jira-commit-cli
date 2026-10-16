import { BACK } from '../utils/steps.js';

const nextTick = () => new Promise((resolve) => setImmediate(resolve));
export function withBack(prompt) {
  return async (config, context = {}) => {
    const input = context.input ?? process.stdin;
    const controller = new AbortController();
    const ctx = { ...context, signal: controller.signal };
    const onKey = (_, key) => {
      if (key?.name !== 'escape' || controller.signal.aborted) return;
      ctx.clearPromptOnDone = true;
      setImmediate(() => controller.abort());
    };
    input.on('keypress', onKey);
    try {
      return await prompt(config, ctx);
    } catch (err) {
      if (controller.signal.aborted && err?.name === 'AbortPromptError') {
        await nextTick();
        return BACK;
      }
      throw err;
    } finally {
      input.off('keypress', onKey);
    }
  };
}
