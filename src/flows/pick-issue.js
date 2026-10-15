import { getRepoState } from '../infra/storage/repo-state.js';
import { findMyIssues, searchProject } from '../services/issues.js';
import { BACK, c, issueChoices, section, searchSelect, withSpinner } from '../ui/index.js';
import { searchResults } from './choose-issue.js';

export async function pickIssue(cfg, { message, branch, keyRegex }) {
  const branchKey = branch.match(keyRegex)?.[0];
  const lastKey = getRepoState().lastIssueByBranch?.[branch];
  const issues = await withSpinner('Buscando suas atividades no Jira…', () => findMyIssues(cfg));
  const choices = issueChoices(issues, branchKey, lastKey);
  const listed = new Set(issues.map((i) => i.key));

  const key = await searchSelect({
    message: `${message} ${c.dim('· digite para buscar')}`,
    pageSize: 15,
    default: [branchKey, lastKey].find((k) => listed.has(k)) ?? choices.find((ch) => ch.value)?.value,
    items: (term, remote) =>
      term
        ? searchResults(term, remote, { cfg, issues, branchKey, lastKey })
        : [section(`── suas atividades (${issues.length})`), ...choices],
    remote: (term) => searchProject(cfg, term),
    back: true,
  });
  return key === BACK ? BACK : key;
}
