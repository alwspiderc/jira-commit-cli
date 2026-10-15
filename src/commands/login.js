import { getMyself } from '../infra/jira/api.js';
import { saveCredentials } from '../infra/storage/credentials.js';
import { c, header, input, log, password, withSpinner } from '../ui/index.js';

const TOKEN_PAGE = 'https://id.atlassian.com/manage-profile/security/api-tokens';

export async function login() {
  header('login', c.dim('As credenciais ficam só nesta máquina, em ~/.config/jira-commit'));

  const baseUrl = await input({
    message: `URL do Jira ${c.dim('· ex.: https://suaempresa.atlassian.net')}`,
    validate: (v) => /^https:\/\/.+/.test(v) || 'Use a URL completa com https://',
  });
  const email = await input({ message: 'E-mail da conta Atlassian' });
  log.hint(`Gere o token em ${TOKEN_PAGE}`);
  const token = await password({ message: 'API token', mask: '•' });

  saveCredentials({ baseUrl: baseUrl.replace(/\/$/, ''), email, token });

  const me = await withSpinner('Testando a conexão…', () => getMyself());
  console.log();
  log.ok(`Conectado como ${c.bold(me.displayName)}`);
  log.hint('Próximo passo, em cada repositório: jira-commit init');
  console.log();
}
