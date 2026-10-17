# ⚙️ Referência de configuração

Tudo o que dá para configurar no `jira-commit`. Para o passo a passo de uso, veja o
[guia de uso](guia-de-uso.md).

| Onde | Escopo | Vai para o git? | Seção |
| --- | --- | --- | --- |
| `.jira-commit.json`, na raiz do repositório | O time, naquele repositório | ✔ **Sim** | [1](#1-jira-commitjson) |
| `~/.config/jira-commit/credentials.json` | Sua máquina | ✖ Nunca | [2](#2-credenciais) |
| `~/.config/jira-commit/state.json` | Sua máquina, por repositório | ✖ Nunca | [3](#3-estado-local) |
| Variáveis de ambiente | Sua sessão do terminal | ✖ Nunca | [4](#4-variáveis-de-ambiente) |
| O hook `prepare-commit-msg` | O repositório | Depende da pasta | [5](#5-o-hook) |

---

## 1. `.jira-commit.json`

Criado pelo `jira-commit init`. Só o `projectKey` é obrigatório: o resto tem um padrão.

**Mínimo:**

```json
{
  "projectKey": "LOJA"
}
```

<details>
<summary><b>Exemplo completo</b> (projeto loja-do-bairro-mobile)</summary>

```json
{
  "$schema": "./node_modules/jira-commit-cli/schema/jira-commit.schema.json",
  "projectKey": "LOJA",
  "jiraUrl": "https://suaempresa.atlassian.net",
  "language": "pt",
  "issueType": "Mobile",
  "summaryPrefix": "{product} | Mobile: ",
  "format": "{prefix}{key} {subject}",
  "statuses": ["Em andamento", "PARA CORRIGIR", "Tarefas pendentes"],
  "maxResults": 100,
  "storyPointsScale": [1, 2, 3, 5, 8, 13],
  "autoLinkBranch": false,
  "aiInstructions": "Cite a tela do app afetada pela mudança",
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

</details>

### Validação e autocomplete

A CLI confere o arquivo **a cada uso**. Se algo estiver errado, ela para e aponta o campo:

```text
✖ .jira-commit.json tem 2 problema(s):
  · projectKey está num formato inválido (ex.: APP)
  · maxResults deve ser no mínimo 1
```

Campos que ela não conhece **não travam nada**, porque podem ser de uma versão mais nova da CLI.
O `jira-commit doctor` mostra quais são.

> [!TIP]
> Em projetos Node, o `init` grava a linha `"$schema"` do exemplo acima. Com ela, o VS Code e
> outros editores **sugerem os campos, explicam cada um e sublinham os erros** enquanto você
> digita. As regras ficam em [`schema/jira-commit.schema.json`](../schema/jira-commit.schema.json).

### Campos

#### Projeto e Jira

| Campo | Tipo | Padrão | Para que serve |
| --- | --- | --- | --- |
| `projectKey` | texto | **obrigatório** | Chave do projeto no Jira. Ex.: `LOJA` |
| `jiraUrl` | texto | o Jira padrão do `login` | Qual Jira este repositório usa, quando você fez login em mais de um. Precisa ser `https://` (`http://` só no `localhost`) e já estar salvo pelo `login` |
| `language` | `"pt"` \| `"en"` | idioma do sistema | Idioma da CLI e das sugestões da IA neste repositório |

#### Lista de atividades

| Campo | Tipo | Padrão | Para que serve |
| --- | --- | --- | --- |
| `statuses` | lista de textos | todas as abertas | Status mostrados no menu e no `list`, **como aparecem na tela** do Jira |
| `jql` | texto | montado pela CLI | JQL próprio. **Substitui** o `statuses` e o filtro de responsável ([veja abaixo](#statuses-e-jql)) |
| `maxResults` | número inteiro | `20` | Máximo de atividades buscadas por vez, no menu e na busca do projeto |
| `productSeparator` | texto | `" \| "` | O que separa o produto do resto do título. Usado no `{product}` e para apagar o produto nas listas |

#### Mensagem do commit

| Campo | Tipo | Padrão | Para que serve |
| --- | --- | --- | --- |
| `format` | texto | `"{key}: {message}"` | Como a chave entra na 1ª linha ([placeholders](#placeholders-do-format)) |
| `commit` | objeto \| `false` | sem questionário | Liga as perguntas de tipo, escopo e descrição ([veja abaixo](#a-seção-commit)). `false` = o `init` não oferece de novo |
| `autoLinkBranch` | `true` \| `false` | `false` | Com uma chave no nome da branch (ex.: `feature/LOJA-12-login`), vincula direto, **sem abrir o menu** |

#### Criar atividade

| Campo | Tipo | Padrão | Para que serve |
| --- | --- | --- | --- |
| `issueType` | texto | `"Task"` | Tipo das atividades criadas pela CLI que **não** são subtarefa. Precisa existir no projeto (ex.: `Tarefa`, `Mobile`, `Backend`) |
| `subtaskType` | texto | descoberto no Jira | Tipo de **subtarefa**. Só defina se o projeto tiver mais de um |
| `summaryPrefix` | texto | sem prefixo | Prefixo do título. Aceita `{product}` ([veja abaixo](#o-prefixo-do-título)) |
| `storyPoints` | `true` \| `false` | `true` | `false` não pergunta a estimativa |
| `storyPointsScale` | lista de números | `[1, 2, 3, 5, 8, 13]` | Opções de story points |
| `boardId` | número inteiro | o primeiro quadro com sprint ativa | Quadro de onde vem a sprint ativa. Útil em projetos com vários quadros |

#### Inteligência artificial

| Campo | Tipo | Padrão | Para que serve |
| --- | --- | --- | --- |
| `ai` | `true` \| `false` | `false` | `true` liga as sugestões neste repositório. O diff do commit vai para a API da Anthropic |
| `aiModel` | texto | `"claude-opus-5-5"` | Modelo das sugestões. Ex.: `"claude-haiku-5-5"`, mais rápido e mais barato |
| `aiInstructions` | texto | — | Orientação do projeto, somada às instruções da CLI. Ex.: `"Use os termos do domínio bancário"` |

> [!NOTE]
> A IA só liga com as duas coisas: `"ai": true` no `.jira-commit.json` **e** a variável
> `ANTHROPIC_API_KEY` definida ([seção 4](#4-variáveis-de-ambiente)).

### A seção `commit`

As perguntas de um commit sem mensagem (`npm run commit` ou `git commit` sem `-m`). Veja o
fluxo no [guia de uso](guia-de-uso.md#7-questionário-do-commit).

| Campo | Tipo | Padrão | Para que serve |
| --- | --- | --- | --- |
| `types` | lista de textos ou de `{ value, description }` | tipos padrão da CLI | Tipos oferecidos. A `description` aparece ao lado do tipo e também entra no filtro |
| `scopes` | lista de textos | `[]` | Escopos oferecidos. Vazio = a pergunta de escopo não aparece |
| `headerMaxLength` | número inteiro | `100` | Tamanho máximo da 1ª linha. O limite da descrição já desconta o espaço da chave |

<details>
<summary><b>Tipos padrão da CLI</b></summary>

| Tipo | Descrição |
| --- | --- |
| `feat` | Uma nova funcionalidade |
| `patch` | Adição de pequena funcionalidade |
| `fix` | Correção de bug |
| `docs` | Apenas documentação |
| `style` | Formatação, ponto e vírgula, etc. (sem mudança de código) |
| `refactor` | Refatoração de código |
| `perf` | Melhoria de performance |
| `test` | Adicionando ou corrigindo testes |
| `build` | Mudanças no build ou dependências externas |
| `ci` | Mudanças na configuração de CI |
| `chore` | Tarefas de manutenção e configuração |
| `revert` | Reverte um commit anterior |
| `wip` | Work in progress |
| `merge` | Merge de branches |

Em inglês (`"language": "en"`), as descrições aparecem em inglês.
</details>

Sem a seção `commit` (ou com `"commit": false`), um commit sem mensagem pede a mensagem inteira
numa pergunta só. O `init` cria a seção importando do `.cz-config.js`, se existir. Para o
commitlint usar a mesma lista, veja
[Commitlint com a mesma lista](guia-de-uso.md#commitlint-com-a-mesma-lista).

### Placeholders do `format`

Com a mensagem `feat(home): adiciona card` e a atividade `LOJA-12`:

| Placeholder | Vira |
| --- | --- |
| `{key}` | `LOJA-12` |
| `{message}` | `feat(home): adiciona card` (a linha inteira) |
| `{prefix}` | `feat(home): ` (tipo e escopo, com o espaço) |
| `{subject}` | `adiciona card` |

| `format` | Resultado | Quando usar |
| --- | --- | --- |
| `{prefix}{key} {subject}` | `feat(home): LOJA-12 adiciona card` | Projetos com commitlint ou Conventional Commits |
| `{key}: {message}` | `LOJA-12: feat(home): adiciona card` | Projetos **sem** commitlint |
| `[{key}] {message}` | `[LOJA-12] feat(home): adiciona card` | Outro padrão do time |

Quando a mensagem não segue o Conventional Commits, o `{prefix}` fica vazio e o `{subject}` é
a linha inteira.

### O prefixo do título

O `{product}` do `summaryPrefix` vira o trecho do título da **tarefa pai** antes do separador
(`productSeparator`, padrão ` | `). Numa tarefa sem pai, vira o produto mais comum entre as suas
atividades.

| Tarefa pai | `summaryPrefix` | Prefixo |
| --- | --- | --- |
| `LOJA DO BAIRRO \| Mobile - Benefícios: Criar…` | `{product} \| Mobile: ` | `LOJA DO BAIRRO \| Mobile: ` |
| `Criar fluxo de login` (sem separador) | `{product} \| Mobile: ` | *(nenhum)* |
| qualquer | `APP: ` (sem `{product}`) | `APP: ` |

Sem produto, **nenhum prefixo** é usado. Isso evita títulos começando com `" | Mobile: "`.

### `statuses` e `jql`

A busca padrão das suas atividades é:

```text
project = <projectKey> AND assignee = currentUser() AND <filtro> ORDER BY updated DESC
```

| Situação | `<filtro>` |
| --- | --- |
| Sem `statuses` | `statusCategory != Done` (todas as abertas) |
| Com `statuses` | `status IN (<ids>)` |
| `list --todos` ou **⋯ Ver outros status** | `statusCategory != Done` |
| `list --status X` | `status IN (<id de X>)` |

> [!IMPORTANT]
> **Por que IDs?** O Jira mostra os nomes **traduzidos** ("Tarefas pendentes"), mas o JQL só
> aceita os **originais** ("To Do"). Um JQL com o nome traduzido não dá erro: simplesmente volta
> vazio. Por isso a CLI troca cada nome pelo ID do status, que funciona em qualquer idioma. Um
> `jql` próprio é usado do jeito que está, então **nomes traduzidos não funcionam nele**.
> Prefira o `statuses`.

---

## 2. Credenciais

`~/.config/jira-commit/credentials.json`, criado pelo `jira-commit login`. Guarda **um ou mais
Jiras** (ex.: um por cliente):

```json
{
  "default": "https://suaempresa.atlassian.net",
  "sites": {
    "https://suaempresa.atlassian.net": { "type": "cloud", "email": "voce@empresa.com", "token": "ATATT3x..." },
    "https://jira.cliente.com.br": { "type": "server", "token": "NjM2..." }
  }
}
```

| Campo | Significado |
| --- | --- |
| `default` | O Jira usado quando o repositório não tem `jiraUrl` |
| `sites.<url>.type` | `cloud` (e-mail + API token, autenticação Basic) ou `server` (Server/Data Center, token pessoal, autenticação Bearer) |
| `sites.<url>.email` | Só no Cloud |
| `sites.<url>.token` | O token |

- Cada `login` adiciona um Jira ou troca o token de um que já está salvo. O primeiro vira o
  padrão; nos seguintes, o login pergunta se você quer trocar.
- O formato antigo, de um Jira só (`baseUrl`, `email`, `token`), é convertido sozinho.
- O endereço precisa ser `https://`. O `http://` só é aceito no `localhost`, porque o token iria
  sem criptografia.
- A pasta é criada só com acesso seu (`700`) e o arquivo com `600`. No Windows essas permissões
  não têm efeito: a proteção é a da sua pasta de usuário.

> [!CAUTION]
> O token fica em texto puro. No Linux e no macOS o arquivo é criado com permissão `600`. No
> Windows, fica protegido só pela pasta do seu perfil. **Nunca commite esse arquivo.**

---

## 3. Estado local

`~/.config/jira-commit/state.json`. A CLI mantém esse arquivo sozinha: não é preciso editar.

```json
{
  "C:/Users/voce/projetos/loja-do-bairro-mobile": {
    "lastParent": "LOJA-2375",
    "lastIssueByBranch": { "develop": "LOJA-2411" },
    "lastEpic": "LOJA-232"
  }
}
```

| Campo | Para que serve |
| --- | --- |
| `lastParent` | Última tarefa pai usada numa subtarefa. Vem selecionada na próxima vez |
| `lastIssueByBranch` | Atividade do último commit em cada branch. O cursor do menu começa nela |
| `lastEpic` | Último épico escolhido (`null` = "sem épico"). Vem selecionado na próxima vez |

Apagar o arquivo só faz a CLI "esquecer" essas escolhas.

---

## 4. Variáveis de ambiente

| Variável | Efeito |
| --- | --- |
| `JIRA_BASE_URL` | Endereço do Jira. **Obrigatória** para as variáveis `JIRA_*` valerem |
| `JIRA_EMAIL` | E-mail (Cloud) |
| `JIRA_API_TOKEN` | Token. **Com ele e a `JIRA_BASE_URL` definidos, as variáveis `JIRA_*` valem no lugar do arquivo de credenciais** (útil em CI). O token nunca vai para o `jiraUrl` do repositório, só para a `JIRA_BASE_URL` |
| `JIRA_TYPE` | `cloud` ou `server`. Padrão: `cloud` quando há `JIRA_EMAIL`, senão `server` |
| `JIRA_COMMIT_LANG` | `pt` ou `en`. Vale quando o `.jira-commit.json` não define `language` |
| `JIRA_COMMIT_SKIP` | `1` faz o hook não fazer nada: nem pergunta nem mexe na mensagem |
| `ANTHROPIC_API_KEY` | Chave das sugestões por IA. Só vale com `"ai": true` no `.jira-commit.json` |
| `ANTHROPIC_AUTH_TOKEN` | Alternativa à `ANTHROPIC_API_KEY` |
| `NO_COLOR` | Qualquer valor desliga as cores |

<details>
<summary><b>Como definir uma variável</b> (Git Bash e PowerShell)</summary>

| | Git Bash / Linux / macOS | PowerShell |
| --- | --- | --- |
| Só para um comando | `JIRA_COMMIT_SKIP=1 git commit -m "x"` | `$env:JIRA_COMMIT_SKIP = "1"; git commit -m "x"; Remove-Item Env:JIRA_COMMIT_SKIP` |
| Na sessão atual | `export JIRA_COMMIT_LANG=en` | `$env:JIRA_COMMIT_LANG = "en"` |
| Permanente | linha `export ...` no `~/.bashrc` | `[Environment]::SetEnvironmentVariable("JIRA_COMMIT_LANG", "en", "User")` e abra um terminal novo |

</details>

---

## 5. O hook

O `init` acrescenta este bloco ao `prepare-commit-msg`:

```sh
# jira-commit
JC=./node_modules/.bin/jira-commit; [ -f "$JC" ] || JC=$(command -v jira-commit)
if [ -z "$JC" ]; then echo "jira-commit: CLI não encontrada / not found" >&2
elif sh -c ": >/dev/tty" 2>/dev/null; then "$JC" hook "$1" "$2" < /dev/tty; fi
```

| Linha | O que faz |
| --- | --- |
| `JC=...` | Usa a CLI do projeto (`node_modules`) e, se não houver, a instalada globalmente |
| `if [ -z "$JC" ]` | Sem CLI nenhuma, **o commit segue** sem o menu, só com um aviso |
| `sh -c ": >/dev/tty"` | Só abre o menu se houver um terminal. Pelo botão do editor não há, e o hook é pulado |
| `"$1" "$2"` | O arquivo da mensagem e a origem (`message`, `merge`, `squash`, `commit`…), que o git passa |

### Onde fica o arquivo

| Projeto | Pasta | Vai para o repositório? |
| --- | --- | --- |
| Node com Husky | `.husky/` | ✔ Sim |
| Sem `package.json` | `.githooks/`, ativada com `git config core.hooksPath .githooks` | ✔ Sim. Como o `core.hooksPath` é local, cada pessoa roda o `init` uma vez |
| Outros casos | `.git/hooks/` | ✖ Só na sua máquina |

Hooks de versões antigas (com `npx --no-install jira-commit hook`) são trocados por este bloco
quando você roda o `init` de novo. O `doctor` avisa quando o hook está desatualizado.

### O script `npm run commit`

Com o questionário ligado, o `init` também cria (ou troca, se você confirmar):

```json
"scripts": {
  "commit": "git commit --no-edit"
}
```

Sem `-m`, o `--no-edit` faz o git usar a mensagem que o hook gravou, sem abrir o editor.

### Desinstalar

1. Apague o bloco `# jira-commit` do `prepare-commit-msg`.
2. Apague o script `commit` do `package.json` (se quiser).
3. `npm uninstall jira-commit-cli` (ou `npm uninstall -g jira-commit-cli`).
4. Em projetos com `.githooks`: `git config --unset core.hooksPath`.
