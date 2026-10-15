# Arquitetura (para quem mantém a CLI)

## Visão geral

CLI em Node.js (ESM, Node ≥ 22) com duas dependências:

| Dependência | Uso |
|---|---|
| `@inquirer/prompts` | Menus e campos interativos (`select`, `input`, `confirm`, `password`) |
| `@anthropic-ai/sdk` | Sugestão de título por IA. É **importado só quando a IA está ligada** |

O resto usa só a biblioteca do Node: `fetch` para a API do Jira, `child_process` para o
git e `util.styleText` para as cores.

## Estrutura

O código é dividido em camadas. Cada camada só importa das que estão abaixo dela:

```text
commands  →  flows  →  services  →  infra
    │          │          │           │
    └──────────┴──── ui ──┴── core ───┴── utils
```

- **core**: regras do domínio, funções puras (sem rede, disco ou terminal). É a parte coberta por testes.
- **infra**: tudo que fala com o mundo de fora: API do Jira, git, IA, arquivos de config e de hook.
- **services**: casos de uso sem interação, que juntam infra e core (ex.: montar o JQL e buscar).
- **ui**: identidade visual e prompts. Não conhece Jira nem git.
- **flows**: as conversas com a pessoa (menus e perguntas), compostas a partir das camadas de baixo.
- **commands**: um arquivo por subcomando. Só orquestra.

```text
jira-commit-cli/
├─ bin/jira-commit.js            Entrada: roteia o subcomando e trata erros/Ctrl+C
├─ src/
│  ├─ commands/
│  │  ├─ hook.js                Chamado pelo git: lê a mensagem, chama os flows e grava o resultado
│  │  ├─ init.js                Cria .jira-commit.json, importa do cz, instala o hook e o npm run commit
│  │  ├─ login.js               Salva e testa as credenciais
│  │  └─ list.js                Lista atividades (mesma árvore do menu)
│  ├─ flows/
│  │  ├─ choose-issue.js        Menu de atividades: lista, busca, ações (criar, outros status, pular…)
│  │  ├─ create-issue.js        Criação de tarefa/subtarefa a partir do commit
│  │  ├─ issue-fields.js        Perguntas da criação: tipo, pai, épico, story points
│  │  ├─ after-create.js        Sprint ativa e status inicial (falhas não abortam o commit)
│  │  ├─ commit-questions.js    Questionário do commit (tipo, escopo, descrição) e corpo/BREAKING CHANGE
│  │  └─ manual-key.js          Digitar a chave, validada no Jira
│  ├─ services/
│  │  └─ issues.js              JQL das suas atividades (status por ID), busca no projeto, épicos, tipo de subtarefa
│  ├─ core/
│  │  ├─ commit-message.js      splitConventional, commitBody, detailLines, formatMessage, keyReserve
│  │  ├─ commit-options.js      Seção "commit" do .jira-commit.json e importação do cz
│  │  ├─ issue-title.js         Prefixo do produto e capitalização do título
│  │  ├─ issue-tree.js          Agrupa subtarefas sob o pai
│  │  ├─ issue-match.js         Filtro local (sem acento) das atividades e das opções
│  │  ├─ jql.js                 JQL das suas atividades e da busca no projeto
│  │  └─ adf.js                 Descrição em Atlassian Document Format
│  ├─ infra/
│  │  ├─ jira/client.js         Requisição autenticada, timeout e JiraError (com o status HTTP)
│  │  ├─ jira/api.js            Endpoints da API REST v3 e Agile
│  │  ├─ storage/               credentials.js, repo-state.js, project-config.js
│  │  ├─ git.js                 Raiz do repo, branch, arquivos, diff do stage e descrições recentes
│  │  ├─ git-hook.js            Lê e instala o prepare-commit-msg (Husky ou .git/hooks)
│  │  ├─ commit-tooling.js      .cz-config.js e commitlint do projeto
│  │  ├─ package-json.js        Lê o package.json e grava scripts mantendo a formatação
│  │  ├─ message-file.js        Arquivo da mensagem que o git passa ao hook
│  │  └─ ai.js                  Sugestões de título e de descrição via Claude (opcional)
│  ├─ ui/
│  │  ├─ index.js               Ponto único de import da camada
│  │  ├─ theme.js               Cores, ícones e tema dos prompts
│  │  ├─ prompts.js             Prompts com o tema, separadores e o campo de texto longo
│  │  ├─ search-select.js       Prompt do menu: filtro local na hora + busca remota em paralelo
│  │  ├─ issue-lines.js         Desenha a árvore de atividades
│  │  ├─ issue-choices.js       Árvore como opções do menu
│  │  ├─ output.js              log, cabeçalho e cartão
│  │  ├─ spinner.js             Spinner com ✔/✖ no fim
│  │  └─ summary-card.js        Cartão final do hook
│  ├─ utils/                    text.js (normalize, truncate), promise.js (inBackground)
│  └─ version.js
├─ test/core.test.js            Testes da camada core (node:test)
└─ docs/
```

## Fluxo do hook

```text
git commit  /  npm run commit (= git commit --no-edit, sem editor no fim)
  └─ prepare-commit-msg
       └─ jira-commit hook <arquivo> <origem>
            │
            ├─ origem = merge | squash | commit (amend)? ─────────────► sai sem mexer
            ├─ 1ª linha já tem <projectKey>-<n>? ─────────────────────► sai sem mexer
            │
            ├─ prefetchIssues()  ┐ disparadas sem await: rodam enquanto a pessoa
            ├─ suggestSubject()  ┘ responde (a sugestão só sai com mensagem vazia e IA ligada)
            │
            ├─ mensagem vazia? ── com "commit": askCommit() → "feat(home): adiciona card"
            │                    └ sem "commit": askMessage() (a linha inteira)
            │
            ├─ chooseIssue(): usa a busca antecipada (falha → pede a chave manualmente)
            ├─ buildTree() + treeLines() → menu (searchSelect)   (cursor: chave da branch > última usada)
            │     ├─ digitou? → matchIssues() na lista + projectSearchJql() no Jira (300 ms sem digitar)
            │     ├─ atividade escolhida ─────────┐
            │     ├─ ⋯ outros status → busca de novo com { all: true }
            │     ├─ ¶ detalhes → askDetails() → volta ao menu
            │     ├─ ✎ manual → input validado pelo regex da chave
            │     ├─ ↷ pular → grava sem chave (com o corpo, se houver)
            │     └─ + criar → createFromCommit()  ─┤
            │                                       ▼
            └─ 1ª linha = format com {key} {message} {prefix} {subject}, + detailLines()
               → grava o arquivo → setRepoState({ lastIssueByBranch })
               → git usa a mensagem nova → commit-msg (commitlint)
```

### `createFromCommit`

```text
tipo? ── subtarefa ── chooseParent() ── getIssue(pai)   (labels, componentes, título)
     └─ tarefa
          │
          ├─ stagedFiles() + stagedDiff() ── suggestTitle()   (null se IA desligada/falhou)
          ├─ resolvePrefix(summaryPrefix, productOf(pai) | mostCommonProduct(issues))
          ├─ tarefa? ── chooseEpic()   (openEpics() + mostUsedEpic() começam antes da pergunta do tipo)
          ├─ (em paralelo) activeSprint() só p/ tarefa  +  storyPointsField(tipo)
          ├─ input(título, prefill editável) → askStoryPoints() → confirm
          ├─ createIssue({ parentKey, description: commitDescription(...), labels, components, storyPoints })
          ├─ setRepoState({ lastParent })
          ├─ tarefa? ── moveToSprint(sprint ativa)   (falha não aborta: fica no backlog)
          └─ chooseInitialStatus() ── getTransitions() → transitionIssue()   (falha não aborta)
```

## Endpoints do Jira usados

Todos ficam na API REST v3, com autenticação Basic (`email:token` em base64) e timeout de
10s por requisição (`TIMEOUT_MS` em `infra/jira/client.js`).

| Função | Método e caminho | Uso |
|---|---|---|
| `searchIssues` | `GET /rest/api/3/search/jql` | Busca as atividades e a busca pelo título no projeto (endpoint novo. O `/search` antigo foi descontinuado) |
| `projectStatuses` | `GET /rest/api/3/project/{key}/statuses` | Nome traduzido → ID do status |
| `issueTypes` | `GET /rest/api/3/issue/createmeta/{key}/issuetypes` | Tipos do projeto (`init` e tipo de subtarefa) |
| `getIssue` | `GET /rest/api/3/issue/{key}` | Pai da subtarefa e status atual |
| `getMyself` | `GET /rest/api/3/myself` | `accountId` para o responsável e teste do login |
| `createIssue` | `POST /rest/api/3/issue` | Cria tarefa ou subtarefa |
| `getTransitions` | `GET /rest/api/3/issue/{key}/transitions` | Opções de status inicial |
| `transitionIssue` | `POST /rest/api/3/issue/{key}/transitions` | Aplica o status escolhido |
| `storyPointsField` | `GET /rest/api/3/issue/createmeta/{key}/issuetypes/{id}` | Acha o campo de estimativa da tela de criação do tipo |
| `activeSprint` | `GET /rest/agile/1.0/board?projectKeyOrId={key}` e `GET /rest/agile/1.0/board/{id}/sprint?state=active` | Sprint ativa do primeiro quadro do projeto que tiver uma |
| `moveToSprint` | `POST /rest/agile/1.0/sprint/{id}/issue` | Põe a tarefa nova na sprint ativa |
| `openEpics` | `GET /rest/api/3/search/jql` (tipos com `hierarchyLevel` 1) | Épicos abertos para a pergunta do épico |
| `mostUsedEpic` | `GET /rest/api/3/search/jql` (`parent` das suas atividades) | Épico sugerido na primeira vez |

Campos pedidos na busca: `summary,status,issuetype,parent`. O `parent` só é considerado
quando `issuetype.subtask` é verdadeiro. O pai de uma tarefa comum é o épico, que não
entra na árvore.

## Decisões e porquês

**Status por ID, não por nome.** O Jira devolve os nomes de status no idioma do usuário,
mas o JQL só aceita o nome original. `status IN ("Tarefas pendentes")` não dá erro: volta
vazio. Esse bug já aconteceu. `statusIds()` em `services/issues.js` resolve os nomes pelo endpoint
de status do projeto, que devolve o nome traduzido junto com o ID.

**A chave entra depois do `tipo(escopo):`.** Com commitlint, o tipo precisa ser o começo
da mensagem. `splitConventional()` separa `{prefix}` e `{subject}` para o `format`
poder inserir a chave no meio.

**Árvore em vez de grupos por status.** Na prática, a maior parte das atividades são
subtarefas, e a tarefa pai costuma estar em outro status. Agrupando por status, cada
família ficava espalhada pela lista. Um pai fora do filtro aparece como `Separator`, que
não dá para selecionar, só para dar contexto.

**`/dev/tty`.** O git roda os hooks sem stdin interativo. A linha instalada redireciona o
stdin do terminal para a CLI e testa antes se o terminal existe. Sem essa checagem, um
commit pelo botão do VS Code travaria ou falharia.

**Questionário próprio em vez do commitizen.** O cz fazia 8 perguntas por commit, e o
histórico mostrou que só tipo, escopo e descrição são usados sempre (corpo em ~10% dos
commits, BREAKING CHANGE em nenhum). Por isso corpo e BREAKING CHANGE viraram uma ação do
menu, o ticket saiu (o menu já resolve) e os tipos e escopos ficam num lugar só, o
`.jira-commit.json`, que o commitlint também lê. Se o `cz --hook` continuar no hook, ele
precisa rodar **antes** do jira-commit, porque sobrescreve o arquivo da mensagem inteiro.

**Busca e IA em paralelo com as perguntas.** A busca no Jira e a sugestão de descrição
levam alguns segundos. Disparadas no começo do hook, elas terminam enquanto a pessoa
escolhe tipo e escopo, e o menu abre sem spinner. As promessas recebem `.catch(() => {})`
(ou passam por `inBackground()`) para o Node não encerrar por rejeição não tratada; o erro real aparece quando o resultado é
usado.

**Prompt próprio no menu de atividades (`ui/search-select.js`).** O `@inquirer/search` não
serve por dois motivos. Ele não tem `default`, então o cursor não começaria na atividade
sugerida. E ele só troca a lista quando a busca assíncrona termina, então o filtro das
suas atividades esperaria a rede (0,3 a 1 s por consulta). O prompt próprio, feito com o
`@inquirer/core`, refaz a lista local na hora e acrescenta os resultados do Jira quando
chegam (com 300 ms de espera sem digitar e a busca anterior cancelada).

Um detalhe do `@inquirer/core`: um `setState` feito dentro de um `useEffect`, num render
disparado por tecla, **não redesenha a tela**, porque as atualizações da tecla são juntadas e
a do efeito se perde. Por isso o estado "buscando" é marcado no próprio keypress, junto com
o termo, e o efeito só agenda a busca.

**Texto longo numa linha própria (`field` em `ui/prompts.js`).** O `@inquirer` quebra a linha por
palavra (`wrap-ansi`), mas calcula o cursor com o `readline`, que conta a quebra caractere a
caractere. Quando a descrição passava da largura do terminal, cada quebra deixava o cursor
algumas colunas antes do fim do texto. Os campos de texto longo (descrição, mensagem, título,
corpo e BREAKING CHANGE) mostram o valor na linha de baixo e com espaços que não quebram (NBSP,
só na tela), então a quebra cai exatamente na largura, onde o cursor é calculado. O valor
devolvido continua com espaços normais.

**`git commit --no-edit` sem `-m`.** Sem `-m`, o git roda o `prepare-commit-msg` com o
arquivo vazio (sem os comentários do template) e usa o que o hook gravou, sem abrir o
editor. É isso que o `npm run commit` usa.

**Descrição em ADF.** A API v3 rejeita texto puro em `description`. O `core/adf.js` monta só o
necessário: parágrafos, um título e uma lista com marcação de código.

**Épico pelo nível da hierarquia.** O tipo épico se chama "Epic" numa instância e "Épico" em
outra. Os tipos do projeto trazem `hierarchyLevel` (1 = épico), então `openEpics()` busca por
esse nível. O épico vai no campo `parent` da tarefa, o mesmo que liga a subtarefa à tarefa.

**Sprint pela API de sprints, depois de criar.** A subtarefa segue a sprint do pai sozinha.
A tarefa sem pai, criada sem sprint, ficava só no backlog e não aparecia no quadro. Agora ela
é movida para a sprint ativa com `POST /rest/agile/1.0/sprint/{id}/issue`, depois de criada:
isso dispensa descobrir o `customfield` de sprint de cada instância e, se falhar, a tarefa
continua criada (fica no backlog) e o commit segue. A sprint ativa e o campo de story points
são buscados enquanto a pessoa escreve o título.

**IA tolerante a falhas.** `suggestTitle()` e `suggestSubject()` nunca lançam erro. Qualquer falha (sem chave,
timeout de 8s, recusa, erro de rede) devolve `null`, e o fluxo usa o texto do commit. O
SDK é importado com `import()` dinâmico para não pesar em quem não usa IA.

## Rodar e testar localmente

```bash
cd jira-commit-cli
npm install

# usar num repositório de teste sem alterar o package.json dele
cd /caminho/do/repo-de-teste
npm i --no-save /caminho/para/jira-commit-cli
npx --no-install jira-commit list
```

Como o pacote fica linkado, as mudanças no código valem na hora.

**Testar o hook sem commitar** (num repo com `.jira-commit.json`):

```bash
echo "feat(home): teste" > /tmp/msg
npx --no-install jira-commit hook /tmp/msg message
cat /tmp/msg
```

Para testar o **questionário** (tipo, escopo, descrição), comece com o arquivo vazio:

```bash
: > /tmp/msg
npx --no-install jira-commit hook /tmp/msg ""
cat /tmp/msg
```

Nos dois casos, Ctrl+C no menu de atividades sai sem gravar a chave e não mexe no Jira.

**Testes automatizados:** `npm test` roda os testes da camada `core` com o `node:test`
(sem dependências). Toda regra nova sem I/O deve entrar em `src/core/` com um teste em
`test/core.test.js`. Os flows e o acesso ao Jira são testados à mão, como acima.

> Atenção: criar atividades de teste mexe no Jira compartilhado do time. Use um título
> óbvio ("[TESTE jira-commit] apagar") e apague depois.

## Limitações conhecidas

- **Commit por cliente gráfico** pula o hook (não há terminal para o menu).
- **CLI ausente bloqueia o commit:** o hook chama `npx --no-install jira-commit`. Se a CLI
  não estiver instalada (ex.: um colega sem ela, ou depois de um `npm install` com a
  instalação `--no-save`), o npx falha e o commit é cancelado. Para adotar aos poucos num
  time, todos precisam ter a CLI antes de o hook entrar no repositório.
- **Nome no npm:** existe um pacote público **diferente** chamado `jira-commit`. Por isso o
  hook e a documentação usam `npx --no-install`: sem ele, o npx ofereceria baixar o outro
  pacote quando a CLI não está instalada.
- **`jql` próprio** não converte nomes de status traduzidos. Prefira `statuses`.
- **Busca pelo título no projeto** respeita os acentos (é o Jira que busca): `beneficio` não
  acha "benefício". O filtro das suas atividades, que é local, ignora acentos.
- **Árvore de um nível:** só subtarefas → pai. Épicos não aparecem.
- **IA** só detecta a chave por variável de ambiente (não lê perfis do `ant auth login`).
- **Credenciais** ficam em texto puro. No Windows, a permissão `600` não tem efeito.
- **Distribuição só interna:** `"private": true` no `package.json` faz o npm recusar
  `npm publish`. Os times instalam pelo git
  (`npm i -D git+https://github.com/alwspiderc/jira-commit-cli.git`), e por isso o
  `package.json` precisa ficar na **raiz** do repositório. Para lançar uma versão, suba o
  `version` e crie a tag (`git tag v0.2.0 && git push --tags`).
