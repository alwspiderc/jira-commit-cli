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

```text
jira-commit-cli/
├─ bin/jira-commit.js        Entrada: roteia o subcomando e trata erros/Ctrl+C
├─ src/
│  ├─ commands/
│  │  ├─ hook.js            Chamado pelo git: menu, criação de atividade, reescrita da mensagem
│  │  ├─ init.js            Cria .jira-commit.json e instala o hook
│  │  ├─ login.js           Salva e testa as credenciais
│  │  └─ list.js            Lista atividades (mesma árvore do menu)
│  ├─ config.js             Credenciais, estado local, .jira-commit.json, montagem do JQL
│  ├─ jira.js               Cliente da API REST v3 do Jira
│  ├─ git.js                Raiz do repo, branch, arquivos e diff do stage
│  ├─ tree.js               Agrupa subtarefas sob o pai e desenha as linhas
│  ├─ adf.js                Monta a descrição em Atlassian Document Format
│  └─ ai.js                 Sugestão de título via Claude (opcional)
└─ docs/
```

## Fluxo do hook

```text
git commit
  └─ prepare-commit-msg
       ├─ (opcional) npx cz --hook            → escreve "feat(home): adiciona card"
       └─ jira-commit hook <arquivo> <origem>
            │
            ├─ origem = merge | squash | commit (amend)? ─────────────► sai sem mexer
            ├─ 1ª linha já tem <projectKey>-<n>? ─────────────────────► sai sem mexer
            │
            ├─ buildJql(cfg) → searchIssues()       (falha → pede a chave manualmente)
            ├─ buildTree() + treeLines() → menu
            │     ├─ atividade escolhida ─────────┐
            │     ├─ ⋯ outros status → busca de novo com { all: true }
            │     ├─ ✎ manual → input validado pelo regex da chave
            │     ├─ ↷ pular → sai sem mexer
            │     └─ ＋ criar → createFromCommit()  ─┤
            │                                       ▼
            └─ 1ª linha = format com {key} {message} {prefix} {subject}
               → grava o arquivo → git usa a mensagem nova → commit-msg (commitlint)
```

### `createFromCommit`

```text
tipo? ── subtarefa ── chooseParent() ── getIssue(pai)   (labels, componentes, título)
     └─ tarefa
          │
          ├─ stagedFiles() + stagedDiff() ── suggestTitle()   (null se IA desligada/falhou)
          ├─ resolvePrefix(summaryPrefix, productOf(pai) | mostCommonProduct(issues))
          ├─ input(título, prefill editável) → confirm
          ├─ createIssue({ parentKey, description: commitDescription(...), labels, components })
          ├─ setRepoState({ lastParent })
          └─ chooseInitialStatus() ── getTransitions() → transitionIssue()   (falha não aborta)
```

## Endpoints do Jira usados

Todos ficam na API REST v3, com autenticação Basic (`email:token` em base64) e timeout de
10s por requisição (`TIMEOUT_MS` em `jira.js`).

| Função | Método e caminho | Uso |
|---|---|---|
| `searchIssues` | `GET /rest/api/3/search/jql` | Busca as atividades (endpoint novo. O `/search` antigo foi descontinuado) |
| `projectStatuses` | `GET /rest/api/3/project/{key}/statuses` | Nome traduzido → ID do status |
| `issueTypes` | `GET /rest/api/3/issue/createmeta/{key}/issuetypes` | Tipos do projeto (`init` e tipo de subtarefa) |
| `getIssue` | `GET /rest/api/3/issue/{key}` | Pai da subtarefa e status atual |
| `getMyself` | `GET /rest/api/3/myself` | `accountId` para o responsável e teste do login |
| `createIssue` | `POST /rest/api/3/issue` | Cria tarefa ou subtarefa |
| `getTransitions` | `GET /rest/api/3/issue/{key}/transitions` | Opções de status inicial |
| `transitionIssue` | `POST /rest/api/3/issue/{key}/transitions` | Aplica o status escolhido |

Campos pedidos na busca: `summary,status,issuetype,parent`. O `parent` só é considerado
quando `issuetype.subtask` é verdadeiro. O pai de uma tarefa comum é o épico, que não
entra na árvore.

## Decisões e porquês

**Status por ID, não por nome.** O Jira devolve os nomes de status no idioma do usuário,
mas o JQL só aceita o nome original. `status IN ("Tarefas pendentes")` não dá erro: volta
vazio. Esse bug já aconteceu. `statusIds()` em `config.js` resolve os nomes pelo endpoint
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

**Ordem com o commitizen.** A CLI roda **depois** do `cz --hook`, que sobrescreve o
arquivo da mensagem inteiro. Rodar antes faria a chave se perder.

**Descrição em ADF.** A API v3 rejeita texto puro em `description`. O `adf.js` monta só o
necessário: parágrafos, um título e uma lista com marcação de código.

**Sprint não é enviado.** O Jira copia sozinho o sprint do pai para a subtarefa. Enviar o
campo exigiria descobrir o `customfield` de sprint de cada instância.

**IA tolerante a falhas.** `suggestTitle()` nunca lança erro. Qualquer falha (sem chave,
timeout de 8s, recusa, erro de rede) devolve `null`, e o fluxo usa o texto do commit. O
SDK é importado com `import()` dinâmico para não pesar em quem não usa IA.

## Rodar e testar localmente

```bash
cd jira-commit-cli
npm install

# usar num repositório de teste sem alterar o package.json dele
cd /caminho/do/repo-de-teste
npm i --no-save /caminho/para/jira-commit-cli
npx jira-commit list
```

Como o pacote fica linkado, as mudanças no código valem na hora.

**Testar o hook sem commitar** (num repo com `.jira-commit.json`):

```bash
echo "feat(home): teste" > /tmp/msg
npx jira-commit hook /tmp/msg message
cat /tmp/msg
```

**Funções puras** que dá para testar isoladamente: `splitConventional`, `commitBody`,
`resolvePrefix`, `productOf`, `mostCommonProduct` (em `hook.js`), `buildTree` e
`treeLines` (`tree.js`), e `commitDescription` (`adf.js`).

> Atenção: criar atividades de teste mexe no Jira compartilhado do time. Use um título
> óbvio ("[TESTE jira-commit] apagar") e apague depois.

## Limitações conhecidas

- **Commit por cliente gráfico** pula o hook (não há terminal para o menu).
- **`jql` próprio** não converte nomes de status traduzidos. Prefira `statuses`.
- **Árvore de um nível:** só subtarefas → pai. Épicos não aparecem.
- **IA** só detecta a chave por variável de ambiente (não lê perfis do `ant auth login`).
- **Credenciais** ficam em texto puro. No Windows, a permissão `600` não tem efeito.
- **Distribuição só interna:** `"private": true` no `package.json` faz o npm recusar
  `npm publish`. Os times instalam pelo git
  (`npm i -D git+https://github.com/alwspiderc/jira-commit-cli.git`), e por isso o
  `package.json` precisa ficar na **raiz** do repositório. Para lançar uma versão, suba o
  `version` e crie a tag (`git tag v0.2.0 && git push --tags`).
- No projeto loja-do-bairro-mobile, o `ticketNumberRegExp: '\\d{4}'` do cz vai rejeitar
  chaves a partir da `LOJA-10000`.
