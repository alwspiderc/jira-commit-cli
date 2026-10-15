import { t } from '../i18n/index.js';

const DEFAULT_TYPE_VALUES = ['feat', 'patch', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert', 'wip', 'merge'];

export const defaultTypes = () => DEFAULT_TYPE_VALUES.map((value) => ({ value, description: t.commitTypes[value] }));

const DEFAULT_HEADER_MAX_LENGTH = 100;

export const defaultCommitSection = () => ({
  types: defaultTypes(),
  scopes: [],
  headerMaxLength: DEFAULT_HEADER_MAX_LENGTH,
});

export function commitOptions(cfg) {
  if (!cfg.commit) return null;
  const { types = defaultTypes(), scopes = [], headerMaxLength = DEFAULT_HEADER_MAX_LENGTH } = cfg.commit;
  return {
    types: types.map((t) => (typeof t === 'string' ? { value: t } : t)),
    scopes,
    headerMaxLength,
  };
}

export function fromCz(cz) {
  return {
    types: (cz.types ?? []).map((t) => {
      const description = (t.name ?? '').replace(/^\s*[\w-]+:?\s*/, '').trim();
      return description ? { value: t.value, description } : t.value;
    }),
    scopes: (cz.scopes ?? []).map((s) => (typeof s === 'string' ? s : (s.value ?? s.name))).filter(Boolean),
    headerMaxLength: cz.subjectLimit ?? DEFAULT_HEADER_MAX_LENGTH,
  };
}
