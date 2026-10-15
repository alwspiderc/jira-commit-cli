import { t } from '../i18n/index.js';
import { getIssue } from '../infra/jira/api.js';
import { BACK, c, input } from '../ui/index.js';

const NOT_FOUND = 404;

export async function manualKey(cfg, keyRegex, { offline = false } = {}) {
  const example = `${cfg.projectKey}-123`;
  let title;
  const key = await input({
    message: `${t.manualKey.message} ${c.dim(`· ${t.manualKey.hint(example)}`)}`,
    validate: async (v) => {
      if (!v) return true;
      const typed = v.toUpperCase();
      if (!keyRegex.test(typed)) return t.manualKey.invalid(example);
      if (offline) return true;
      try {
        title = (await getIssue(typed)).summary;
        return true;
      } catch (err) {
        if (err.status === NOT_FOUND) return t.manualKey.notFound(typed);
        return true; // erro de rede: aceita sem confirmar para não travar o commit
      }
    },
    back: true,
  });
  if (key === BACK) return BACK;
  return key ? { key: key.toUpperCase(), title } : null;
}
