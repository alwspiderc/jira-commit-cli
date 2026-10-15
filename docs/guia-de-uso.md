# Guia de uso

Este guia é para quem vai usar o `jira-commit` no dia a dia. Para a lista completa de
opções do `.jira-commit.json`, veja [configuracao.md](configuracao.md).

- [1. O que a CLI faz](#1-o-que-a-cli-faz)
- [2. Pré-requisitos](#2-pré-requisitos)
- [3. Instalação](#3-instalação)
- [4. Login (uma vez por máquina)](#4-login-uma-vez-por-máquina)
- [5. Configurar o repositório (uma vez por repo)](#5-configurar-o-repositório-uma-vez-por-repo)
- [6. Questionário do commit (tipo, escopo e descrição)](#6-questionário-do-commit-tipo-escopo-e-descrição)
- [7. O dia a dia: commitando](#7-o-dia-a-dia-commitando)
- [8. Criar atividade a partir do commit](#8-criar-atividade-a-partir-do-commit)
- [9. Sugestão de título por IA](#9-sugestão-de-título-por-ia)
- [10. Fora do commit: listar e comentar](#10-fora-do-commit-listar-e-comentar)
- [11. Quando o hook não aparece (ou não deveria aparecer)](#11-quando-o-hook-não-aparece-ou-não-deveria-aparecer)
- [12. Problemas comuns](#12-problemas-comuns)
- [13. Perguntas frequentes](#13-perguntas-frequentes)

---

## 1. O que a CLI faz

Na hora do `git commit`, o `jira-commit` faz duas coisas:

1. **Monta a mensagem**, se ela ainda não existe: pergunta tipo, escopo e descrição, com os
   tipos e escopos do projeto ([seção 6](#6-questionário-do-commit-tipo-escopo-e-descrição)).
2. **Liga o commit a uma atividade do Jira**: mostra as suas atividades num menu e coloca a
   chave escolhida na mensagem.

```text
feat(home): adiciona card de benefício
        ↓
feat(home): LOJA-2411 adiciona card de benefício
```

Se a atividade ainda não existe, dá para **criar na hora**, inclusive como **subtarefa**
de uma tarefa existente. Ela já sai com título, descrição, responsável e status.

O hook só mexe na mensagem do commit. Ele não faz push, não muda o status de atividades
existentes e não comenta no Jira.

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
- **CI:** com `-D`, o pacote entra no `package.json`, e o `npm ci` do CI também precisa de
  acesso ao repositório privado (ex.: um token no GitHub Actions). Sem isso, o build quebra.
  Se o CI não tiver acesso, cada pessoa instala com `--no-save` (abaixo), sem mexer no
  `package.json`.

> **Sempre use `npx --no-install jira-commit`.** Existe um pacote público **diferente**
> chamado `jira-commit` no npm. Sem o `--no-install`, se a CLI não estiver instalada no
> projeto, o npx oferece baixar esse outro pacote, que pediria as suas credenciais do Jira.

**Sem mexer no `package.json`** (cópia local, ou do git, só na sua máquina):

```bash
npm i --no-save ../caminho/para/jira-commit-cli                    # pasta local
npm i --no-save git+https://github.com/alwspiderc/jira-commit-cli.git   # do git
```

O `--no-save` não mexe no `package.json` nem no lock, mas o próximo `npm install` remove o
pacote, e aí o commit falha até você instalar de novo. Com a pasta local, o pacote é um link,
então qualquer mudança no código da CLI vale na hora.

Confira se o binário ficou disponível:

```bash
npx --no-install jira-commit
```

Deve aparecer a ajuda com os comandos `login`, `init` e `list`.

## 4. Login (uma vez por máquina)

```bash
npx --no-install jira-commit login
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
npx --no-install jira-commit init
```

O `init` pode ser rodado de novo sem problema: ele só pergunta o que ainda falta.

**a) Cria o `.jira-commit.json`** (se ainda não existir), perguntando:

| Pergunta | O que responder |
|---|---|
| Chave do projeto | O prefixo das atividades. Ex.: `LOJA` para `LOJA-2410` |
| Tipo das tarefas criadas (sem pai) | Escolha na lista, que vem do seu Jira. Ex.: `Mobile` |
| Prefixo do título | Padrão `{product} \| <Tipo>: `. Veja a [seção 8](#prefixo-do-título) |
| Formato da mensagem | Em projetos com commitlint, aceite `{prefix}{key} {subject}` |

**Commite o `.jira-commit.json`.** Ele é a configuração do time para aquele repositório.

**b) Configura o questionário do commit** (a seção `commit` do `.jira-commit.json`):
- se o projeto tem um **`.cz-config.js`**, oferece importar os tipos, os escopos e o
  limite de caracteres dele;
- senão, oferece os tipos padrão da CLI (os do Conventional Commits mais `patch`, `wip` e
  `merge`), sem escopos.

Se você recusar, o `init` grava `"commit": false` e não pergunta de novo. Detalhes na
[seção 6](#6-questionário-do-commit-tipo-escopo-e-descrição).

**c) Instala o hook** `prepare-commit-msg`:
- se o projeto usa **Husky** (tem a pasta `.husky/`), a linha é adicionada em
  `.husky/prepare-commit-msg`;
- senão, vai para `.git/hooks/prepare-commit-msg`;
- se já existir um hook, a linha do jira-commit é **acrescentada no final**, sem apagar
  nada. Rodar o `init` de novo não duplica a linha;
- se o hook tiver o **commitizen** (`npx cz --hook` ou `git cz --hook`) e o questionário
  estiver ligado, oferece tirar o cz, para as perguntas não aparecerem duas vezes.

**d) Cria o script `npm run commit`** (`git commit --no-edit`), que faz as perguntas e
commita sem abrir o editor do git no fim. Se já existir um script `commit` (ex.: `git-cz`),
pergunta antes de trocar.

## 6. Questionário do commit (tipo, escopo e descrição)

Com a seção `commit` no `.jira-commit.json`, um commit sem mensagem (`npm run commit` ou
`git commit` sem `-m`) começa por três perguntas:

```text
◆ jira-commit  LOJA · develop
│ (mensagem vazia)

◆ Tipo · digite para filtrar fe
❯ feat      Uma nova funcionalidade
◆ Escopo · digite para filtrar sign
❯ sign-in
  sign-up
◆ Descrição · feat(sign-up): …
cria a tela de confirmação de e-mail
```

- **Tipo e escopo:** digite parte do nome para filtrar (sem se preocupar com acento ou
  maiúscula) e aperte Enter. As setas também funcionam. O escopo tem a opção
  "— sem escopo" no fim da lista e só aparece se o projeto tiver escopos.
- **Descrição:** o que vem depois de `tipo(escopo):`. O limite de tamanho já desconta o
  espaço da chave do Jira, então o commitlint não reclama depois. Com IA ligada, ela já
  vem preenchida ([seção 9](#9-sugestão-de-título-por-ia)).
- **Corpo e BREAKING CHANGE** não são perguntados em todo commit. Quando precisar, use a
  ação **¶ Adicionar corpo / BREAKING CHANGE** no menu de atividades
  ([seção 7](#7-o-dia-a-dia-commitando)).

Depois disso vem o menu de atividades, e a chave entra no lugar certo:

```text
feat(sign-up): LOJA-2410 cria a tela de confirmação de e-mail
```

**Sem editor no fim:** com `git commit`, o git abre o editor depois das perguntas, para
você revisar a mensagem. Com `npm run commit`, o commit sai direto.

**Com `-m`:** `git commit -m "feat(home): ..."` pula as perguntas e vai direto ao menu de
atividades.

### Commitlint com a mesma lista

Para os tipos e escopos ficarem num lugar só, faça o `commitlint.config.cjs` ler o
`.jira-commit.json`:

```js
// Tipos e escopos vêm do .jira-commit.json: a mesma lista que o jira-commit mostra no commit
const { commit } = require('./.jira-commit.json');

module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', commit.types.map((t) => t.value ?? t)],
    'scope-enum': [2, 'always', commit.scopes],
    'header-max-length': [2, 'always', commit.headerMaxLength],
    'subject-case': [0], // a descrição começa com a chave em maiúsculas (LOJA-12 …)
  },
};
```

> O `subject-case` precisa ficar desligado: com `"format": "{prefix}{key} {subject}"` a
> descrição começa com `LOJA-12`, e a regra padrão do config-conventional rejeita isso.

### Vindo do commitizen

O `init` faz a migração: importa os tipos e escopos do `.cz-config.js`, tira o
`cz --hook` do hook e troca o script `commit`. Depois de conferir que está tudo certo, dá
para apagar o `.cz-config.js`, o bloco `config.commitizen` do `package.json` e os pacotes
(`npm uninstall commitizen cz-customizable`).

> Com `"format": "{key}: {message}"` a mensagem ficaria `LOJA-2410: feat(home): ...` e o
> **commitlint rejeitaria**, porque o tipo precisa ser a primeira coisa. Em projetos com
> commitlint, use `{prefix}{key} {subject}`.

## 7. O dia a dia: commitando

Faça o commit normalmente, **pelo terminal**:

```bash
git add .
npm run commit        # com o questionário: commita sem abrir o editor no fim
# ou: git commit, ou git commit -m "feat(home): ..."
```

O menu tem duas partes: **ações** no topo e **atividades** em árvore embaixo.

```text
◆ jira-commit  LOJA · develop
│ feat(home): adiciona card de benefício

◆ Qual atividade é esse commit? · digite para buscar
  + Criar nova atividade
  ⋯ Ver outros status
  ✎ Digitar a chave
  ¶ Adicionar corpo / BREAKING CHANGE
  ❝ Comentar na atividade
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
para o começo. O cursor começa numa **atividade**, nunca numa ação, então um Enter
sem querer não cria nada.

**Buscar pelo título:** digite direto no menu. O que você digita procura em dois lugares:

```text
◆ Qual atividade é esse commit? · digite para buscar login
 ── suas atividades (1) ─────────────────
❯ LOJA-2371  LOJA DO BAIRRO | Mobile - Tela de Login: Revisar fluxo…  Em andamento
 ── outras no projeto (6) ───────────────
  LOJA-1801  Mobile - Login | Criar fluxo de Login, incluindo trata…  Tarefas pendentes
  ...
 ── ações ───────────────────────────────
  + Criar nova atividade
  ...
```

- **Suas atividades:** as da lista são filtradas na hora, a cada tecla. Vale qualquer parte
  do título ou da chave, sem ligar para acento ou maiúscula. Várias palavras precisam
  aparecer todas (`card benef` acha "Criar o componente de card de benefício").
- **Outras no projeto:** quando você para de digitar, a CLI também busca no Jira, no projeto
  inteiro, as atividades **abertas** com essas palavras no título, de qualquer responsável e
  em qualquer status. Elas aparecem embaixo quando a busca termina ("buscando no projeto…"
  enquanto isso). Um número sozinho (`2375`) ou a chave (`LOJA-2375`) acha a atividade
  direto, mesmo concluída.
  Pontuação separa palavras: `README.md` procura "README" e "md", e `jira-commit-cli`
  procura "jira", "commit" e "cli". Se o Jira não responder, aparece "não consegui buscar no
  projeto", e as suas atividades continuam filtradas normalmente.
- As **ações** ficam no fim da lista. Sem resultado, o cursor cai em **+ Criar nova
  atividade**. Para voltar ao menu completo, apague o que digitou.

> Na busca do projeto, o Jira **considera os acentos**: `benef` e `benefício` acham,
> `beneficio` não. Na dúvida, digite só o começo da palavra.

**Quais atividades aparecem:** por padrão, só as **suas** (`assignee = você`) nos status
configurados em `statuses`, por exemplo Em andamento, PARA CORRIGIR e Tarefas pendentes.
Para ver as outras, escolha **⋯ Ver outros status**, e para voltar, **← Voltar aos
status padrão**.

**Branch com chave:** se a branch tiver uma chave no nome (ex.:
`feature/LOJA-2410-header`), a família daquela atividade vai para o topo e o cursor
começa nela.

**Última atividade usada:** sem chave na branch, o cursor começa na atividade do último
commit **nesta branch** (marcada com ★ última usada embaixo da lista), já que commits
seguidos costumam ser da mesma atividade. Se ela saiu da lista (mudou de status, por
exemplo), aparece no topo das atividades. Sem histórico, o cursor começa na primeira.

**Ações:**

| Ação | O que acontece |
|---|---|
| + Criar nova atividade | Cria no Jira e já vincula ao commit ([seção 8](#8-criar-atividade-a-partir-do-commit)) |
| ⋯ Ver outros status | Mostra todas as suas atividades abertas |
| ✎ Digitar a chave | Para uma atividade que não é sua ou não aparece na lista. A CLI confere se a chave existe no Jira |
| ¶ Adicionar corpo / BREAKING CHANGE | Pergunta o corpo do commit (use `\|` para quebrar linha) e o BREAKING CHANGE, os dois opcionais, e volta para o menu. Depois de preenchido, vira "¶ Editar…" |
| ❝ Comentar na atividade | Pergunta um comentário (use `\|` para quebrar parágrafo) e volta para o menu. Ele é publicado na atividade que você escolher, digitar ou criar em seguida. Se falhar, só avisa: o commit segue. Depois de preenchido, vira "❝ Editar comentário…" |
| ↷ Pular | Commita sem chave (o commitlint/cz do projeto pode reclamar) |

**Voltar com Esc:** em qualquer pergunta, **Esc** volta ao passo anterior, e o que você já
respondeu continua preenchido. No menu de atividades, o Esc volta para a descrição do commit
(ou, em "todos os status", para os status padrão). Durante a criação de uma atividade, o Esc
volta uma pergunta por vez (confirmação → story points → título → épico ou pai → tipo) até o menu. Responder "não" na
confirmação também volta para o menu. Depois que a atividade é criada no Jira não há volta: o
status inicial já é sobre a atividade criada.

## 8. Criar atividade a partir do commit

Escolha **+ Criar nova atividade**.

**1. Tipo**

```text
◆ Que tipo de atividade?
❯ ↳ Subtarefa
  ▣ Mobile
  Fica embaixo de uma tarefa existente e herda sprint, labels e componentes
```

**2. Tarefa pai** (subtarefa) **ou épico** (tarefa)

```text
◆ Subtarefa de qual tarefa?
  ✎ Digitar a chave da tarefa pai
 ── tarefas (12) ─────────────────────────
❯ LOJA-2375  LOJA DO BAIRRO | Mobile - Benefícios: ...  ★ última usada
  LOJA-2373  LOJA DO BAIRRO | Mobile - Tela Inicial: ...
```

A **última tarefa pai usada neste repositório** já vem selecionada. Isso ajuda quando você
cria várias subtarefas seguidas da mesma tarefa.

Para uma tarefa, a pergunta é o **épico** (o "Pai" no Jira web), com busca por digitação:

```text
◆ Épico da tarefa · digite para buscar
  — sem épico
 ── épicos abertos (59) ─────────────────
  LOJA-2392  PERMISSÃO
❯ LOJA-232   MOBILE  ★ mais usado
  ...
```

A sugestão é o **último épico usado neste repositório**. Na primeira vez, é o épico que mais
aparece nas suas atividades. "— sem épico" também fica lembrado. Se o projeto não tiver
épicos abertos, a pergunta não aparece.

**3. Título**

O campo já vem **preenchido e editável**: prefixo + texto do commit (ou a sugestão da IA,
[seção 9](#9-sugestão-de-título-por-ia)). Ajuste o que quiser e confirme com Enter.

```text
◆ Título · sugerido pela IA
LOJA DO BAIRRO | Mobile: Criar card de benefício na Home▌
```

O nome da atividade sempre começa com **maiúscula** depois do prefixo, mesmo que o commit
venha em minúscula ou que você edite em minúscula: `atualiza link` vira
"LOJA DO BAIRRO | Mobile: Atualiza link".

<a id="prefixo-do-título"></a>
**Prefixo do título.** Vem do `summaryPrefix`. O `{product}` é substituído pelo trecho do
título da tarefa pai **antes do ` | `**:

| Tarefa pai | `summaryPrefix` | Prefixo gerado |
|---|---|---|
| `LOJA DO BAIRRO \| Mobile - Benefícios: Criar…` | `{product} \| Mobile: ` | `LOJA DO BAIRRO \| Mobile: ` |
| `Mobile - Login \| Criar fluxo…` | `{product} \| Mobile: ` | `Mobile - Login \| Mobile: ` |
| `Criar fluxo de login` (sem ` \| `) | `{product} \| Mobile: ` | *(sem prefixo)* |

Para uma **tarefa sem pai**, o `{product}` é o produto que mais aparece nas suas atividades.

**4. Story points** (opcional)

```text
◆ Story points · opcional
❯ — sem estimativa
  1
  2
  3
  ...
```

Vai para o campo de estimativa do Jira ("Story point estimate" ou "Story Points"). Enter
direto deixa sem estimativa. A pergunta só aparece se o tipo de atividade tiver o campo na
tela de criação, e some com `"storyPoints": false` no `.jira-commit.json`.

**5. Confirmação**

```text
◆ Criar Mobile em LOJA no épico LOJA-232 na quadro Sprint 62? (Y/n)
✔ LOJA-2423 criada no Jira
✔ LOJA-2423 na quadro Sprint 62
```

Uma **tarefa sem pai** entra sozinha na **sprint ativa** do quadro do projeto, para aparecer
no quadro como as criadas pelo Jira web. Uma subtarefa segue a sprint da tarefa pai. Se o
projeto não tiver sprint ativa (ex.: quadro Kanban), ou se não der para mover, a tarefa fica
no backlog e o commit segue.

**6. Status inicial**

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

**7. Resumo**

No fim aparece um cartão com o que aconteceu e o link para abrir a atividade no Jira:

```text
╭─ ✔ Atividade criada e vinculada ───────────────────────────────────╮
│ LOJA-2423  LOJA DO BAIRRO | Mobile: Criar card de benefício na Home │
│ nova subtarefa de LOJA-2375  ·  3 pts  ·  status Em andamento       │
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
| Descrição | Corpo do commit (linhas depois da primeira e o que foi preenchido em **¶ Adicionar corpo / BREAKING CHANGE**) + lista **Arquivos alterados** (`git diff --cached --name-status`) |
| Labels e componentes | Copiados da tarefa pai |
| Sprint | Tarefa: a sprint ativa do quadro do projeto (sem sprint ativa, fica no backlog). Subtarefa: a da tarefa pai, pelo próprio Jira |
| Story points | O que você escolheu no passo 4 (ou vazio) |
| Épico (pai da tarefa) | O que você escolheu no passo 2 (ou nenhum). Subtarefa não tem épico: o pai dela é a tarefa |

## 9. Sugestão de título por IA

É **opcional**. Se a variável `ANTHROPIC_API_KEY` (ou `ANTHROPIC_AUTH_TOKEN`) estiver
definida no ambiente, a IA ajuda em dois lugares.

**Descrição do commit** ([seção 6](#6-questionário-do-commit-tipo-escopo-e-descrição)): o
pedido sai assim que o commit começa, enquanto você escolhe tipo e escopo. A CLI manda o diff
do stage, a lista de arquivos e as ~10 últimas descrições do repositório, para a sugestão
seguir o estilo do time. A descrição chega preenchida e **editável**.

**Título da atividade**, ao criar uma pela CLI:

1. lê o diff do que está no stage (até ~8 mil caracteres), a lista de arquivos, o texto
   do commit e o título da tarefa pai;
2. pede um título curto, no infinitivo, em português (ex.: "Criar card de benefício na
   Home");
3. coloca a sugestão no campo de título, **editável**.

Sem a chave, ou se a IA falhar ou demorar mais de 8 segundos, o título vem com o texto do
commit e a descrição vem vazia, como sempre.

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

## 10. Fora do commit: listar e comentar

### Listar suas atividades

Para consultar rapidamente:

```bash
npx --no-install jira-commit list                      # status padrão (statuses)
npx --no-install jira-commit list --todos              # todas as suas abertas
npx --no-install jira-commit list --status TESTANDO    # um status específico
npx --no-install jira-commit list --status "em andamento"
```

O `--status` aceita o nome como aparece na tela do Jira e não diferencia maiúsculas de
minúsculas. Se o nome não existir, a CLI mostra os status válidos do projeto.

A saída usa a mesma árvore do menu do commit.

### Comentar numa atividade

```bash
npx --no-install jira-commit comment                                  # escolhe a atividade e escreve
npx --no-install jira-commit comment LOJA-2410                        # só pergunta o texto
npx --no-install jira-commit comment 2410 "subi o ajuste em develop"  # direto, sem perguntas
```

- **Sem chave:** abre a lista das suas atividades, com a mesma busca do menu do commit (digite
  para filtrar, e o Jira completa com as outras do projeto). O cursor começa na atividade da
  branch ou na última usada nela.
- **Chave:** aceita `LOJA-2410` ou só o número, `2410`.
- **Texto:** sem ele, a CLI pergunta. Use `|` para quebrar parágrafo, como no corpo do commit.
- **Esc** volta da pergunta do texto para a lista; na lista, cancela.

Para comentar junto com um commit, use a ação **❝ Comentar na atividade** do menu
([seção 7](#7-o-dia-a-dia-commitando)).

## 11. Quando o hook não aparece (ou não deveria aparecer)

| Situação | Comportamento |
|---|---|
| A mensagem já tem a chave (ex.: digitada no cz ou com `-m "... LOJA-12 ..."`) | Não faz nada |
| `git commit --amend`, merge ou squash | Não faz nada |
| Commit por **cliente gráfico** (botão de commit do VS Code, GitHub Desktop…) | O hook é **pulado**, porque não há terminal para mostrar o menu |
| Jira fora do ar ou sem rede | Mostra um aviso e pede a chave manualmente (vazio = pular) |
| Ctrl+C no menu | **Cancela o commit** (nada é commitado, e o stage fica como estava) |
| Erro ao criar a atividade no Jira | Mostra o erro e **cancela o commit**. Rode o commit de novo |
| CLI não instalada no projeto (ex.: depois de um `npm install` com a instalação `--no-save`) | **O commit falha** com `npx canceled due to missing packages`. Instale a CLI de novo ([seção 3](#3-instalação)) |

## 12. Problemas comuns

**`npx canceled due to missing packages` ao commitar**
O hook chama a CLI, mas ela não está instalada no projeto. Instale de novo
([seção 3](#3-instalação)). Isso acontece depois de um `npm install` quando a CLI foi
instalada com `--no-save`.

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
Confira se o `format` é `{prefix}{key} {subject}` ([seção 6](#6-questionário-do-commit-tipo-escopo-e-descrição)).

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
Pode, e é o recomendado: com a seção `commit` no `.jira-commit.json`, o jira-commit faz as
perguntas de tipo, escopo e descrição ([seção 6](#6-questionário-do-commit-tipo-escopo-e-descrição)).
Sem essa seção, num `git commit` sem `-m` ele pede a mensagem inteira numa pergunta só (com
`{prefix}` no `format`, exige `tipo(escopo): descrição`). Em projetos sem commitlint, o formato padrão
`{key}: {message}` gera `LOJA-12: adiciona card`.

**Como adiciono um tipo ou escopo?**
Edite a seção `commit` do `.jira-commit.json` (`types` ou `scopes`) e commite o arquivo. Se o
`commitlint.config.cjs` lê o mesmo arquivo ([seção 6](#commitlint-com-a-mesma-lista)), ele
aceita o novo valor na hora.

**Onde ficam a "última tarefa pai" e a "última atividade usada"?**
Em `~/.config/jira-commit/state.json`, separadas por repositório (e a última atividade, por
branch). É só da sua máquina e não vai para o git.

**Dá para usar em outro projeto do Jira (outro time)?**
Dá. Cada repositório tem o seu `.jira-commit.json` com `projectKey`, `issueType` e
`statuses` próprios.
