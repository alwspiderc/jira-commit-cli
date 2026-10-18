# ◆ jira-commit para o VS Code

Cada commit ligado a uma atividade do Jira, direto do painel **Source Control**.

> [!NOTE]
> Em desenvolvimento. Esta versão só tem o primeiro comando: **pôr a chave da atividade da branch
> na mensagem do commit**. O menu de atividades, o login e a criação de atividades vêm nas
> próximas versões.

## Como usar

1. O repositório precisa estar configurado pela CLI (`npx --no-install jira-commit init`): a
   extensão usa o mesmo `.jira-commit.json`.
2. Numa branch com a chave no nome (ex.: `feature/KAN-7-tema`), clique no botão **🔗** no topo do
   painel Source Control, ou rode **Jira Commit: Pôr a chave da atividade da branch na mensagem do
   commit** na paleta de comandos.
3. A chave entra na mensagem seguindo o `format` do repositório:
   `feat(home): adiciona card` → `feat(home): KAN-7 adiciona card`.

## Desenvolvimento

```bash
cd vscode
npm install
npm test          # gera o bundle e roda os testes
npm run package   # gera o .vsix
```

Para depurar, abra a pasta `jira-commit-cli` no VS Code e aperte **F5** (*Rodar a extensão*).
