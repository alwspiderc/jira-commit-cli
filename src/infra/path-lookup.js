import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

export function findOnPath(command) {
  const extensions = process.platform === 'win32' ? ['', ...(process.env.PATHEXT ?? '.CMD;.EXE').split(';')] : [''];
  for (const dir of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    for (const ext of extensions) {
      const candidate = join(dir, command + ext.toLowerCase());
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}
