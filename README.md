# jira-commit-cli

Liga cada commit a uma atividade do Jira Cloud. Na hora do `git commit`, mostra as suas
atividades em árvore (tarefas com as subtarefas embaixo) para você escolher, ou cria uma
nova na hora, inclusive como subtarefa, a partir do commit.

```text
◆ jira-commit  ABDP · develop
│ feat(home): adiciona card de benefício

◆ Qual atividade é esse commit? · digite para buscar
  + Criar nova atividade
  ⋯ Ver outros status
  ✎ Digitar a chave
  ¶ Adicionar corpo / BREAKING CHANGE
  ↷ Pular
 ── suas atividades (31) ─────────────────
❯ ABDP-2375  TÁTICO CIDADÃO | Mobile - Benefícios: Criar tela de…  Tarefas pendentes
  ├─ ABDP-2415  TÁTICO CIDADÃO | Mobile: Criar testes E2E com Mae…  Tarefas pendentes
  └─ ABDP-2413  TÁTICO CIDADÃO | Mobile: Exibir os estados de car…  Tarefas pendentes
```

```text
feat(home): adiciona card de benefício   →   feat(home): ABDP-2411 adiciona card de benefício
```

## Início rápido

```bash
npm i -D git+https://github.com/alwspiderc/jira-commit-cli.git   # no repositório
npx --no-install jira-commit login   # uma vez por máquina: URL, e-mail e API token
npx --no-install jira-commit init    # uma vez por repo: .jira-commit.json, hook e npm run commit
npm run commit                       # pelo terminal: tipo, escopo, descrição e atividade do Jira
```

Commite o `.jira-commit.json` gerado: ele é a configuração do time.

> **Uso interno.** O pacote `jira-commit-cli` não é publicado no npm (`"private": true`
> impede publicação por engano). Ele é instalado direto deste repositório privado, então é
> preciso ter acesso a ele no GitHub. O comando é `jira-commit`. Veja mais opções no
> [guia de uso](docs/guia-de-uso.md#3-instalação).
>
> **Sempre use `npx --no-install`.** Existe um pacote público **diferente** chamado
> `jira-commit` no npm. Sem o `--no-install`, se a CLI não estiver instalada no projeto, o
> npx oferece baixar esse outro pacote, que pediria as suas credenciais do Jira.

## Comandos

| Comando | O que faz |
|---|---|
| `jira-commit login` | Salva e testa as credenciais do Jira |
| `jira-commit init` | Configura o repositório (importando tipos e escopos do `.cz-config.js`, se houver), instala o hook `prepare-commit-msg` e cria o `npm run commit` |
| `jira-commit list` | Lista suas atividades nos status padrão |
| `jira-commit list --todos` | Lista todas as suas atividades abertas |
| `jira-commit list --status "NOME"` | Lista só um status |
| `jira-commit hook <arquivo> [origem]` | Chamado pelo git. Não precisa rodar à mão |

## Destaques

- **Questionário do commit enxuto:** tipo, escopo (digite para filtrar) e descrição, com os
  tipos e escopos no `.jira-commit.json`. Corpo e BREAKING CHANGE só quando precisar, e
  `npm run commit` commita sem abrir o editor.
- **Menos espera:** a busca no Jira e a sugestão de descrição por IA rodam enquanto você
  responde, e o menu já começa na atividade do último commit da branch.
- **Busca pelo título:** digite no menu para filtrar as suas atividades na hora e achar
  outras do projeto inteiro, de qualquer responsável, sem precisar saber a chave.
- **Árvore de tarefas e subtarefas**, com o status colorido e a família da branch no topo.
- **Filtro por status** com os nomes como aparecem na tela do Jira (traduzidos).
- **Criação de subtarefa no commit:**
  - lembra a última tarefa pai usada;
  - põe o prefixo do produto no título;
  - preenche a descrição com o corpo do commit e os arquivos alterados;
  - herda labels, componentes e sprint do pai;
  - permite escolher o status inicial.
- **Compatível com commitlint:** a chave entra depois de `tipo(escopo):`, e o commitlint pode
  ler os mesmos tipos e escopos do `.jira-commit.json`. O `init` migra projetos com commitizen.
- **Sugestões por IA** (opcional), a partir do diff do stage: a descrição do commit e o título
  da atividade criada.
- **Não atrapalha:** pula merge, amend, mensagens que já têm a chave e commits por
  cliente gráfico.

## Documentação

| Documento | Para quem |
|---|---|
| [Guia de uso](docs/guia-de-uso.md) | Quem usa no dia a dia: instalação, fluxo do commit, criar subtarefas, IA, problemas comuns, FAQ |
| [Referência de configuração](docs/configuracao.md) | Todos os campos do `.jira-commit.json`, as credenciais, o estado local e as variáveis de ambiente |
| [Arquitetura](docs/arquitetura.md) | Quem mantém a CLI: estrutura, fluxo interno, endpoints do Jira, decisões, testes e limitações |

## Requisitos

Node.js 22 ou mais novo, Git (no Windows, Git Bash ou o terminal do VS Code) e uma conta
Atlassian com um [API token](https://id.atlassian.com/manage-profile/security/api-tokens).
