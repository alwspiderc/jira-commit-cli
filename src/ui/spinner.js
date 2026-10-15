import { c, icon } from './theme.js';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const FRAME_MS = 80;
const CLEAR_LINE = '\r\x1b[2K';

export async function withSpinner(text, task, { done } = {}) {
  const out = process.stderr;
  if (!out.isTTY) return task();

  let i = 0;
  const draw = (frame) => out.write(`${CLEAR_LINE}${frame} ${c.dim(text)}`);
  draw(c.brand(FRAMES[0]));
  const timer = setInterval(() => draw(c.brand(FRAMES[++i % FRAMES.length])), FRAME_MS);
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
