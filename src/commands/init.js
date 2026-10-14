import { existsSync, readFileSync, readdirSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { input, select } from '@inquirer/prompts';
import { saveProjectConfig, PROJECT_FILE } from '../config.js';
import { issueTypes } from '../jira.js';
import { repoRoot, hooksDir } from '../git.js';

// Só abre o terminal se existir um (clientes gráficos tipo VS Code não têm /dev/tty)
const HOOK_LINE =
  'if sh -c ": >/dev/tty" 2>/dev/null; then npx --no-install jira-commit hook "$1" "$2" < /dev/tty; fi';

export async function init() {
  const root = repoRoot();

  if (!existsSync(join(root, PROJECT_FILE))) {
    const projectKey = await input({
      message: 'Chave do projeto no Jira (ex.: APP):',
      validate: (v) => /^[A-Z][A-Z0-9]+$/.test(v.toUpperCase()) || 'Chave inválida',
    });
    // Tipos reais do projeto (o "Task" padrão nem sempre existe, ex.: LOJA só tem Mobile, Backend...)
    let types = [];
    try {
      types = (await issueTypes(projectKey.toUpperCase())).filter((t) => !t.subtask && t.name !== 'Epic');
    } catch (err) {
      console.warn(`⚠ Não consegui listar os tipos do projeto (${err.message}).`);
    }
    const issueType = types.length
      ? await select({
          message: 'Tipo das tarefas criadas (sem pai):',
          choices: types.map((t) => ({ name: t.name, value: t.name })),
        })
      : await input({ message: 'Tipo das tarefas criadas (sem pai):', default: 'Task' });
    const summaryPrefix = await input({
      message: 'Prefixo do título das atividades novas ({product} = produto da tarefa pai, vazio = sem):',
      default: `{product} | ${issueType}: `,
    });
    // Com commitlint, o tipo precisa continuar no início: "feat(home): APP-12 adiciona..."
    const usesCommitlint = readdirSync(root).some((f) => /^(\.)?commitlint(rc)?\b/.test(f));
    const format = await input({
      message: 'Formato da mensagem ({key}, {message}, {prefix}, {subject}):',
      default: usesCommitlint ? '{prefix}{key} {subject}' : '{key}: {message}',
    });
    saveProjectConfig({ projectKey: projectKey.toUpperCase(), issueType, summaryPrefix, format });
    console.log(`✔ ${PROJECT_FILE} criado (commite esse arquivo)`);
  }

  // Husky, se o projeto usar; senão, .git/hooks
  const huskyDir = join(root, '.husky');
  const dir = existsSync(huskyDir) ? huskyDir : join(root, hooksDir());
  mkdirSync(dir, { recursive: true });
  const hookPath = join(dir, 'prepare-commit-msg');

  if (existsSync(hookPath)) {
    const current = readFileSync(hookPath, 'utf8');
    if (current.includes('jira-commit')) {
      console.log('✔ Hook já estava instalado');
      return;
    }
    // Já existe um hook (ex.: a padronização de vocês): adiciona sem apagar
    writeFileSync(hookPath, `${current.trimEnd()}\n\n# jira-commit\n${HOOK_LINE}\n`);
  } else {
    writeFileSync(hookPath, `#!/bin/sh\n# jira-commit\n${HOOK_LINE}\n`);
  }
  chmodSync(hookPath, 0o755);
  console.log(`✔ Hook instalado em ${hookPath}`);
}
