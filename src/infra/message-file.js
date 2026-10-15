import { readFileSync, writeFileSync } from 'node:fs';

export function readMessageFile(path) {
  const [first, ...rest] = readFileSync(path, 'utf8').split('\n');
  return { firstLine: first.trim(), rest };
}

export function writeMessageFile(path, lines) {
  writeFileSync(path, lines.join('\n'));
}
