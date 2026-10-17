# Changelog

Mudanças de cada versão do `jira-commit`. O formato segue o
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem o
[Versionamento Semântico](https://semver.org/lang/pt-BR/).

> [!NOTE]
> As versões 0.1.0 e 0.2.0 foram marcadas depois, nos commits em que cada conjunto ficou pronto.
> As datas são as dos commits.

## [Não lançado]

### Interno

- O git é chamado de forma assíncrona e com a pasta do repositório informada, em vez de bloquear
  o processo e depender da pasta atual. Prepara o núcleo para ser usado fora do terminal (ex.: uma
  extensão do VS Code). Nada muda para quem usa a CLI.
- A configuração do repositório e o estado salvo (última atividade usada etc.) recebem a raiz do
  repositório, em vez de descobrir sozinhos.
- O cliente do Jira passa a ser criado por site (`createJiraClient` e `createJiraApi`), em vez de
  um site global. Dá para falar com dois Jiras ao mesmo tempo; a CLI continua usando um cliente
  padrão.

## [0.3.0] - 2026-10-16

### ⚠️ Pode exigir ajuste

- **A IA vem desligada.** Para ligar, ponha `"ai": true` no `.jira-commit.json`, além de definir
  a `ANTHROPIC_API_KEY`. Assim o diff só sai da máquina quando o repositório pedir.
- **As variáveis `JIRA_*` só valem com a `JIRA_BASE_URL`.** Antes, o `JIRA_API_TOKEN` sozinho
  usava o `jiraUrl` do repositório.
- **O endereço do Jira precisa ser `https://`.** O `http://` só é aceito no `localhost`.

### Segurança

- O token do Jira não vai mais para o endereço que o `.jira-commit.json` indicar. Um repositório
  malicioso não consegue mais receber o token de quem usa as variáveis de ambiente (ex.: no CI).
- A pasta de credenciais é criada com permissão `700`, e o arquivo volta a `600` a cada gravação.

### Corrigido

- O Esc não trava mais o terminal ao voltar de uma pergunta.

### Documentação

- O guia de uso, a configuração, a arquitetura e o README foram reescritos, com diagramas,
  exemplos e perguntas frequentes.

## [0.2.0] - 2026-10-15

### Adicionado

- **Comentar na atividade**, pelo menu do commit ou com `jira-commit comment [CHAVE] ["texto"]`.
  A chave pode ser só o número.
- **Esc volta ao passo anterior** em qualquer pergunta, sem perder o que já foi respondido.
- **14 tipos de commit padrão**, incluindo `patch`, `wip` e `merge`.
- **O `init` instala e configura o Husky**, com npm, yarn ou pnpm.
- **Campos novos** no `.jira-commit.json`: `productSeparator`, `storyPointsScale`, `boardId` e
  `autoLinkBranch` (vincula pela chave no nome da branch, sem abrir o menu).
- **`JIRA_COMMIT_SKIP=1`** pula o hook.
- **Validação do `.jira-commit.json`** por um JSON Schema, que também dá autocomplete no editor.
- **Vários Jiras na mesma máquina.** O repositório escolhe o seu com `jiraUrl`.
- **Jira Server e Data Center**, com token pessoal (PAT), API v2, wiki markup e Epic Link.
- **Projetos sem Node**, com a pasta `.githooks` e a CLI instalada globalmente.
- **`jira-commit doctor`**, que confere a instalação e diz como corrigir cada problema.
- **Português e inglês**, com `language` ou `JIRA_COMMIT_LANG`.
- **`aiInstructions`**: orientação do projeto para as sugestões da IA.
- Visual mais colorido no terminal.
- Testes com `node:test` e CI no GitHub Actions (Ubuntu e Windows, Node 22 e 24).

### Alterado

- O código foi organizado em camadas: `commands`, `flows`, `services`, `infra` e `core`.
- O título da atividade começa com letra maiúscula depois do prefixo do produto.
- O `credentials.json` guarda vários Jiras. O formato antigo é convertido sozinho.
- O hook não usa mais o `npx`. Sem a CLI, o commit segue com um aviso em vez de falhar. O `init`
  troca o hook antigo pelo novo.

## [0.1.0] - 2026-10-14

### Adicionado

- **Hook `prepare-commit-msg`**, que põe a chave da atividade na mensagem do commit.
- **Menu de atividades em árvore**, com as subtarefas embaixo e o status colorido.
- **Busca pelo título** no menu, nas suas atividades e no projeto inteiro.
- **Criar atividade na hora**, tarefa ou subtarefa, com épico, sprint ativa e story points.
- **Questionário do commit** (tipo, escopo e descrição), com os tipos e escopos do
  `.jira-commit.json`.
- **Comandos** `login`, `init` e `list`.
- O `init` importa o `.cz-config.js`, tira o `cz` do hook e cria o `npm run commit`.
- **Descrição da atividade** em ADF, com a lista de arquivos alterados.
- **Sugestão de título por IA**, a partir do diff.
- Identidade visual da CLI.

### Corrigido

- A busca no projeto acha termos com pontuação.
- O cursor fica no lugar certo ao digitar um texto longo.

[0.3.0]: https://github.com/alwspiderc/jira-commit-cli/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/alwspiderc/jira-commit-cli/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/alwspiderc/jira-commit-cli/releases/tag/v0.1.0
