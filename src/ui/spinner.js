import { styleText } from 'node:util';
import { c, icon } from './theme.js';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const COLORS = ['magentaBright', 'magentaBright', 'blueBright', 'blueBright', 'cyanBright', 'cyanBright'];
const FRAME_MS = 80;
const CLEAR_LINE = '\r\x1b[2K';

const frame = (i) => styleText(['bold', COLORS[i % COLORS.length]], FRAMES[i % FRAMES.length]);

export async function withSpinner(text, task, { done } = {}) {
  const out = process.stderr;
  if (!out.isTTY) return task();

  let i = 0;
  const draw = () => out.write(`${CLEAR_LINE}${frame(i)} ${c.dim(text)}`);
  draw();
  const timer = setInterval(() => {
    i++;
    draw();
  }, FRAME_MS);
  try {
    const result = await task();
    clearInterval(timer);
    const msg = typeof done === 'function' ? done(result) : done;
    out.write(`${CLEAR_LINE}${msg ? `${icon.ok} ${msg}\n` : ''}`);
    return result;
  } catch (err) {
    clearInterval(timer);
    out.write(`${CLEAR_LINE}${icon.err} ${c.err(text)}\n`);
    throw err;
  }
}
