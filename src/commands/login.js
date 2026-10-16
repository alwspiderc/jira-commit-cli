import { t } from '../i18n/index.js';
import { getMyself } from '../infra/jira/api.js';
import { deploymentType, useSite } from '../infra/jira/client.js';
import { isSecureUrl, listSites, normalizeUrl, saveSite } from '../infra/storage/credentials.js';
import { c, confirm, header, input, log, password, select, withSpinner } from '../ui/index.js';

const TOKEN_PAGE = 'https://id.atlassian.com/manage-profile/security/api-tokens';

export async function login() {
  header('login', c.dim(t.login.storedLocally));
  const saved = listSites();
  if (saved.length) showSites(saved);

  const url = normalizeUrl(
    await input({
      message: `${t.login.url} ${c.dim(`· ${t.login.urlExample}`)}`,
      validate: (v) => isSecureUrl(v.trim()) || t.login.urlInvalid,
    }),
  );
  const type = await detectType(url);
  const site = type === 'cloud' ? await askCloud(url) : await askServer(url);

  useSite(site);
  const me = await withSpinner(t.login.testing, () => getMyself());

  const others = saved.filter((s) => s.url !== url);
  const makeDefault =
    others.length > 0 &&
    !saved.find((s) => s.url === url)?.isDefault &&
    (await confirm({ message: t.login.makeDefault(c.accent(url)), default: false }));
  saveSite({ ...site, makeDefault });

  console.log();
  log.ok(t.login.connected(c.bold(me.displayName), c.accent(url)));
  if (others.length) log.hint(t.login.otherJiraHint);
  log.hint(t.login.next);
  console.log();
}

async function detectType(url) {
  try {
    return await withSpinner(t.login.detecting, () => deploymentType(url), {
      done: (type) => (type === 'cloud' ? 'Jira Cloud' : 'Jira Server / Data Center'),
    });
  } catch {
    if (/\.atlassian\.net$/.test(new URL(url).hostname)) return 'cloud';
    return select({
      message: t.login.whichJira,
      choices: [
        { name: 'Jira Cloud', value: 'cloud', description: t.login.cloudHelp },
        { name: 'Jira Server / Data Center', value: 'server', description: t.login.serverHelp },
      ],
    });
  }
}

async function askCloud(url) {
  const email = await input({ message: t.login.email });
  log.hint(t.login.tokenPage(TOKEN_PAGE));
  const token = await password({ message: t.login.apiToken, mask: '•' });
  return { url, type: 'cloud', email, token };
}

async function askServer(url) {
  log.hint(t.login.patHint);
  const token = await password({ message: t.login.pat, mask: '•' });
  return { url, type: 'server', token };
}

function showSites(sites) {
  log.hint(t.login.saved);
  for (const s of sites) log.hint(`  ${s.url}${s.isDefault ? c.dim(`  ${t.login.isDefault}`) : ''}`);
  console.log();
}
