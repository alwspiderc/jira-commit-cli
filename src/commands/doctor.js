import { t } from '../i18n/index.js';
import { diagnose } from '../services/doctor.js';
import { repoRoot } from '../infra/git.js';
import { applyProjectLanguage } from '../services/project.js';
import { badge, c, header, icon } from '../ui/index.js';

const ICONS = { ok: icon.ok, warn: icon.warn, fail: icon.err, info: icon.info, skip: c.dim('–') };
const DETAIL = { ok: (s) => s, warn: c.warn, fail: c.err, info: c.info, skip: c.dim };

// Sem openProject: um .jira-commit.json inválido é justamente o que o doctor mostra
export async function doctor() {
  // Fora de um repositório o doctor ainda roda: é ele que aponta o problema
  const root = await repoRoot().catch(() => null);
  if (root) applyProjectLanguage(root);
  header('doctor', c.dim(t.doctor.subtitle));
  const results = await diagnose();
  const width = Math.max(...results.map((r) => r.name.length)) + 2;

  for (const { name, status, detail, fix } of results) {
    console.log(`${ICONS[status]} ${c.bold(name.padEnd(width))}${DETAIL[status](status === 'skip' ? t.doctor.skipped : detail)}`);
    if (fix) console.log(`${' '.repeat(width + 2)}${c.brand('→')} ${c.accent(fix)}`);
  }

  const failures = results.filter((r) => r.status === 'fail').length;
  const warnings = results.filter((r) => r.status === 'warn').length;
  console.log();
  if (failures) console.log(badge(`✖ ${t.doctor.failures(failures)}`, 'err') + (warnings ? c.warn(t.doctor.andWarnings(warnings)) : ''));
  else if (warnings) console.log(badge(`▲ ${t.doctor.onlyWarnings(warnings)}`, 'warn'));
  else console.log(badge(`✔ ${t.doctor.allGood}`, 'ok'));
  console.log();
  if (failures) process.exitCode = 1;
}
