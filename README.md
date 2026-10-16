<h1 align="center">◆ jira-commit</h1>

<p align="center">
  <strong>Cada commit ligado a uma atividade do Jira, sem sair do terminal.</strong><br>
  Escolha a atividade num menu, ou crie uma na hora, direto do <code>git commit</code>.
</p>

<p align="center">
  <img alt="Node 22+" src="https://img.shields.io/badge/node-%E2%89%A5%2022-339933?logo=node.js&logoColor=white">
  <img alt="Jira Cloud e Server" src="https://img.shields.io/badge/jira-Cloud%20%7C%20Server%2FDC-0052CC?logo=jira&logoColor=white">
  <img alt="Português e inglês" src="https://img.shields.io/badge/idiomas-pt%20%7C%20en-8A2BE2">
  <img alt="Testes" src="https://img.shields.io/badge/testes-node%3Atest-brightgreen">
</p>

---

## Como funciona

Você faz o commit como sempre. O `jira-commit` entra no meio, pergunta o que falta e coloca a
chave da atividade na mensagem:

```text
◆ jira-commit   LOJA  ⎇ develop
│ feat(home): adiciona card de benefício  · esc volta ao passo anterior

◆ Qual atividade é esse commit? · digite para buscar
  + Criar nova atividade
  ⋯ Ver outros status
  ✎ Digitar a chave
  ¶ Adicionar corpo / BREAKING CHANGE
  ❝ Comentar na atividade
  ↷ Pular
── suas atividades (31) ─────────────────
❯ LOJA-2375  LOJA DO BAIRRO | Mobile - Benefícios: Criar tela de…   ● Em andamento
  ├─ LOJA-2415  LOJA DO BAIRRO | Mobile: Criar testes E2E com M…   ● Tarefas pendentes
  └─ LOJA-2413  LOJA DO BAIRRO | Mobile: Exibir os estados de c…   ● Tarefas pendentes
```

```text
feat(home): adiciona card de benefício   →   feat(home): LOJA-2411 adiciona card de benefício
```

## Início rápido

```bash
# 1. No repositório (num projeto sem Node, use -g para instalar globalmente)
npm i -D git+https://github.com/alwspiderc/jira-commit-cli.git

# 2. Uma vez por máquina: conecta ao seu Jira (Cloud ou Server)
npx --no-install jira-commit login

# 3. Uma vez por repositório: configuração, Husky, hook e "npm run commit"
npx --no-install jira-commit init

# 4. No dia a dia, pelo terminal
git add .
npm run commit
```

Depois do `init`, **commite** o `.jira-commit.json`, o `package.json`, o lock e a pasta
`.husky`. Um colega que clonar o repositório só precisa de `npm install` e do `login`.

> [!TIP]
> Algo não funcionou? Rode `npx --no-install jira-commit doctor`. Ele confere a instalação
> inteira e diz como corrigir cada problema.

> [!WARNING]
> **Sempre use `npx --no-install`.** Existe um pacote público **diferente** chamado
> `jira-commit` no npm. Sem o `--no-install`, se a CLI não estiver instalada, o npx oferece
> baixar esse outro pacote, que pediria as suas credenciais do Jira.

## O que dá para fazer

| | |
| --- | --- |
| 🌳 **Menu em árvore** | Suas atividades com as subtarefas embaixo, o status colorido e a atividade da branch no topo |
| 🔎 **Busca pelo título** | Digite no menu: filtra as suas na hora e acha outras do projeto inteiro no Jira |
| ➕ **Criar na hora** | Tarefa ou subtarefa, com título, épico, sprint, story points e status inicial |
| ❝ **Comentar** | Pelo menu do commit ou com `jira-commit comment`, sem abrir o Jira |
| 📝 **Questionário do commit** | Tipo, escopo e descrição (Conventional Commits), compatível com commitlint |
| ✨ **Sugestões por IA** | Descrição do commit e título da atividade a partir do diff (opcional) |
| ↩️ **Esc volta** | Em qualquer pergunta, o Esc volta ao passo anterior sem perder o que já foi respondido |
| 🩺 **`doctor`** | Diagnóstico da instalação, com a correção de cada problema |

**Funciona em qualquer projeto:**

- projetos Node (com Husky) ou não (pasta `.githooks`);
- Jira Cloud ou Server/Data Center, e vários Jiras na mesma máquina;
- português ou inglês;
- `.jira-commit.json` validado, com autocomplete no editor.

**Não atrapalha:**

- pula merge, amend e mensagens que já têm a chave;
- pula commits feitos pelo botão do editor;
- `JIRA_COMMIT_SKIP=1` pula o hook quando você quiser;
- sem a CLI instalada, o commit segue com um aviso.

## Comandos

| Comando | O que faz |
| --- | --- |
| `jira-commit login` | Conecta a um Jira e salva o acesso nesta máquina |
| `jira-commit init` | Configura o repositório: `.jira-commit.json`, Husky, hook e `npm run commit` |
| `jira-commit doctor` | Confere tudo e diz o que corrigir |
| `jira-commit list` | Suas atividades nos status padrão (`--todos` para todas, `--status "NOME"` para um) |
| `jira-commit comment [CHAVE] ["texto"]` | Comenta numa atividade. O que faltar, ele pergunta |
| `jira-commit hook <arquivo> [origem]` | Chamado pelo git. Não precisa rodar à mão |

## Documentação

| | Para quem | O que tem |
| --- | --- | --- |
| 📘 [**Guia de uso**](docs/guia-de-uso.md) | Quem usa no dia a dia | Instalação, o commit passo a passo, criar e comentar atividades, IA, problemas comuns e perguntas frequentes |
| ⚙️ [**Configuração**](docs/configuracao.md) | Quem configura um repositório | Todos os campos do `.jira-commit.json`, credenciais, variáveis de ambiente e o hook |
| 🏗️ [**Arquitetura**](docs/arquitetura.md) | Quem mantém a CLI | Camadas, fluxos, Jira Cloud × Server, decisões, testes e como contribuir |

## Requisitos

- **Node.js 22** ou mais novo.
- **Git.** No Windows funciona no Git Bash, no PowerShell e no terminal do VS Code.
- **Um Jira Cloud ou Server/Data Center (8.4+)** com acesso ao projeto, e um token:
  - **Cloud:** API token, gerado em [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens).
  - **Server/Data Center:** token pessoal (PAT), criado no seu perfil do Jira.

> [!NOTE]
> **Uso interno.** O pacote não é publicado no npm (`"private": true` impede publicação por
> engano). Ele é instalado direto deste repositório, então é preciso ter acesso a ele no GitHub.
