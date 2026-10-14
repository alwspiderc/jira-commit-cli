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

Exemplo completo (projeto loja-do-bairro-mobile):

```json
{
  "projectKey": "LOJA",
  "issueType": "Mobile",
  "summaryPrefix": "{product} | Mobile: ",
  "format": "{prefix}{key} {subject}",
  "statuses": ["Em andamento", "PARA CORRIGIR", "Tarefas pendentes"],
  "maxResults": 100
}
```

### Campos

| Campo | Tipo | Padrão | Descrição |
|---|---|---|---|
| `projectKey` | string | — **obrigatório** | Chave do projeto no Jira. Ex.: `LOJA` |
| `issueType` | string | `"Task"` | Tipo usado ao criar uma **tarefa sem pai**. Precisa existir no projeto (ex.: `Mobile`, `Backend`) |
| `subtaskType` | string | descoberto no Jira | Tipo usado para **subtarefa**. Só defina se o projeto tiver mais de um tipo de subtarefa |
| `summaryPrefix` | string | *(sem prefixo)* | Prefixo do título de atividades criadas. Aceita `{product}` |
| `format` | string | `"{key}: {message}"` | Como a chave entra na 1ª linha do commit. Veja os placeholders abaixo |
| `statuses` | string[] | *(todas as abertas)* | Status mostrados por padrão no menu e no `list`. Use os nomes **como aparecem na tela** |
| `jql` | string | *(montado pela CLI)* | JQL próprio. **Substitui** `statuses` e o filtro de responsável |
| `maxResults` | number | `20` | Máximo de atividades buscadas por vez |
| `ai` | boolean | `true` | `false` desliga a sugestão de título por IA neste repositório |
| `aiModel` | string | `"claude-opus-5-5"` | Modelo da sugestão por IA. Ex.: `"claude-haiku-5-5"` para respostas mais rápidas |

### Placeholders do `format`

Exemplo com a mensagem `feat(home): adiciona card` e a atividade `LOJA-12`:

| Placeholder | Valor |
|---|---|
| `{key}` | `LOJA-12` |
| `{message}` | `feat(home): adiciona card` (linha inteira) |
| `{prefix}` | `feat(home): ` (tipo e escopo do Conventional Commits, com o espaço) |
| `{subject}` | `adiciona card` |

| `format` | Resultado | Quando usar |
|---|---|---|
| `{prefix}{key} {subject}` | `feat(home): LOJA-12 adiciona card` | Projetos com commitlint / Conventional Commits |
| `{key}: {message}` | `LOJA-12: feat(home): adiciona card` | Projetos **sem** commitlint |
| `[{key}] {message}` | `[LOJA-12] feat(home): adiciona card` | Outro padrão do time |

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
  "C:/Users/voce/projetos/loja-do-bairro-mobile": {
    "lastParent": "LOJA-2375"
  }
}
```

| Campo | Uso |
|---|---|
| `lastParent` | Última tarefa pai usada ao criar uma subtarefa. Vem pré-selecionada na próxima vez |

Apagar o arquivo só faz a CLI "esquecer" a última tarefa pai.

## IA

| Variável | Efeito |
|---|---|
| `ANTHROPIC_API_KEY` | Liga a sugestão de título por IA |
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
- `"$1"` é o arquivo da mensagem e `"$2"` é a origem (`message`, `merge`, `squash`,
  `commit`…), que o git passa para o hook.

Para **desinstalar**, apague essas duas linhas do `prepare-commit-msg`.
