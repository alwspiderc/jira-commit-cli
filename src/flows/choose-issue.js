import { matchIssues } from '../core/issue-match.js';
import { projectSearchJql } from '../core/jql.js';
import { t } from '../i18n/index.js';
import { getIssue } from '../infra/jira/api.js';
import { getRepoState } from '../infra/storage/repo-state.js';
import { findMyIssues, searchProject } from '../services/issues.js';
import { BACK, c, issueChoices, lastTag, log, notice, searchSelect, section, withSpinner } from '../ui/index.js';
import { askComment } from './comment.js';
import { askDetails } from './commit-questions.js';
import { createFromCommit } from './create-issue.js';
import { manualKey } from './manual-key.js';

const ACTION = {
  NEW: '__new__',
  TOGGLE_STATUSES: '__other__',
  MANUAL: '__manual__',
  DETAILS: '__details__',
  COMMENT: '__comment__',
  SKIP: '__skip__',
};
const PAGE_SIZE = 15;

export async function chooseIssue(cfg, { commit, keyRegex, branch, prefetch }) {
  const context = {
    cfg,
    commit,
    branchKey: branch.match(keyRegex)?.[0],
    lastKey: getRepoState(cfg.root).lastIssueByBranch?.[branch],
    found: new Map(),
  };
  let all = false;
  let issues = null;
  let pending = prefetch;

  for (;;) {
    if (!issues) {
      try {
        issues = await loadIssues(cfg, all, pending);
        pending = null;
      } catch (err) {
        log.warn(t.menu.jiraUnreachable(err.message));
        return manualKey(cfg, keyRegex, { offline: true });
      }
    }

    const choice = await issueMenu(context, issues, all);
    switch (choice) {
      case BACK:
        if (!all) return BACK;
        all = false;
        issues = null;
        break;
      case ACTION.TOGGLE_STATUSES:
        all = !all;
        issues = null;
        break;
      case ACTION.DETAILS:
        await askDetails(commit.details);
        break;
      case ACTION.COMMENT: {
        const comment = await askComment(commit.comment);
        if (comment !== BACK) commit.comment = comment;
        break;
      }
      case ACTION.SKIP:
        return null;
      case ACTION.MANUAL: {
        const typed = await manualKey(cfg, keyRegex);
        if (typed !== BACK) return typed;
        break;
      }
      case ACTION.NEW: {
        const created = await createFromCommit(cfg, commit, issues, keyRegex);
        if (created !== BACK) return created;
        break;
      }
      default:
        return { key: choice, title: (issues.find((i) => i.key === choice) ?? context.found.get(choice))?.summary };
    }
  }
}

export async function linkBranchIssue(key) {
  try {
    const { summary } = await withSpinner(t.menu.linkingBranch(key), () => getIssue(key));
    return { key, title: summary };
  } catch (err) {
    log.warn(t.menu.branchUnchecked(key, err.message));
    return { key };
  }
}

function loadIssues(cfg, all, prefetch) {
  return withSpinner(all ? t.menu.loadingAll : t.menu.loading, () =>
    prefetch && !all ? prefetch : findMyIssues(cfg, { all }),
  );
}

function issueMenu({ cfg, commit, branchKey, lastKey, found }, issues, all) {
  const taskChoices = issueChoices(issues, { branchKey, lastKey, productSeparator: cfg.productSeparator });
  const lastChoice =
    lastKey && lastKey !== branchKey && !issues.some((i) => i.key === lastKey)
      ? [{ name: `${c.key(lastKey)}  ${lastTag()}`, short: lastKey, value: lastKey }]
      : [];
  const keys = new Set([...lastChoice, ...taskChoices].map((ch) => ch.value).filter(Boolean));
  const actions = menuActions({
    all,
    hasDetails: Boolean(commit.details.body || commit.details.breaking),
    hasComment: Boolean(commit.comment),
  });

  return searchSelect({
    message: `${t.menu.question} ${c.dim(`${all ? `· ${t.menu.allStatuses} ` : ''}· ${t.common.typeToSearch}`)}`,
    pageSize: PAGE_SIZE,
    default: [branchKey, lastKey].find((k) => keys.has(k)) ?? taskChoices.find((ch) => ch.value)?.value,
    items: (term, remote) =>
      term
        ? searchResults(term, remote, { cfg, issues, branchKey, lastKey, actions })
        : [
            ...actions,
            section(`── ${all ? t.menu.allOpen : t.menu.yours} (${issues.length})`),
            ...lastChoice,
            ...taskChoices,
          ],
    back: true,
    remote: async (term) => {
      const results = await searchProject(cfg, term);
      results.forEach((i) => found.set(i.key, i));
      return results;
    },
  });
}

function menuActions({ all, hasDetails, hasComment }) {
  const m = t.menu;
  return [
    { name: c.ok(m.create), short: m.createShort, value: ACTION.NEW, description: m.createHelp },
    all
      ? { name: c.warn(m.backToDefault), short: m.backToDefaultShort, value: ACTION.TOGGLE_STATUSES }
      : {
          name: c.warn(m.otherStatuses),
          short: m.otherStatusesShort,
          value: ACTION.TOGGLE_STATUSES,
          description: m.otherStatusesHelp,
        },
    { name: c.accent(m.typeKey), short: m.typeKeyShort, value: ACTION.MANUAL, description: m.typeKeyHelp },
    { name: c.accent(m.details(hasDetails)), short: m.detailsShort, value: ACTION.DETAILS, description: m.detailsHelp },
    { name: c.accent(m.comment(hasComment)), short: m.commentShort, value: ACTION.COMMENT, description: m.commentHelp },
    { name: c.dim(m.skip), short: m.skipShort, value: ACTION.SKIP, description: m.skipHelp },
  ];
}

export function searchResults(term, remote, { cfg, issues, branchKey, lastKey, actions = [] }) {
  const m = t.menu;
  const local = matchIssues(issues, term);
  const isMine = (r) => issues.some((i) => i.key === r.key);
  const mine = [...local, ...remote.results.filter((r) => isMine(r) && !local.some((l) => l.key === r.key))];
  const others = remote.results.filter((r) => !isMine(r));
  const searching = remote.status === 'loading' && Boolean(projectSearchJql(cfg.projectKey, term));
  const failed = remote.status === 'error';
  const nothing = !mine.length && !others.length && !searching && !failed;
  const choicesOf = (list, marks) => issueChoices(list, { ...marks, productSeparator: cfg.productSeparator });

  return [
    ...(mine.length ? [section(`── ${m.yours} (${mine.length})`), ...choicesOf(mine, { branchKey, lastKey })] : []),
    ...(searching ? [section(`── ${m.searchingProject}`)] : []),
    ...(failed ? [section(`── ${m.searchFailed}`)] : []),
    ...(others.length ? [section(`── ${m.others} (${others.length})`), ...choicesOf(others)] : []),
    ...(nothing ? [notice(m.none)] : []),
    ...(actions.length ? [section(`── ${m.actions}`), ...actions] : []),
  ];
}
