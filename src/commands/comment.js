import { issueKeyRegex, parseIssueKey } from '../core/commit-message.js';
import { t } from '../i18n/index.js';
import { currentBranch } from '../infra/git.js';
import { issueUrl } from '../infra/jira/client.js';
import { openProject } from '../services/project.js';
import { BACK, runSteps } from '../utils/steps.js';
import { c, header, icon, log } from '../ui/index.js';
import { askComment, sendComment } from '../flows/comment.js';
import { pickIssue } from '../flows/pick-issue.js';

export async function comment(args = []) {
  const cfg = await openProject();
  const keyRegex = issueKeyRegex(cfg.projectKey);
  const { key, text } = parseArgs(cfg, args);
  const branch = await currentBranch(cfg.root);
  header(t.comment.title, c.dim(t.common.escBack), { project: cfg.projectKey });

  const answers = await runSteps(
    [
      {
        key: 'key',
        when: () => !key,
        run: () => pickIssue(cfg, { message: t.comment.which, branch, keyRegex }),
      },
      { key: 'text', when: () => !text, run: () => askComment() },
    ],
    { key, text },
  );
  if (answers === BACK) {
    log.hint(t.cli.cancelled);
    console.log();
    return;
  }

  if (!(await sendComment(answers.key, answers.text))) {
    log.hint(t.comment.empty);
    console.log();
    return;
  }
  const link = issueUrl(answers.key);
  if (link) console.log(`  ${icon.link} ${c.link(link)}`);
  console.log();
}

function parseArgs(cfg, [first = '', ...rest]) {
  const key = parseIssueKey(cfg.projectKey, first);
  if (key) return { key, text: rest.join(' ').trim() };
  return { key: null, text: [first, ...rest].join(' ').trim() };
}
