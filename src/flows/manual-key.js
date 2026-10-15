import { getIssue } from '../infra/jira/api.js';
import { c, input } from '../ui/index.js';

const NOT_FOUND = 404;

export async function manualKey(cfg, keyRegex, { offline = false } = {}) {
  let title;
  const key = await input({
    message: `Chave da atividade ${c.dim(`· ex.: ${cfg.projectKey}-123, vazio para pular`)}`,
    validate: async (v) => {
      if (!v) return true;
      const typed = v.toUpperCase();
      if (!keyRegex.test(typed)) return `Formato inválido, use ${cfg.projectKey}-123`;
      if (offline) return true;
      try {
        title = (await getIssue(typed)).summary;
        return true;
      } catch (err) {
        if (err.status === NOT_FOUND) return `${typed} não existe no Jira`;
        return true; // erro de rede: aceita sem confirmar para não travar o commit
      }
    },
  });
  return key ? { key: key.toUpperCase(), title } : null;
}
