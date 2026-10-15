import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const LOCKFILES = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
];
const ADD_DEV = { npm: ['install', '--save-dev'], yarn: ['add', '--dev'], pnpm: ['add', '--save-dev'] };
const EXEC = { npm: ['npx', '--no-install'], yarn: ['yarn'], pnpm: ['pnpm', 'exec'] };

export function detectPackageManager(root) {
  return LOCKFILES.find(([file]) => existsSync(join(root, file)))?.[1] ?? 'npm';
}

export const addDevCommand = (pm, packages) => [pm, ...ADD_DEV[pm], ...packages];

export const binCommand = (pm, bin) => [...EXEC[pm], bin];

export function run(root, command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command.join(' '), { cwd: root, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve();
      const tail = output.trim().split('\n').slice(-3).join(' ').trim();
      reject(new Error(tail || `${command[0]} saiu com código ${code}`));
    });
  });
}
