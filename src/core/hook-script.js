// Usa a CLI do projeto e, se não houver, a global. Sem nenhuma, avisa e deixa o commit seguir
// (nos dois idiomas: o bloco não pode depender do idioma de quem rodou o init).
// Clientes gráficos (ex.: VS Code) não têm /dev/tty: sem essa checagem, o commit travaria
export const HOOK_BLOCK = [
  '# jira-commit',
  'JC=./node_modules/.bin/jira-commit; [ -f "$JC" ] || JC=$(command -v jira-commit)',
  'if [ -z "$JC" ]; then echo "jira-commit: CLI não encontrada / not found" >&2',
  'elif sh -c ": >/dev/tty" 2>/dev/null; then "$JC" hook "$1" "$2" < /dev/tty; fi',
];

const CZ_HOOK = /\bcz --hook\b/;
const OUR_LINE = /jira-commit|\$JC\b/;
const LEGACY_LINE = /npx --no-install jira-commit hook/;

export const hasCz = (script = '') => script.split('\n').some((l) => CZ_HOOK.test(l));

export const isLegacy = (script = '') => LEGACY_LINE.test(script);

export const hasCurrentBlock = (script = '') => HOOK_BLOCK.every((line) => script.split('\n').includes(line));

// Põe o bloco atual no lugar do antigo (ou no fim), sem mexer no resto do script
export function withHookBlock(script, { removeCz = false } = {}) {
  let lines = (script ?? '#!/bin/sh').split('\n');
  if (removeCz) lines = lines.filter((l) => !CZ_HOOK.test(l));

  const at = lines.findIndex((l) => OUR_LINE.test(l));
  const rest = lines.filter((l) => !OUR_LINE.test(l));
  if (at >= 0) {
    const before = lines.slice(0, at).filter((l) => !OUR_LINE.test(l)).length;
    rest.splice(before, 0, ...HOOK_BLOCK);
    return rest.join('\n').replace(/^\n+/, '').trimEnd() + '\n';
  }
  const head = rest.join('\n').replace(/^\n+/, '').trimEnd();
  const gap = script ? '\n\n' : '\n';
  return [head, HOOK_BLOCK.join('\n')].filter(Boolean).join(gap) + '\n';
}
