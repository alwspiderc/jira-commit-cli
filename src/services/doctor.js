import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { hasCurrentBlock, isLegacy } from '../core/hook-script.js';
import { t } from '../i18n/index.js';
import { aiEnabled } from '../infra/ai.js';
import { hooksPath, repoRoot } from '../infra/git.js';
import { readHook, VERSIONED_HOOKS_DIR } from '../infra/git-hook.js';
import { getMyself, issueTypes } from '../infra/jira/api.js';
import { useSite } from '../infra/jira/client.js';
import { hasDependency, readPackage } from '../infra/package-json.js';
import { findOnPath } from '../infra/path-lookup.js';
import { loadSite } from '../infra/storage/credentials.js';
import { checkProjectConfig, PROJECT_FILE, projectConfigExists, readProjectFile } from '../infra/storage/project-config.js';

const MIN_NODE = 22;

const ok = (detail) => ({ status: 'ok', detail });
const info = (detail) => ({ status: 'info', detail });
const warn = (detail, fix) => ({ status: 'warn', detail, fix });
const fail = (detail, fix) => ({ status: 'fail', detail, fix });

export async function diagnose() {
  const d = t.doctor;
  const results = [];
  const check = async (name, run) => {
    let result;
    try {
      result = await run();
    } catch (err) {
      result = fail(err.message);
    }
    results.push({ name, ...result });
    return result.status !== 'fail';
  };
  const skip = (name) => results.push({ name, status: 'skip' });

  await check(d.node, () => {
    const version = process.versions.node;
    if (Number(version.split('.')[0]) >= MIN_NODE) return ok(`v${version}`);
    return fail(`v${version}`, d.installNode(MIN_NODE));
  });

  let root;
  if (!(await check(d.gitRepo, () => ok((root = repoRoot()))))) return results;

  let cfg;
  const configOk = await check(PROJECT_FILE, () => {
    if (!projectConfigExists()) return fail(d.notFound, d.runInit);
    cfg = readProjectFile();
    const { errors, warnings } = checkProjectConfig(cfg);
    if (errors.length) return fail(errors.join('; '), d.fixConfig(PROJECT_FILE));
    if (warnings.length) return warn(warnings.join('; '), d.newerFields);
    return ok(d.project(cfg.projectKey));
  });

  let loggedIn = false;
  if (configOk) {
    loggedIn = await check(d.login, () => {
      const site = loadSite(cfg.jiraUrl);
      useSite(site);
      return ok(`${site.url} (${site.type === 'server' ? 'Server/Data Center' : 'Cloud'})`);
    });
  } else skip(d.login);

  let connected = false;
  if (loggedIn) {
    connected = await check(d.connection, async () => {
      try {
        return ok(d.connectedAs((await getMyself()).displayName));
      } catch (err) {
        if (err.status === 401) return fail(d.badToken, d.runLogin);
        return fail(err.message, d.checkNetwork);
      }
    });
  } else skip(d.connection);

  if (connected) {
    await check(d.jiraProject, async () => {
      const names = (await issueTypes(cfg.projectKey)).map((type) => type.name);
      const issueType = cfg.issueType ?? 'Task';
      if (names.includes(issueType)) return ok(d.typeOk(cfg.projectKey, issueType));
      return warn(d.typeMissing(issueType, names.join(', ')), d.fixIssueType(PROJECT_FILE));
    });
  } else skip(d.jiraProject);

  await check(d.hook, () => {
    const { path, content } = readHook(root);
    const where = relative(root, path);
    if (!content?.includes('jira-commit')) return fail(d.notInstalled, d.runInit);
    if (isLegacy(content)) return warn(d.legacyHook(where), d.updateHook);
    if (!hasCurrentBlock(content)) return warn(d.editedHook(where), d.restoreHook);
    return ok(where);
  });

  await check(d.hooksDir, () => {
    const configured = hooksPath();
    if (existsSync(join(root, '.husky'))) {
      if (configured.startsWith('.husky')) return ok(`.husky (core.hooksPath = ${configured})`);
      return fail(d.huskyInactive, d.runNpmInstall);
    }
    if (existsSync(join(root, VERSIONED_HOOKS_DIR))) {
      if (configured === VERSIONED_HOOKS_DIR) return ok(VERSIONED_HOOKS_DIR);
      return fail(d.dirInactive(VERSIONED_HOOKS_DIR), d.runInit);
    }
    if (configured) return ok(configured);
    return warn(d.localOnly, d.versionHook);
  });

  await check(d.cli, () => {
    if (existsSync(join(root, 'node_modules', '.bin', 'jira-commit'))) return ok(d.inProject);
    const global = findOnPath('jira-commit');
    if (global) return ok(d.global(global));
    return fail(d.cliMissing, d.installCli);
  });

  const pkg = readPackage(root);
  if (pkg && hasDependency(pkg.json, 'husky')) {
    await check(d.husky, () => {
      if (/\bhusky\b/.test(pkg.json.scripts?.prepare ?? '')) return ok(d.prepareOk);
      return warn(d.prepareMissing, d.runInit);
    });
  }

  await check(d.ai, () => {
    if (cfg && aiEnabled(cfg)) return ok(d.aiOn(cfg.aiModel ?? d.defaultModel));
    return info(d.aiOff);
  });
  return results;
}
