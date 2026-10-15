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
import { BACK, c, header, log, summaryCard } from '../ui/index.js';
import { chooseIssue } from '../flows/choose-issue.js';
import { askCommit, askMessage } from '../flows/commit-questions.js';
import { postComment } from '../flows/comment.js';

const READY_SOURCES = ['merge', 'squash', 'commit'];

export async function hook(msgFile, source) {
  if (!msgFile) throw new Error('Uso: jira-commit hook <arquivo-msg> [origem]');
  if (READY_SOURCES.includes(source)) return;

  const cfg = loadProjectConfig();
  const keyRegex = issueKeyRegex(cfg.projectKey);
  let { firstLine, rest } = readMessageFile(msgFile);
  if (keyRegex.test(firstLine)) return;

  const branch = currentBranch();
  const context = firstLine ? c.accent(firstLine) : c.dim('(mensagem vazia)');
  header(`${cfg.projectKey} · ${branch}`, `${context}  ${c.dim('· esc volta ao passo anterior')}`);

  const prefetch = inBackground(findMyIssues(cfg));
  const opts = !firstLine && commitOptions(cfg);
  const suggestion =
    opts && aiEnabled(cfg)
      ? suggestSubject(cfg, { diff: stagedDiff(), files: stagedFiles(), examples: recentSubjects() })
      : null;

  const details = { body: '', breaking: '' };
  const save = (line) => writeMessageFile(msgFile, [line, ...detailLines(details), ...rest]);

  const askLine = !firstLine;
  const commit = { body: commitBody(rest), details, comment: '' };
  let answers;
  let result;
  for (;;) {
    if (askLine) {
      const asked = opts ? await askCommit(cfg, opts, suggestion, answers) : await askMessage(cfg, answers);
      if (asked === BACK) {
        if (opts) answers = undefined;
        continue;
      }
      answers = opts ? asked.answers : asked;
      firstLine = opts ? asked.line : asked;
      save(firstLine);
      if (keyRegex.test(firstLine)) return;
    }
    commit.subject = splitConventional(firstLine).subject;
    result = await chooseIssue(cfg, { commit, keyRegex, branch, prefetch });
    if (result !== BACK) break;
  }

  if (!result) {
    save(firstLine);
    log.hint('Commit seguirá sem chave do Jira.');
    if (commit.comment) log.hint('O comentário não foi enviado: nenhuma atividade foi vinculada.');
    console.log();
    return;
  }

  const message = formatMessage(cfg.format, result.key, firstLine);
  save(message);
  rememberIssue(branch, result.key);
  const commented = Boolean(commit.comment) && (await postComment(result.key, commit.comment));
  summaryCard({ ...result, commented }, message, issueUrl(result.key));
}

function rememberIssue(branch, key) {
  const { lastIssueByBranch } = getRepoState();
  setRepoState({ lastIssueByBranch: { ...lastIssueByBranch, [branch]: key } });
}
