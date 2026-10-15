export const CONVENTIONAL_TYPES = [
  { value: 'feat', description: 'Nova funcionalidade' },
  { value: 'fix', description: 'Correção de bug' },
  { value: 'docs', description: 'Só documentação' },
  { value: 'style', description: 'Formatação, sem mudar o código' },
  { value: 'refactor', description: 'Refatoração, sem mudar o comportamento' },
  { value: 'perf', description: 'Melhoria de performance' },
  { value: 'test', description: 'Testes' },
  { value: 'build', description: 'Build ou dependências' },
  { value: 'ci', description: 'Configuração de CI' },
  { value: 'chore', description: 'Manutenção' },
  { value: 'revert', description: 'Reverte um commit' },
];

const DEFAULT_HEADER_MAX_LENGTH = 100;

export const defaultCommitSection = () => ({
  types: CONVENTIONAL_TYPES,
  scopes: [],
  headerMaxLength: DEFAULT_HEADER_MAX_LENGTH,
});

export function commitOptions(cfg) {
  if (!cfg.commit) return null;
  const { types = CONVENTIONAL_TYPES, scopes = [], headerMaxLength = DEFAULT_HEADER_MAX_LENGTH } = cfg.commit;
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
