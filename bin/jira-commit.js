#!/usr/bin/env node
import { hook } from '../src/commands/hook.js';
import { login } from '../src/commands/login.js';
import { list } from '../src/commands/list.js';
import { init } from '../src/commands/init.js';
import { c, icon, log, VERSION } from '../src/ui.js';

const [, , command, ...args] = process.argv;

const commands = {
  hook: () => hook(args[0], args[1]), // chamado pelo git: hook <arquivo-msg> <origem>
  login,
  list: () => list(args),
  init,
};

const cmd = (name, desc) => `    ${c.accent(name.padEnd(22))} ${desc}`;
const help = `
  ${icon.brand} ${c.brand('jira-commit')} ${c.dim(`v${VERSION}`)}
  ${c.dim('Liga cada commit a uma atividade do Jira, ou cria uma na hora.')}

  ${c.bold('Primeiros passos')}
${cmd('login', 'Salva URL, e-mail e API token nesta máquina')}
${cmd('init', 'Configura o repositório e instala o hook')}

  ${c.bold('No dia a dia')}
${cmd('list', 'Suas atividades nos status padrão')}
${cmd('list --todos', 'Todas as suas atividades abertas')}
${cmd('list --status "NOME"', 'Só as atividades nesse status')}

  ${c.dim('O menu aparece sozinho no git commit (pelo terminal).')}
`;

const run = commands[command];
if (!run) {
  console.log(help);
  if (command && !['help', '--help', '-h'].includes(command)) {
    log.err(`Comando desconhecido: ${command}`);
    console.log();
    process.exit(1);
  }
  process.exit(0);
}

try {
  await run();
} catch (err) {
  // Ctrl+C dentro de um prompt
  if (err?.name === 'ExitPromptError') {
    console.log();
    log.hint(command === 'hook' ? 'Cancelado. O commit não foi feito.' : 'Cancelado.');
    console.log();
    process.exit(1);
  }
  console.log();
  log.err(err.message);
  if (/401/.test(err.message)) log.hint('Token inválido ou expirado? Rode: jira-commit login');
  if (command === 'hook') log.hint('O commit foi cancelado. Corrija e tente de novo.');
  console.log();
  process.exit(1);
}
