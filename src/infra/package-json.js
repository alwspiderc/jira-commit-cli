import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function readPackage(root) {
  const path = join(root, 'package.json');
  if (!existsSync(path)) return null;
  const text = readFileSync(path, 'utf8');
  return { path, text, json: JSON.parse(text) };
}

export function setScript(pkg, name, command) {
  pkg.json.scripts = { ...pkg.json.scripts, [name]: command };
  const indent = pkg.text.match(/^[ \t]+(?=")/m)?.[0] ?? '  ';
  writeFileSync(pkg.path, JSON.stringify(pkg.json, null, indent) + (pkg.text.endsWith('\n') ? '\n' : ''));
}

export function hasDependency(json, name) {
  return Boolean(json.dependencies?.[name] ?? json.devDependencies?.[name]);
}

export function withHusky(prepare) {
  if (!prepare) return 'husky';
  return /\bhusky\b/.test(prepare) ? prepare : `${prepare} && husky`;
}
