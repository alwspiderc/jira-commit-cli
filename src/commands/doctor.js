import { diagnose } from '../services/doctor.js';
import { c, header, icon } from '../ui/index.js';

const ICONS = { ok: icon.ok, warn: icon.warn, fail: icon.err, info: icon.info, skip: c.dim('–') };

export async function doctor() {
  header('doctor', c.dim('confere se a CLI está pronta neste repositório'));
  const results = await diagnose();
  const width = Math.max(...results.map((r) => r.name.length)) + 2;

  for (const { name, status, detail, fix } of results) {
    console.log(`${ICONS[status]} ${name.padEnd(width)}${status === 'skip' ? c.dim('pulado') : detail}`);
    if (fix) console.log(c.dim(`${' '.repeat(width + 2)}→ ${fix}`));
  }

  const failures = results.filter((r) => r.status === 'fail').length;
  const warnings = results.filter((r) => r.status === 'warn').length;
  console.log();
  if (failures) console.log(c.err(`${failures} problema(s) para corrigir`) + (warnings ? c.dim(`, ${warnings} aviso(s)`) : ''));
  else if (warnings) console.log(c.warn(`Tudo funcionando, com ${warnings} aviso(s)`));
  else console.log(c.ok('Tudo certo'));
  console.log();
  if (failures) process.exitCode = 1;
}
