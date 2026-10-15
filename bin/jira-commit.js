#!/usr/bin/env node
import { hook } from '../src/commands/hook.js';
import { login } from '../src/commands/login.js';
import { list } from '../src/commands/list.js';
import { init } from '../src/commands/init.js';
import { comment } from '../src/commands/comment.js';
import { doctor } from '../src/commands/doctor.js';
import { t } from '../src/i18n/index.js';
import { badge, c, icon, log, wordmark } from '../src/ui/index.js';
import { VERSION } from '../src/version.js';

const [, , command, ...args] = process.argv;

const commands = {
  hook: () => hook(args[0], args[1]),
  login,
  list: () => list(args),
  init,
  comment: () => comment(args),
  doctor,
};

const CMD_WIDTH = 27;
const cmd = (name, desc) => {
  const [head, ...args] = name.split(' ');
  const styled = c.key(head) + (args.length ? ` ${c.warn(args.join(' '))}` : '');
  return `    ${styled}${' '.repeat(Math.max(1, CMD_WIDTH - name.length))} ${desc}`;
};
const help = () => `
  ${icon.brand} ${wordmark()} ${badge(`v${VERSION}`)}
  ${c.dim(t.cli.tagline)}

  ${c.title(`▸ ${t.cli.firstSteps}`)}
${cmd('login', t.cli.login)}
${cmd('init', t.cli.init)}
${cmd('doctor', t.cli.doctor)}

  ${c.title(`▸ ${t.cli.daily}`)}
${cmd('list', t.cli.list)}
${cmd(t.cli.listAllArg, t.cli.listAll)}
${cmd(t.cli.listStatusArg, t.cli.listStatus)}
${cmd(t.cli.commentArgs, t.cli.comment)}

  ${c.dim(t.cli.footer)}
`;

const run = commands[command];
if (!run) {
  console.log(help());
  if (command && !['help', '--help', '-h'].includes(command)) {
    log.err(t.cli.unknown(command));
    console.log();
    process.exit(1);
  }
  process.exit(0);
}

try {
  await run();
} catch (err) {
  const cancelled = err?.name === 'ExitPromptError';
  if (cancelled) {
    console.log();
    log.hint(command === 'hook' ? t.cli.cancelledHook : t.cli.cancelled);
    console.log();
    process.exit(1);
  }
  console.log();
  log.err(err.message);
  if (err.status === 401) log.hint(t.cli.tokenHint);
  if (command === 'hook') log.hint(t.cli.hookAborted);
  console.log();
  process.exit(1);
}
