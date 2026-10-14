import { input, password } from '@inquirer/prompts';
import { saveCredentials } from '../config.js';
import { getMyself } from '../jira.js';

export async function login() {
  const baseUrl = await input({
    message: 'URL do Jira (ex.: https://suaempresa.atlassian.net):',
    validate: (v) => /^https:\/\/.+/.test(v) || 'Use a URL completa com https://',
  });
  const email = await input({ message: 'E-mail da conta Atlassian:' });
  const token = await password({
    message: 'API token (id.atlassian.com/manage-profile/security/api-tokens):',
    mask: '*',
  });

  saveCredentials({ baseUrl: baseUrl.replace(/\/$/, ''), email, token });

  // Testa na hora pra não descobrir o erro só no primeiro commit
  const me = await getMyself();
  console.log(`✔ Conectado como ${me.displayName}`);
}
