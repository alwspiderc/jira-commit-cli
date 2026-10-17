import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { t } from '../i18n/index.js';

const run = promisify(execFile);

// Toda função recebe o cwd primeiro (sem ele, vale a pasta atual). Assíncrono e com cwd: quem roda
// fora do repositório (ex.: uma extensão de editor) não trava esperando o git nem depende da
// pasta atual do processo
async function git(args, { cwd, maxBuffer = 10 * 1024 * 1024 } = {}) {
  const { stdout } = await run('git', args, { cwd, encoding: 'utf8', maxBuffer, windowsHide: true });
  return stdout.trim();
}

export async function repoRoot(cwd) {
  try {
    return await git(['rev-parse', '--show-toplevel'], { cwd });
  } catch {
    throw new Error(t.errors.notGitRepo);
  }
}

export function hooksDir(cwd) {
  return git(['rev-parse', '--git-path', 'hooks'], { cwd });
}

export async function hooksPath(cwd) {
  try {
    return await git(['config', 'core.hooksPath'], { cwd });
  } catch {
    return '';
  }
}

export async function setHooksPath(cwd, path) {
  await git(['config', 'core.hooksPath', path], { cwd });
}

export async function currentBranch(cwd) {
  try {
    return await git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
  } catch {
    return '';
  }
}

export async function stagedFiles(cwd) {
  try {
    return (await git(['diff', '--cached', '--name-status'], { cwd }))
      .split('\n')
      .filter(Boolean)
      .map((l) => l.replace(/\t+/g, ' '));
  } catch {
    return [];
  }
}

export async function recentSubjects(cwd, n = 10) {
  try {
    return (await git(['log', '--no-merges', `-${n * 5}`, '--format=%s'], { cwd }))
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

export async function stagedDiff(cwd, maxChars = 8000) {
  try {
    const diff = await git(['diff', '--cached', '--no-color', '--unified=2'], { cwd, maxBuffer: 50 * 1024 * 1024 });
    return diff.length > maxChars ? diff.slice(0, maxChars) + '\n[... diff cortado ...]' : diff;
  } catch {
    return '';
  }
}
