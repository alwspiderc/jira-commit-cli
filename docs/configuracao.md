# Referência de configuração

A CLI usa três fontes de configuração:

| Onde | Escopo | Vai para o git? |
|---|---|---|
| `.jira-commit.json` na raiz do repositório | Projeto (o time todo) | **Sim** |
| `~/.config/jira-commit/credentials.json` | Sua máquina | Nunca |
| `~/.config/jira-commit/state.json` | Sua máquina, por repositório | Nunca |
| Variáveis de ambiente | Sua sessão | Nunca |

---

## `.jira-commit.json`

Exemplo completo (projeto tatico-cidadao-mobile):

```json
{
  "projectKey": "ABDP",
  "issueType": "Mobile",
  "summaryPrefix": "{product} | Mobile: ",
  "format": "{prefix}{key} {subject}",
  "statuses": ["Em andamento", "PARA CORRIGIR", "Tarefas pendentes"],
  "maxResults": 100,
  "commit": {
    "types": [
      { "value": "feat", "description": "Uma nova funcionalidade" },
      { "value": "fix", "description": "Correção de bug" },
      "chore"
    ],
    "scopes": ["sign-in", "sign-up", "home", "geral"],
    "headerMaxLength": 120
  }
}
```

### Campos

| Campo | Tipo | Padrão | Descrição |
|---|---|---|---|
| `projectKey` | string | — **obrigatório** | Chave do projeto no Jira. Ex.: `ABDP` |
| `issueType` | string | `"Task"` | Tipo usado ao criar uma **tarefa sem pai**. Precisa existir no projeto (ex.: `Mobile`, `Backend`) |
| `subtaskType` | string | descoberto no Jira | Tipo usado para **subtarefa**. Só defina se o projeto tiver mais de um tipo de subtarefa |
| `summaryPrefix` | string | *(sem prefixo)* | Prefixo do título de atividades criadas. Aceita `{product}` |
| `format` | string | `"{key}: {message}"` | Como a chave entra na 1ª linha do commit. Veja os placeholders abaixo |
| `statuses` | string[] | *(todas as abertas)* | Status mostrados por padrão no menu e no `list`. Use os nomes **como aparecem na tela** |
| `jql` | string | *(montado pela CLI)* | JQL próprio. **Substitui** `statuses` e o filtro de responsável |
| `maxResults` | number | `20` | Máximo de atividades buscadas por vez (no menu e na busca pelo título no projeto) |
| `ai` | boolean | `true` | `false` desliga as sugestões por IA (descrição do commit e título da atividade) neste repositório |
| `aiModel` | string | `"claude-opus-5-5"` | Modelo da sugestão por IA. Ex.: `"claude-haiku-5-5"` para respostas mais rápidas |
| `storyPoints` | boolean | `true` | `false` não pergunta a estimativa (story points) ao criar uma atividade |
| `commit` | object \| `false` | *(sem questionário)* | Liga as perguntas de tipo, escopo e descrição no commit. Veja abaixo. `false` = o `init` não oferece de novo |

### `commit`

As perguntas que o jira-commit faz num commit sem mensagem (`npm run commit` ou `git commit`
sem `-m`). Veja o fluxo no [guia de uso](guia-de-uso.md#6-questionário-do-commit-tipo-escopo-e-descrição).

| Campo | Tipo | Padrão | Descrição |
|---|---|---|---|
| `types` | (string \| `{ value, description }`)[] | tipos do Conventional Commits | Tipos da lista. A `description` aparece apagada ao lado do tipo e também entra no filtro |
| `scopes` | string[] | `[]` | Escopos da lista. Vazio = a pergunta de escopo não aparece |
| `headerMaxLength` | number | `100` | Tamanho máximo da 1ª linha. A validação da descrição já desconta o espaço da chave do Jira |

Sem a seção `commit` (ou com `"commit": false`), um commit sem mensagem pede a mensagem
inteira numa pergunta só.

O `init` cria essa seção importando do `.cz-config.js`, se existir. Para o commitlint usar a
mesma lista, veja [Commitlint com a mesma lista](guia-de-uso.md#commitlint-com-a-mesma-lista).

### Placeholders do `format`

Exemplo com a mensagem `feat(home): adiciona card` e a atividade `ABDP-12`:

| Placeholder | Valor |
|---|---|
| `{key}` | `ABDP-12` |
| `{message}` | `feat(home): adiciona card` (linha inteira) |
| `{prefix}` | `feat(home): ` (tipo e escopo do Conventional Commits, com o espaço) |
| `{subject}` | `adiciona card` |

| `format` | Resultado | Quando usar |
|---|---|---|
| `{prefix}{key} {subject}` | `feat(home): ABDP-12 adiciona card` | Projetos com commitlint / Conventional Commits |
| `{key}: {message}` | `ABDP-12: feat(home): adiciona card` | Projetos **sem** commitlint |
| `[{key}] {message}` | `[ABDP-12] feat(home): adiciona card` | Outro padrão do time |

Quando a mensagem não segue o Conventional Commits, `{prefix}` fica vazio e `{subject}` é
a linha inteira.

### Placeholder do `summaryPrefix`

`{product}` vira o trecho do título da **tarefa pai** antes do primeiro ` | `. Para uma
tarefa sem pai, vira o produto mais comum entre as suas atividades.

- Se não houver produto (o título não tem ` | `), **nenhum prefixo** é usado. Isso evita
  títulos começando com `" | Mobile: "`.
- Um prefixo sem `{product}` (ex.: `"APP: "`) é usado sempre, do jeito que está.

### `statuses` e `jql`

A busca padrão é:

```text
project = <projectKey> AND assignee = currentUser() AND <filtro> ORDER BY updated DESC
```

| Configuração | `<filtro>` |
|---|---|
| sem `statuses` | `statusCategory != Done` (todas as abertas) |
| com `statuses` | `status IN (<ids>)` |
| `list --todos` / "Ver outros status" | `statusCategory != Done` |
| `list --status X` | `status IN (<id de X>)` |

**Por que IDs?** O Jira mostra os nomes **traduzidos** ("Tarefas pendentes",
"Em andamento"), mas o JQL só aceita os nomes **originais** ("To Do", "In Progress"). Um
JQL com o nome traduzido não dá erro: simplesmente não acha nada. Por isso a CLI busca os
status do projeto e troca cada nome pelo ID, que funciona em qualquer idioma.

Se você definir `jql`, ele é usado exatamente como está na busca padrão. Nesse caso,
**os nomes traduzidos não funcionam** dentro dele. Prefira `statuses`.

---

## Credenciais

`~/.config/jira-commit/credentials.json`, criado pelo `jira-commit login`:

```json
{
  "baseUrl": "https://suaempresa.atlassian.net",
  "email": "voce@empresa.com",
  "token": "ATATT3x..."
}
```

| Variável de ambiente | Substitui |
|---|---|
| `JIRA_BASE_URL` | `baseUrl` |
| `JIRA_EMAIL` | `email` |
| `JIRA_API_TOKEN` | `token` |

As variáveis têm prioridade sobre o arquivo. Isso é útil em CI ou para testar com outra
conta.

## Estado local

`~/.config/jira-commit/state.json`. A CLI mantém esse arquivo sozinha e não é preciso
editar.

```json
{
  "C:/Users/voce/projetos/tatico-cidadao-mobile": {
    "lastParent": "ABDP-2375",
    "lastIssueByBranch": { "develop": "ABDP-2411" }
  }
}
```

| Campo | Uso |
|---|---|
| `lastParent` | Última tarefa pai usada ao criar uma subtarefa. Vem pré-selecionada na próxima vez |
| `lastIssueByBranch` | Atividade do último commit em cada branch. O cursor do menu começa nela no próximo commit |

Apagar o arquivo só faz a CLI "esquecer" a última tarefa pai e as últimas atividades.

## IA

| Variável | Efeito |
|---|---|
| `ANTHROPIC_API_KEY` | Liga as sugestões por IA (descrição do commit e título da atividade) |
| `ANTHROPIC_AUTH_TOKEN` | Alternativa à `ANTHROPIC_API_KEY` |

Sem nenhuma das duas, a IA fica desligada, mesmo com `"ai": true`.

## Hook instalado

O `init` adiciona ao `prepare-commit-msg` (do Husky ou do `.git/hooks`):

```sh
# jira-commit
if sh -c ": >/dev/tty" 2>/dev/null; then npx --no-install jira-commit hook "$1" "$2" < /dev/tty; fi
```

- `sh -c ": >/dev/tty"` testa se existe um terminal. Em clientes gráficos não existe, e o
  hook é pulado.
- `npx --no-install` usa a CLI instalada no projeto e nunca baixa nada na hora do commit.
  Se ela não estiver instalada, o npx falha e **o commit é cancelado**.
- `"$1"` é o arquivo da mensagem e `"$2"` é a origem (`message`, `merge`, `squash`,
  `commit`…), que o git passa para o hook.

Com o questionário ligado, o `init` também cria (ou troca, se você confirmar) o script no
`package.json`:

```json
"scripts": {
  "commit": "git commit --no-edit"
}
```

Sem `-m`, o `--no-edit` faz o git usar a mensagem que o hook gravou, sem abrir o editor.

Para **desinstalar**, apague essas duas linhas do `prepare-commit-msg` e o script `commit`.
