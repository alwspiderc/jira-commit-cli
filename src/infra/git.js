import { execSync } from 'node:child_process';
import { t } from '../i18n/index.js';

function git(cmd) {
  return execSync(`git ${cmd}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

export function repoRoot() {
  try {
    return git('rev-parse --show-toplevel');
  } catch {
    throw new Error(t.errors.notGitRepo);
  }
}

export function hooksDir() {
  return git('rev-parse --git-path hooks');
}

export function hooksPath() {
  try {
    return git('config core.hooksPath');
  } catch {
    return '';
  }
}

export function setHooksPath(path) {
  git(`config core.hooksPath ${path}`);
}

export function currentBranch() {
  try {
    return git('rev-parse --abbrev-ref HEAD');
  } catch {
    return '';
  }
}

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

export function recentSubjects(n = 10) {
  try {
    return git(`log --no-merges -${n * 5} --format=%s`)
      .split('\n')
      .filter((s) => /^[a-z]+(\([^)]*\))?!?: /.test(s) && !s.includes('[skip ci]'))
      .map((s) =>
        s
          .replace(/^[a-z]+(\([^)]*\))?!?: /, '')
          .replace(/\b[A-Z][A-Z0-9]+-\d+\b:?\s*/g, '')
          .trim(),
      )
      .filter(Boolean)
      .slice(0, n);
  } catch {
    return [];
  }
}

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
