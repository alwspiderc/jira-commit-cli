#!/usr/bin/env node
import { hook } from '../src/commands/hook.js';
import { login } from '../src/commands/login.js';
import { list } from '../src/commands/list.js';
import { init } from '../src/commands/init.js';

const [, , command, ...args] = process.argv;

const commands = {
  hook: () => hook(args[0], args[1]), // chamado pelo git: hook <arquivo-msg> <origem>
  login,
  list: () => list(args),
  init,
};

const help = `
jira-commit — liga commits a issues do Jira

  jira-commit login                  Salva URL, e-mail e API token nesta máquina
  jira-commit init                   Configura o repositório atual e instala o hook
  jira-commit list                   Lista suas issues nos status padrão ("statuses")
  jira-commit list --todos           Lista todas as suas issues abertas
  jira-commit list --status "NOME"   Lista só as issues nesse status
`;

const run = commands[command];
if (!run) {
  console.log(help);
  process.exit(command ? 1 : 0);
}

try {
  await run();
} catch (err) {
  // Ctrl+C dentro de um prompt
  if (err?.name === 'ExitPromptError') {
    console.log('\nCancelado.');
    process.exit(1);
  }
  console.error(`\n✖ ${err.message}`);
  process.exit(1);
}
