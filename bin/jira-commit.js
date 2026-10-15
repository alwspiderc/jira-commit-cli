#!/usr/bin/env node
import { hook } from '../src/commands/hook.js';
import { login } from '../src/commands/login.js';
import { list } from '../src/commands/list.js';
import { init } from '../src/commands/init.js';
import { comment } from '../src/commands/comment.js';
import { doctor } from '../src/commands/doctor.js';
import { c, icon, log } from '../src/ui/index.js';
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

const cmd = (name, desc) => `    ${c.accent(name.padEnd(27))} ${desc}`;
const help = `
  ${icon.brand} ${c.brand('jira-commit')} ${c.dim(`v${VERSION}`)}
  ${c.dim('Liga cada commit a uma atividade do Jira, ou cria uma na hora.')}

  ${c.bold('Primeiros passos')}
${cmd('login', 'Salva o acesso a um Jira (Cloud ou Server) nesta máquina')}
${cmd('init', 'Configura o repositório e instala o hook')}
${cmd('doctor', 'Confere login, config, hook e CLI e diz o que corrigir')}

  ${c.bold('No dia a dia')}
${cmd('list', 'Suas atividades nos status padrão')}
${cmd('list --todos', 'Todas as suas atividades abertas')}
${cmd('list --status "NOME"', 'Só as atividades nesse status')}
${cmd('comment [CHAVE] ["texto"]', 'Comenta numa atividade do Jira')}

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
  const cancelled = err?.name === 'ExitPromptError';
  if (cancelled) {
    console.log();
    log.hint(command === 'hook' ? 'Cancelado. O commit não foi feito.' : 'Cancelado.');
    console.log();
    process.exit(1);
  }
  console.log();
  log.err(err.message);
  if (err.status === 401) log.hint('Token inválido ou expirado? Rode: jira-commit login');
  if (command === 'hook') log.hint('O commit foi cancelado. Corrija e tente de novo.');
  console.log();
  process.exit(1);
}
