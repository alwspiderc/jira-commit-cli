import { t } from '../i18n/index.js';
import { diagnose } from '../services/doctor.js';
import { applyProjectLanguage } from '../services/project.js';
import { c, header, icon } from '../ui/index.js';

const ICONS = { ok: icon.ok, warn: icon.warn, fail: icon.err, info: icon.info, skip: c.dim('–') };

// Sem openProject: um .jira-commit.json inválido é justamente o que o doctor mostra
export async function doctor() {
  applyProjectLanguage();
  header('doctor', c.dim(t.doctor.subtitle));
  const results = await diagnose();
  const width = Math.max(...results.map((r) => r.name.length)) + 2;

  for (const { name, status, detail, fix } of results) {
    console.log(`${ICONS[status]} ${name.padEnd(width)}${status === 'skip' ? c.dim(t.doctor.skipped) : detail}`);
    if (fix) console.log(c.dim(`${' '.repeat(width + 2)}→ ${fix}`));
  }

  const failures = results.filter((r) => r.status === 'fail').length;
  const warnings = results.filter((r) => r.status === 'warn').length;
  console.log();
  if (failures) console.log(c.err(t.doctor.failures(failures)) + (warnings ? c.dim(t.doctor.andWarnings(warnings)) : ''));
  else if (warnings) console.log(c.warn(t.doctor.onlyWarnings(warnings)));
  else console.log(c.ok(t.doctor.allGood));
  console.log();
  if (failures) process.exitCode = 1;
}
