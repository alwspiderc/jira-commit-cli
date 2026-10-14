import { execSync } from 'node:child_process';

function git(cmd) {
  return execSync(`git ${cmd}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

export function repoRoot() {
  try {
    return git('rev-parse --show-toplevel');
  } catch {
    throw new Error('Isso não parece ser um repositório git.');
  }
}

export function hooksDir() {
  return git('rev-parse --git-path hooks');
}

export function currentBranch() {
  try {
    return git('rev-parse --abbrev-ref HEAD');
  } catch {
    return '';
  }
}

/** Arquivos no stage, ex.: ["M src/home/Header.tsx", "A src/home/Card.tsx"]. */
export function stagedFiles() {
  try {
    return git('diff --cached --name-status')
      .split('\n')
      .filter(Boolean)
      .map((l) => l.replace(/\t+/g, ' '));
  } catch {
    return [];
  }
}

/** Diff do stage, cortado em maxChars (vai para a IA, não precisa ser inteiro). */
export function stagedDiff(maxChars = 8000) {
  try {
    const diff = execSync('git diff --cached --no-color --unified=2', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 50 * 1024 * 1024,
    });
    return diff.length > maxChars ? diff.slice(0, maxChars) + '\n[... diff cortado ...]' : diff;
  } catch {
    return '';
  }
}
