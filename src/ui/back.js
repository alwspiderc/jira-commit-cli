import { emitKeypressEvents } from 'node:readline';
import { BACK } from '../utils/steps.js';

export function withBack(prompt) {
  return async (config, context = {}) => {
    const input = context.input ?? process.stdin;
    const controller = new AbortController();
    const ctx = { ...context, signal: controller.signal };
    const onKey = (_, key) => {
      if (key?.name !== 'escape') return;
      ctx.clearPromptOnDone = true;
      controller.abort();
    };
    emitKeypressEvents(input);
    input.on('keypress', onKey);
    try {
      return await prompt(config, ctx);
    } catch (err) {
      if (controller.signal.aborted && err?.name === 'AbortPromptError') return BACK;
      throw err;
    } finally {
      input.off('keypress', onKey);
    }
  };
}
