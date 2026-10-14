# jira-commit-cli

Liga cada commit a uma atividade do Jira Cloud. Na hora do `git commit`, mostra as suas
atividades em árvore (tarefas com as subtarefas embaixo) para você escolher, ou cria uma
nova na hora, inclusive como subtarefa, a partir do commit.

```text
? Qual atividade do Jira é esse commit?
  ＋ Criar nova atividade a partir deste commit
  ⋯ Ver tasks de outros status
  ✎ Digitar a chave manualmente
  ↷ Pular (commit sem tag)

❯ LOJA-2375  LOJA DO BAIRRO | Mobile - Benefícios: Criar tela de…  Tarefas pendentes
  ├─ LOJA-2415  LOJA DO BAIRRO | Mobile: Criar testes E2E com Mae…  Tarefas pendentes
  └─ LOJA-2413  LOJA DO BAIRRO | Mobile: Exibir os estados de car…  Tarefas pendentes
```

```text
feat(home): adiciona card de benefício   →   feat(home): LOJA-2411 adiciona card de benefício
```

## Início rápido

```bash
npm i -D git+https://github.com/alwspiderc/jira-commit-cli.git   # no repositório
npx jira-commit login     # uma vez por máquina: URL, e-mail e API token
npx jira-commit init      # uma vez por repo: cria .jira-commit.json e instala o hook
git commit                # pelo terminal, e o menu aparece
```

Commite o `.jira-commit.json` gerado: ele é a configuração do time.

> **Uso interno.** O pacote `jira-commit-cli` não é publicado no npm (`"private": true`
> impede publicação por engano). Ele é instalado direto deste repositório privado, então é
> preciso ter acesso a ele no GitHub. O comando é `jira-commit`. Veja mais opções no
> [guia de uso](docs/guia-de-uso.md#3-instalação).

## Comandos

| Comando | O que faz |
|---|---|
| `jira-commit login` | Salva e testa as credenciais do Jira |
| `jira-commit init` | Configura o repositório e instala o hook `prepare-commit-msg` |
| `jira-commit list` | Lista suas atividades nos status padrão |
| `jira-commit list --todos` | Lista todas as suas atividades abertas |
| `jira-commit list --status "NOME"` | Lista só um status |
| `jira-commit hook <arquivo> [origem]` | Chamado pelo git. Não precisa rodar à mão |

## Destaques

- **Árvore de tarefas e subtarefas**, com o status colorido e a família da branch no topo.
- **Filtro por status** com os nomes como aparecem na tela do Jira (traduzidos).
- **Criação de subtarefa no commit:**
  - lembra a última tarefa pai usada;
  - põe o prefixo do produto no título;
  - preenche a descrição com o corpo do commit e os arquivos alterados;
  - herda labels, componentes e sprint do pai;
  - permite escolher o status inicial.
- **Compatível com commitizen e commitlint:** a chave entra depois de `tipo(escopo):`.
- **Sugestão de título por IA** (opcional), a partir do diff do stage.
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
