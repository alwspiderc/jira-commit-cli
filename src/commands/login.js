import { getMyself } from '../infra/jira/api.js';
import { useSite } from '../infra/jira/client.js';
import { listSites, normalizeUrl, saveSite } from '../infra/storage/credentials.js';
import { c, confirm, header, input, log, password, withSpinner } from '../ui/index.js';

const TOKEN_PAGE = 'https://id.atlassian.com/manage-profile/security/api-tokens';

export async function login() {
  header('login', c.dim('As credenciais ficam só nesta máquina, em ~/.config/jira-commit'));
  const saved = listSites();
  if (saved.length) showSites(saved);

  const url = normalizeUrl(
    await input({
      message: `URL do Jira ${c.dim('· ex.: https://suaempresa.atlassian.net')}`,
      validate: (v) => /^https?:\/\/.+/.test(v.trim()) || 'Use a URL completa, com https://',
    }),
  );
  const email = await input({ message: 'E-mail da conta Atlassian' });
  log.hint(`Gere o token em ${TOKEN_PAGE}`);
  const token = await password({ message: 'API token', mask: '•' });
  const site = { url, type: 'cloud', email, token };

  useSite(site);
  const me = await withSpinner('Testando a conexão…', () => getMyself());

  const others = saved.filter((s) => s.url !== url);
  const makeDefault =
    others.length > 0 &&
    !saved.find((s) => s.url === url)?.isDefault &&
    (await confirm({ message: `Usar ${c.accent(url)} como Jira padrão?`, default: false }));
  saveSite({ ...site, makeDefault });

  console.log();
  log.ok(`Conectado como ${c.bold(me.displayName)} em ${c.accent(url)}`);
  if (others.length) log.hint(`Num repositório de outro Jira, defina "jiraUrl" no .jira-commit.json (o init faz isso).`);
  log.hint('Próximo passo, em cada repositório: jira-commit init');
  console.log();
}

function showSites(sites) {
  log.hint('Jiras já salvos (faça login de novo num deles para trocar o token):');
  for (const s of sites) log.hint(`  ${s.url}${s.isDefault ? c.dim('  · padrão') : ''}`);
  console.log();
}
