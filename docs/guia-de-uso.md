# Guia de uso

Este guia é para quem vai usar o `jira-commit` no dia a dia. Para a lista completa de
opções do `.jira-commit.json`, veja [configuracao.md](configuracao.md).

- [1. O que a CLI faz](#1-o-que-a-cli-faz)
- [2. Pré-requisitos](#2-pré-requisitos)
- [3. Instalação](#3-instalação)
- [4. Login (uma vez por máquina)](#4-login-uma-vez-por-máquina)
- [5. Configurar o repositório (uma vez por repo)](#5-configurar-o-repositório-uma-vez-por-repo)
- [6. Projetos com commitizen e commitlint](#6-projetos-com-commitizen-e-commitlint)
- [7. O dia a dia: commitando](#7-o-dia-a-dia-commitando)
- [8. Criar atividade a partir do commit](#8-criar-atividade-a-partir-do-commit)
- [9. Sugestão de título por IA](#9-sugestão-de-título-por-ia)
- [10. Listar suas atividades](#10-listar-suas-atividades)
- [11. Quando o hook não aparece (ou não deveria aparecer)](#11-quando-o-hook-não-aparece-ou-não-deveria-aparecer)
- [12. Problemas comuns](#12-problemas-comuns)
- [13. Perguntas frequentes](#13-perguntas-frequentes)

---

## 1. O que a CLI faz

Na hora do `git commit`, o `jira-commit` abre um menu com as suas atividades do Jira e
coloca a chave escolhida na mensagem do commit:

```text
feat(home): adiciona card de benefício
        ↓
feat(home): LOJA-2411 adiciona card de benefício
```

Se a atividade ainda não existe, dá para **criar na hora**, inclusive como **subtarefa**
de uma tarefa existente. Ela já sai com título, descrição, responsável e status.

O hook entra no menu do commit e não faz mais nada por fora. Ele não faz push, não muda o
status de atividades existentes e não comenta no Jira.

## 2. Pré-requisitos

| Item | Detalhe |
|---|---|
| Node.js | 22 ou mais novo (`node -v`) |
| Git | Qualquer versão recente. No Windows, use o **Git Bash** ou o terminal integrado do VS Code |
| Conta Atlassian | Com acesso ao projeto do Jira |
| API token | Gerado em <https://id.atlassian.com/manage-profile/security/api-tokens> |

## 3. Instalação

A CLI é **interna** e não é publicada no npm. Ela é instalada direto do repositório git.

No repositório onde você vai commitar:

```bash
npm i -D git+https://github.com/alwspiderc/jira-commit-cli.git
```

- O repositório é privado. Você precisa ter acesso a ele no GitHub, e o git da sua máquina
  precisa estar autenticado: se `git clone` desse endereço funciona, a instalação também
  funciona.
- Para fixar uma versão, adicione a tag no fim: `...jira-commit-cli.git#v0.1.0`. Sem tag,
  o npm instala o que estiver na branch principal no momento.
- Para atualizar depois: `npm update jira-commit-cli`, ou reinstale com a tag nova.

**Para testar uma cópia local** (ex.: enquanto mexe no código da CLI):

```bash
npm i --no-save ../caminho/para/jira-commit-cli
```

O `--no-save` não mexe no `package.json` nem no lock, e o próximo `npm install` remove o
pacote. O pacote instalado é um link para a pasta, então qualquer mudança no código da CLI
vale na hora.

Confira se o binário ficou disponível:

```bash
npx --no-install jira-commit
```

Deve aparecer a ajuda com os comandos `login`, `init` e `list`.

## 4. Login (uma vez por máquina)

```bash
npx jira-commit login
```

| Pergunta | Exemplo |
|---|---|
| URL do Jira | `https://suaempresa.atlassian.net` |
| E-mail da conta Atlassian | `voce@empresa.com` |
| API token | o token gerado no passo 2 (fica mascarado) |

No fim ele testa a conexão e mostra `✔ Conectado como <seu nome>`.

As credenciais ficam em `~/.config/jira-commit/credentials.json`. Também dá para usar as
variáveis `JIRA_BASE_URL`, `JIRA_EMAIL` e `JIRA_API_TOKEN`, que têm prioridade sobre o
arquivo.

> **Segurança:** o arquivo guarda o token em texto puro. No Linux e no macOS ele é criado com
> permissão `600`, legível só pelo seu usuário. No Windows essa permissão não tem efeito, e o
> arquivo fica protegido só pela pasta do seu perfil. Nunca commite esse arquivo.

## 5. Configurar o repositório (uma vez por repo)

```bash
npx jira-commit init
```

O `init` faz duas coisas.

**a) Cria o `.jira-commit.json`** (se ainda não existir), perguntando:

| Pergunta | O que responder |
|---|---|
| Chave do projeto | O prefixo das atividades. Ex.: `LOJA` para `LOJA-2410` |
| Tipo das tarefas criadas (sem pai) | Escolha na lista, que vem do seu Jira. Ex.: `Mobile` |
| Prefixo do título | Padrão `{product} \| <Tipo>: `. Veja a [seção 8](#prefixo-do-título) |
| Formato da mensagem | Em projetos com commitlint, aceite `{prefix}{key} {subject}` |

**Commite o `.jira-commit.json`.** Ele é a configuração do time para aquele repositório.

**b) Instala o hook** `prepare-commit-msg`:
- se o projeto usa **Husky** (tem a pasta `.husky/`), a linha é adicionada em
  `.husky/prepare-commit-msg`;
- senão, vai para `.git/hooks/prepare-commit-msg`;
- se já existir um hook, a linha do jira-commit é **acrescentada no final**, sem apagar
  nada. Rodar o `init` de novo não duplica a linha.

## 6. Projetos com commitizen e commitlint

Muitos projetos já têm um fluxo assim no `prepare-commit-msg`:

```sh
exec < /dev/tty && npx cz --hook || true      # questionário do commitizen
# jira-commit                                 # adicionado pelo init
if sh -c ": >/dev/tty" ...; then npx --no-install jira-commit hook "$1" "$2" < /dev/tty; fi
```

A ordem importa: **o cz roda primeiro** e escreve a mensagem, e depois o jira-commit
olha essa mensagem.

- Se você **digitar o ticket no cz**, a mensagem já chega com a chave e o jira-commit
  não aparece.
- Se você **deixar o ticket em branco**, o jira-commit abre o menu de atividades.

Para isso funcionar, o ticket precisa ser **opcional** no cz. No `.cz-config.js`:

```js
allowTicketNumber: true,
isTicketNumberRequired: false,   // era true
ticketNumberPrefix: 'LOJA-',
```

Com `"format": "{prefix}{key} {subject}"`, a chave entra **depois** do `tipo(escopo):`, no
mesmo lugar em que o cz colocaria. Assim o commitlint continua aceitando a mensagem:

```text
feat(home): LOJA-2410 cria o header da Home
```

> Atenção: com `"format": "{key}: {message}"` a mensagem ficaria
> `LOJA-2410: feat(home): ...` e o **commitlint rejeitaria**, porque o tipo precisa ser a
> primeira coisa.

## 7. O dia a dia: commitando

Faça o commit normalmente, **pelo terminal**:

```bash
git add .
git commit            # ou: npm run commit, se o projeto usa cz
```

O menu tem duas partes: **ações** no topo e **atividades** em árvore embaixo.

```text
◆ jira-commit  LOJA · develop
│ feat(home): adiciona card de benefício

◆ Qual atividade é esse commit?
  + Criar nova atividade
  ⋯ Ver outros status
  ✎ Digitar a chave
  ↷ Pular
 ── suas atividades (31) ─────────────────
❯ LOJA-2375  LOJA DO BAIRRO | Mobile - Benefícios: Criar tela de…  Tarefas pendentes
  ├─ LOJA-2415  LOJA DO BAIRRO | Mobile: Criar testes E2E com Mae…  Tarefas pendentes
  └─ LOJA-2413  LOJA DO BAIRRO | Mobile: Exibir os estados de car…  Tarefas pendentes
  LOJA-2416  LOJA DO BAIRRO | Tema Mobile - Tirar o dark mode do…   Tarefas pendentes
  LOJA DO BAIRRO | Mobile - Benefícios: Criar tela de benefícios quando cidadão tem mais…  ·  Tarefas pendentes
  ↑↓ navegar  ·  ⏎ escolher
```

Logo abaixo da lista aparecem o **título completo** da atividade destacada (na linha ele é
cortado) e as teclas de navegação. Enquanto busca no Jira, um spinner mostra o que está
acontecendo.

| Elemento | Significado |
|---|---|
| `├─` / `└─` | Subtarefa da linha de cima |
| Linha apagada (cinza) | Tarefa pai que está fora do filtro de status. Aparece só para dar contexto e não dá para selecionar |
| Status em azul | Categoria "a fazer" |
| Status em amarelo | Categoria "em andamento" (inclui TESTANDO, PARA CORRIGIR etc.) |
| Texto antes do `\|` apagado | O produto ("LOJA DO BAIRRO"), para destacar o nome da atividade |

**Navegação:** use as setas ↑/↓ e confirme com Enter. A lista **para no fim** e não volta
para o começo. O cursor começa na **primeira atividade**, nunca numa ação, então um Enter
sem querer não cria nada.

**Quais atividades aparecem:** por padrão, só as **suas** (`assignee = você`) nos status
configurados em `statuses`, por exemplo Em andamento, PARA CORRIGIR e Tarefas pendentes.
Para ver as outras, escolha **⋯ Ver outros status**, e para voltar, **← Voltar aos
status padrão**.

**Branch com chave:** se a branch tiver uma chave no nome (ex.:
`feature/LOJA-2410-header`), a família daquela atividade vai para o topo e o cursor
começa nela.

**Ações:**

| Ação | O que acontece |
|---|---|
| + Criar nova atividade | Cria no Jira e já vincula ao commit ([seção 8](#8-criar-atividade-a-partir-do-commit)) |
| ⋯ Ver outros status | Mostra todas as suas atividades abertas |
| ✎ Digitar a chave | Para uma atividade que não é sua ou não aparece na lista. A CLI confere se a chave existe no Jira |
| ↷ Pular | Commita sem chave (o commitlint/cz do projeto pode reclamar) |

## 8. Criar atividade a partir do commit

Escolha **+ Criar nova atividade**.

**1. Tipo**

```text
◆ Que tipo de atividade?
❯ ↳ Subtarefa
  ▣ Mobile
  Fica embaixo de uma tarefa existente e herda sprint, labels e componentes
```

**2. Tarefa pai** (só para subtarefa)

```text
◆ Subtarefa de qual tarefa?
  ✎ Digitar a chave da tarefa pai
 ── tarefas (12) ─────────────────────────
❯ LOJA-2375  LOJA DO BAIRRO | Mobile - Benefícios: ...  ★ última usada
  LOJA-2373  LOJA DO BAIRRO | Mobile - Tela Inicial: ...
```

A **última tarefa pai usada neste repositório** já vem selecionada. Isso ajuda quando você
cria várias subtarefas seguidas da mesma tarefa.

**3. Título**

O campo já vem **preenchido e editável**: prefixo + texto do commit (ou a sugestão da IA,
[seção 9](#9-sugestão-de-título-por-ia)). Ajuste o que quiser e confirme com Enter.

```text
◆ Título · sugerido pela IA  LOJA DO BAIRRO | Mobile: Criar card de benefício na Home▌
```

<a id="prefixo-do-título"></a>
**Prefixo do título.** Vem do `summaryPrefix`. O `{product}` é substituído pelo trecho do
título da tarefa pai **antes do ` | `**:

| Tarefa pai | `summaryPrefix` | Prefixo gerado |
|---|---|---|
| `LOJA DO BAIRRO \| Mobile - Benefícios: Criar…` | `{product} \| Mobile: ` | `LOJA DO BAIRRO \| Mobile: ` |
| `Mobile - Login \| Criar fluxo…` | `{product} \| Mobile: ` | `Mobile - Login \| Mobile: ` |
| `Criar fluxo de login` (sem ` \| `) | `{product} \| Mobile: ` | *(sem prefixo)* |

Para uma **tarefa sem pai**, o `{product}` é o produto que mais aparece nas suas atividades.

**4. Confirmação**

```text
◆ Criar subtarefa de LOJA-2375? (Y/n)
✔ LOJA-2423 criada no Jira
```

**5. Status inicial**

```text
◆ Status de LOJA-2423
❯ ● Manter em Tarefas pendentes
  → Em andamento
  → TESTANDO
  → PARA TECH LEAD
  ...
```

As opções são as transições que o workflow do Jira permite a partir do status inicial.
Se a mudança de status falhar, a atividade continua criada e o commit segue.

**6. Resumo**

No fim aparece um cartão com o que aconteceu e o link para abrir a atividade no Jira:

```text
╭─ ✔ Atividade criada e vinculada ───────────────────────────────────╮
│ LOJA-2423  LOJA DO BAIRRO | Mobile: Criar card de benefício na Home │
│ nova subtarefa de LOJA-2375  ·  status Em andamento                 │
│                                                                     │
│ feat(home): LOJA-2423 adiciona card de benefício                    │
│ ↗ https://suaempresa.atlassian.net/browse/LOJA-2423                        │
╰─────────────────────────────────────────────────────────────────────╯
```

Quando você só escolhe uma atividade existente, o cartão é o **✔ Commit vinculado**, com a
mensagem final e o link.

**O que vai para o Jira:**

| Campo | Valor |
|---|---|
| Título | O que você confirmou no passo 3 |
| Tipo | Subtarefa (descoberto automaticamente) ou o `issueType` |
| Pai | A tarefa escolhida (só para subtarefa) |
| Responsável | Você |
| Descrição | Corpo do commit (linhas depois da primeira) + lista **Arquivos alterados** (`git diff --cached --name-status`) |
| Labels e componentes | Copiados da tarefa pai |
| Sprint | Herdado da tarefa pai pelo próprio Jira |

## 9. Sugestão de título por IA

É **opcional**. Se a variável `ANTHROPIC_API_KEY` (ou `ANTHROPIC_AUTH_TOKEN`) estiver
definida no ambiente, ao criar uma atividade a CLI:

1. lê o diff do que está no stage (até ~8 mil caracteres), a lista de arquivos, o texto
   do commit e o título da tarefa pai;
2. pede um título curto, no infinitivo, em português (ex.: "Criar card de benefício na
   Home");
3. coloca a sugestão no campo de título, **editável**.

Sem a chave, ou se a IA falhar ou demorar mais de 8 segundos, o campo vem com o texto do
commit, como sempre.

```bash
# Git Bash / Linux / macOS (coloque no ~/.bashrc para ficar permanente)
export ANTHROPIC_API_KEY="sk-ant-..."
```

```powershell
# PowerShell (permanente para o seu usuário)
[Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", "sk-ant-...", "User")
```

| Configuração | Efeito |
|---|---|
| `"ai": false` | Desliga a IA naquele repositório, mesmo com a chave definida |
| `"aiModel": "claude-haiku-5-5"` | Troca o modelo. O padrão é `claude-opus-5-5` com esforço baixo. O Haiku responde mais rápido e custa menos |

> **Privacidade:** com a IA ligada, o diff do commit é enviado para a API da Anthropic.
> Siga a política da empresa sobre envio de código para serviços externos.

## 10. Listar suas atividades

Fora do commit, para consultar rapidamente:

```bash
npx jira-commit list                      # status padrão (statuses)
npx jira-commit list --todos              # todas as suas abertas
npx jira-commit list --status TESTANDO    # um status específico
npx jira-commit list --status "em andamento"
```

O `--status` aceita o nome como aparece na tela do Jira e não diferencia maiúsculas de
minúsculas. Se o nome não existir, a CLI mostra os status válidos do projeto.

A saída usa a mesma árvore do menu do commit.

## 11. Quando o hook não aparece (ou não deveria aparecer)

| Situação | Comportamento |
|---|---|
| A mensagem já tem a chave (ex.: digitada no cz ou com `-m "... LOJA-12 ..."`) | Não faz nada |
| `git commit --amend`, merge ou squash | Não faz nada |
| Commit por **cliente gráfico** (botão de commit do VS Code, GitHub Desktop…) | O hook é **pulado**, porque não há terminal para mostrar o menu |
| Jira fora do ar ou sem rede | Mostra um aviso e pede a chave manualmente (vazio = pular) |
| Ctrl+C no menu | **Cancela o commit** (nada é commitado, e o stage fica como estava) |
| Erro ao criar a atividade no Jira | Mostra o erro e **cancela o commit**. Rode o commit de novo |

## 12. Problemas comuns

**`Credenciais do Jira não encontradas. Rode: jira-commit login`**
Rode o `login`. Se você usa variáveis de ambiente, confira se as três estão definidas.

**`Jira respondeu 401`**
O token expirou ou foi revogado, ou o e-mail está errado. Gere um token novo e rode
o `login` de novo.

**`Arquivo .jira-commit.json não encontrado`**
O repositório ainda não foi configurado. Rode o `init` ou faça `git pull` para pegar o
arquivo do time.

**`Status "X" não existe em LOJA. Disponíveis: ...`**
Algum nome em `statuses` (ou no `--status`) está diferente do Jira. Copie o nome
exatamente como aparece na lista do erro.

**O menu não aparece no commit**
- Você commitou pelo botão do editor? Commite pelo terminal ([seção 11](#11-quando-o-hook-não-aparece-ou-não-deveria-aparecer)).
- A mensagem já tinha a chave?
- Rode `npx --no-install jira-commit`. Se der erro, a CLI não está instalada no projeto.
- Confira se a linha `# jira-commit` existe no `prepare-commit-msg`.

**Aparecem poucas atividades / falta uma atividade**
- A lista mostra só as **suas** atividades nos `statuses` configurados. Use
  **⋯ Ver outros status** ou **✎ Digitar a chave**.
- O limite é `maxResults` (padrão 20). Aumente no `.jira-commit.json`.

**O commitlint rejeitou a mensagem depois do jira-commit**
Confira se o `format` é `{prefix}{key} {subject}` ([seção 6](#6-projetos-com-commitizen-e-commitlint)).

**Erro ao criar: tipo de issue inválido**
O `issueType` não existe no projeto. Rode o `init` num repositório de teste para ver os
tipos disponíveis, ou ajuste o campo à mão.

**As cores não aparecem**
O terminal não é interativo, ou a variável `NO_COLOR` está definida. É só visual e não
afeta nada.

## 13. Perguntas frequentes

**Preciso fazer login em cada repositório?**
Não. O login vale para a máquina inteira, e o `init` é que é feito uma vez por repositório.

**O jira-commit muda o status das minhas atividades?**
Só quando você **cria** uma atividade e escolhe o status inicial. As atividades existentes
não mudam.

**Posso usar a CLI sem commitizen?**
Pode. Sem cz, o jira-commit é o único questionário do commit. Em projetos sem commitlint,
o formato padrão `{key}: {message}` gera `LOJA-12: adiciona card`.

**Onde fica a "última tarefa pai usada"?**
Em `~/.config/jira-commit/state.json`, separado por repositório. É só da sua máquina e não
vai para o git.

**Dá para usar em outro projeto do Jira (outro time)?**
Dá. Cada repositório tem o seu `.jira-commit.json` com `projectKey`, `issueType` e
`statuses` próprios.
