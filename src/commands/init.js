import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { commitOptions, defaultCommitSection, fromCz } from '../core/commit-options.js';
import { commitlintReadsConfig, loadCzConfig, usesCommitlint } from '../infra/commit-tooling.js';
import { hooksPath, repoRoot, setHooksPath } from '../infra/git.js';
import { customGitHooks, hookHasCz, installHook, VERSIONED_HOOKS_DIR } from '../infra/git-hook.js';
import { issueTypes } from '../infra/jira/api.js';
import { useSite } from '../infra/jira/client.js';
import { listSites } from '../infra/storage/credentials.js';
import { addDevCommand, binCommand, detectPackageManager, run } from '../infra/package-manager.js';
import { hasDependency, readPackage, setScript, withHusky } from '../infra/package-json.js';
import {
  PROJECT_FILE,
  SCHEMA_REF,
  projectConfigExists,
  readProjectFile,
  saveProjectConfig,
} from '../infra/storage/project-config.js';
import { t } from '../i18n/index.js';
import { PACKAGE_NAME, REPOSITORY } from '../version.js';
import { c, confirm, header, input, log, select, withSpinner } from '../ui/index.js';

const COMMIT_SCRIPT = 'git commit --no-edit';

export async function init() {
  const root = repoRoot();
  header('init', c.dim(root));
  const commitlint = usesCommitlint(root);

  if (!projectConfigExists()) {
    saveProjectConfig(await askProjectConfig(commitlint));
    console.log();
    log.ok(`${t.init.created(c.bold(PROJECT_FILE))} ${c.dim(`· ${t.init.createdHint}`)}`);
  }

  const cfg = readProjectFile();
  if (!('commit' in cfg)) {
    cfg.commit = await commitSection(root, commitlint);
    saveProjectConfig(cfg);
    if (cfg.commit) log.ok(t.init.commitSaved(c.bold(PROJECT_FILE)));
  }
  const questions = Boolean(commitOptions(cfg));

  const { installed, versionedHooks } = await setupProject(root);
  linkSchema(root);

  const removeCz = questions && hookHasCz(root) && (await confirmRemoveCz());
  const { path, result } = installHook(root, { removeCz });
  log.ok(`${t.init.hook[result]} ${c.dim(path)}`);

  if (questions) await commitScript(root);
  nextSteps({
    questions,
    installed,
    versionedHooks,
    commitCommand: readPackage(root) ? 'npm run commit' : COMMIT_SCRIPT,
    showCommitlintSnippet: commitlint && !commitlintReadsConfig(root),
  });
}

function linkSchema(root) {
  const cfg = readProjectFile();
  if (cfg.$schema || !existsSync(join(root, SCHEMA_REF))) return;
  saveProjectConfig(cfg);
  log.ok(`${t.init.schemaLinked(c.bold(PROJECT_FILE))} ${c.dim('($schema)')}`);
}

async function setupProject(root) {
  const pkg = readPackage(root);
  if (!pkg) return { installed: false, versionedHooks: await setupVersionedHooks(root) };
  const legacyHusky = Boolean(pkg.json.husky?.hooks);
  if (legacyHusky) log.warn(t.init.husky4);

  const pm = detectPackageManager(root);
  const packages = [];
  if (!hasDependency(pkg.json, PACKAGE_NAME) && (await confirmCli())) packages.push(REPOSITORY);
  if (!legacyHusky && !hasDependency(pkg.json, 'husky') && (await confirmHusky())) packages.push('husky');
  const installed = packages.length > 0 && (await installPackages(root, pm, packages));

  const huskyInstalled = !legacyHusky && hasDependency(readPackage(root).json, 'husky');
  if (huskyInstalled && !existsSync(join(root, '.husky', '_'))) await setupHusky(root, pm);
  return { installed, versionedHooks: false };
}

// Sem package.json não há Husky: a pasta versionada vale para o time, mas o core.hooksPath é
// configuração local, então cada pessoa roda o init uma vez
async function setupVersionedHooks(root) {
  if (existsSync(join(root, '.husky')) || hooksPath()) return false;
  const dir = join(root, VERSIONED_HOOKS_DIR);
  if (!existsSync(dir)) {
    const custom = customGitHooks(root);
    if (custom.length) {
      log.warn(t.init.customHooks(custom.join(', ')));
      return false;
    }
    const ok = await confirm({
      message: `${t.init.versionedHooks(c.bold(VERSIONED_HOOKS_DIR))} ${c.dim(`· ${t.init.versionedHooksHint}`)}`,
      default: true,
    });
    if (!ok) {
      log.warn(t.init.localHooks);
      return false;
    }
    mkdirSync(dir, { recursive: true });
  }
  setHooksPath(VERSIONED_HOOKS_DIR);
  log.ok(`${t.init.hooksEnabled} ${c.dim(`· git config core.hooksPath ${VERSIONED_HOOKS_DIR}`)}`);
  return true;
}

function confirmCli() {
  return confirm({
    message: `${t.init.addCli} ${c.dim(`· ${t.init.addCliHint}`)}`,
    default: true,
  });
}

function confirmHusky() {
  return confirm({
    message: `${t.init.addHusky} ${c.dim(`· ${t.init.addHuskyHint}`)}`,
    default: true,
  });
}

async function installPackages(root, pm, packages) {
  const names = packages.map((p) => (p === REPOSITORY ? 'jira-commit' : p)).join(t.init.and);
  const command = addDevCommand(pm, packages);
  try {
    await withSpinner(t.init.installing(names), () => run(root, command), { done: t.init.installed(names) });
    return true;
  } catch (err) {
    log.warn(t.init.installFailed(names, err.message, command.join(' ')));
    return false;
  }
}

// husky init não serve: ele cria um pre-commit rodando "npm test", que o projeto não pediu
async function setupHusky(root, pm) {
  const pkg = readPackage(root);
  const current = pkg.json.scripts?.prepare;
  if (withHusky(current) !== current) setScript(pkg, 'prepare', withHusky(current));
  const command = binCommand(pm, 'husky');
  try {
    await withSpinner(t.init.configuringHusky, () => run(root, command), {
      done: `${t.init.huskyReady} ${c.dim(`· ${t.init.huskyReadyHint}`)}`,
    });
  } catch (err) {
    log.warn(t.init.huskyFailed(err.message, command.join(' ')));
  }
}

async function askProjectConfig(commitlint) {
  const projectKey = (
    await input({
      message: `${t.init.projectKey} ${c.dim(`· ${t.init.projectKeyExample}`)}`,
      validate: (v) => /^[A-Z][A-Z0-9]+$/.test(v.toUpperCase()) || t.init.projectKeyInvalid,
    })
  ).toUpperCase();
  const jiraUrl = await askJiraUrl();
  useSite(jiraUrl);
  const issueType = await askIssueType(projectKey);
  const summaryPrefix = await input({
    message: `${t.init.summaryPrefix} ${c.dim(`· ${t.init.summaryPrefixHint}`)}`,
    default: `{product} | ${issueType}: `,
  });
  const format = await input({
    message: `${t.init.format} ${c.dim('· {key} {message} {prefix} {subject}')}`,
    default: commitlint ? '{prefix}{key} {subject}' : '{key}: {message}',
  });
  return { projectKey, ...(jiraUrl && { jiraUrl }), issueType, summaryPrefix, format };
}

async function askJiraUrl() {
  const sites = listSites();
  if (sites.length <= 1) return sites[0]?.url;
  return select({
    message: t.init.whichJira,
    choices: sites.map((s) => ({ name: `${s.url}${s.isDefault ? c.dim(`  ${t.login.isDefault}`) : ''}`, value: s.url })),
    default: sites.find((s) => s.isDefault)?.url,
  });
}

async function askIssueType(projectKey) {
  const message = `${t.init.issueType} ${c.dim(`· ${t.init.issueTypeHint}`)}`;
  let types = [];
  try {
    types = await withSpinner(t.init.loadingTypes, async () =>
      (await issueTypes(projectKey)).filter((t) => !t.subtask && t.name !== 'Epic'),
    );
  } catch (err) {
    log.warn(t.init.typesFailed(err.message));
  }
  return types.length
    ? select({ message, choices: types.map((t) => ({ name: t.name, value: t.name })) })
    : input({ message, default: 'Task' });
}

async function commitSection(root, commitlint) {
  const cz = readCzConfig(root);
  if (cz) {
    const section = fromCz(cz);
    const ok = await confirm({
      message:
        `${t.init.importCz(section.types.length, section.scopes.length)} ${c.bold('.cz-config.js')}? ` +
        c.dim(`· ${t.init.importCzHint}`),
      default: true,
    });
    return ok ? section : false; // false: não pergunta de novo no próximo init
  }
  const ok = await confirm({
    message: `${t.init.askTypes} ${c.dim(`· ${t.init.askTypesHint}`)}`,
    default: commitlint,
  });
  return ok ? defaultCommitSection() : false;
}

function readCzConfig(root) {
  try {
    return loadCzConfig(root);
  } catch (err) {
    log.warn(err.message);
    return null;
  }
}

function confirmRemoveCz() {
  return confirm({
    message: `${t.init.removeCz} ${c.dim(`· ${t.init.removeCzHint}`)}`,
    default: true,
  });
}

async function commitScript(root) {
  const pkg = readPackage(root);
  if (!pkg) return;
  const current = pkg.json.scripts?.commit;
  if (current === COMMIT_SCRIPT) return;

  const ok = await confirm({
    message: `${current ? t.init.replaceScript(c.dim(current), COMMIT_SCRIPT) : t.init.createScript} ${c.dim(`· ${t.init.scriptHint}`)}`,
    default: true,
  });
  if (!ok) return;

  setScript(pkg, 'commit', COMMIT_SCRIPT);
  log.ok(t.init.scriptCreated);
}

function nextSteps({ questions, installed, versionedHooks, commitCommand, showCommitlintSnippet }) {
  console.log();
  if (installed) log.hint(t.init.commitInstall);
  if (versionedHooks) {
    log.hint(t.init.commitHooksDir(VERSIONED_HOOKS_DIR));
  }
  log.hint(t.init.ready);
  if (questions) log.hint(t.init.commitWithoutEditor(commitCommand));
  log.hint(t.init.checkNow);
  if (questions && showCommitlintSnippet) {
    console.log();
    log.hint(t.init.commitlintHint(PROJECT_FILE));
    log.hint(`  const { commit } = require('./${PROJECT_FILE}');`);
    log.hint(`  'type-enum': [2, 'always', commit.types.map((t) => t.value ?? t)],`);
    log.hint(`  'scope-enum': [2, 'always', commit.scopes],`);
    log.hint(`  'header-max-length': [2, 'always', commit.headerMaxLength],`);
    log.hint(`  'subject-case': [0], // ${t.init.commitlintSubjectCase}`);
  }
  console.log();
}
