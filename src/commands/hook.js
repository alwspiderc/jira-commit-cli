import { commitOptions } from '../core/commit-options.js';
import { commitBody, detailLines, formatMessage, issueKeyRegex, splitConventional } from '../core/commit-message.js';
import { aiEnabled, suggestSubject } from '../infra/ai.js';
import { currentBranch, recentSubjects, stagedDiff, stagedFiles } from '../infra/git.js';
import { readMessageFile, writeMessageFile } from '../infra/message-file.js';
import { issueUrl } from '../infra/storage/credentials.js';
import { loadProjectConfig } from '../infra/storage/project-config.js';
import { getRepoState, setRepoState } from '../infra/storage/repo-state.js';
import { findMyIssues } from '../services/issues.js';
import { inBackground } from '../utils/promise.js';
import { c, header, log, summaryCard } from '../ui/index.js';
import { chooseIssue } from '../flows/choose-issue.js';
import { askCommit, askMessage } from '../flows/commit-questions.js';

const READY_SOURCES = ['merge', 'squash', 'commit'];

export async function hook(msgFile, source) {
  if (!msgFile) throw new Error('Uso: jira-commit hook <arquivo-msg> [origem]');
  if (READY_SOURCES.includes(source)) return;

  const cfg = loadProjectConfig();
  const keyRegex = issueKeyRegex(cfg.projectKey);
  let { firstLine, rest } = readMessageFile(msgFile);
  if (keyRegex.test(firstLine)) return;

  const branch = currentBranch();
  header(`${cfg.projectKey} · ${branch}`, firstLine ? c.accent(firstLine) : c.dim('(mensagem vazia)'));

  const prefetch = inBackground(findMyIssues(cfg));
  const opts = !firstLine && commitOptions(cfg);
  const suggestion =
    opts && aiEnabled(cfg)
      ? suggestSubject(cfg, { diff: stagedDiff(), files: stagedFiles(), examples: recentSubjects() })
      : null;

  const details = { body: '', breaking: '' };
  const save = (line) => writeMessageFile(msgFile, [line, ...detailLines(details), ...rest]);

  if (!firstLine) {
    firstLine = opts ? await askCommit(cfg, opts, suggestion) : await askMessage(cfg);
    save(firstLine);
    if (keyRegex.test(firstLine)) return;
  }

  const commit = { subject: splitConventional(firstLine).subject, body: commitBody(rest), details };
  const result = await chooseIssue(cfg, { commit, keyRegex, branch, prefetch });
  if (!result) {
    save(firstLine);
    log.hint('Commit seguirá sem chave do Jira.');
    console.log();
    return;
  }

  const message = formatMessage(cfg.format, result.key, firstLine);
  save(message);
  rememberIssue(branch, result.key);
  summaryCard(result, message, issueUrl(result.key));
}

function rememberIssue(branch, key) {
  const { lastIssueByBranch } = getRepoState();
  setRepoState({ lastIssueByBranch: { ...lastIssueByBranch, [branch]: key } });
}
