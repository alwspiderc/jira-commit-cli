export const DEFAULT_TYPES = [
  { value: 'feat', description: 'Uma nova funcionalidade' },
  { value: 'patch', description: 'Adição de pequena funcionalidade' },
  { value: 'fix', description: 'Correção de bug' },
  { value: 'docs', description: 'Apenas documentação' },
  { value: 'style', description: 'Formatação, ponto e vírgula, etc (sem mudança de código)' },
  { value: 'refactor', description: 'Refatoração de código' },
  { value: 'perf', description: 'Melhoria de performance' },
  { value: 'test', description: 'Adicionando ou corrigindo testes' },
  { value: 'build', description: 'Mudanças no build ou dependências externas' },
  { value: 'ci', description: 'Mudanças na configuração de CI' },
  { value: 'chore', description: 'Tarefas de manutenção e configuração' },
  { value: 'revert', description: 'Reverte um commit anterior' },
  { value: 'wip', description: 'Work in progress' },
  { value: 'merge', description: 'Merge de branches' },
];

const DEFAULT_HEADER_MAX_LENGTH = 100;

export const defaultCommitSection = () => ({
  types: DEFAULT_TYPES,
  scopes: [],
  headerMaxLength: DEFAULT_HEADER_MAX_LENGTH,
});

export function commitOptions(cfg) {
  if (!cfg.commit) return null;
  const { types = DEFAULT_TYPES, scopes = [], headerMaxLength = DEFAULT_HEADER_MAX_LENGTH } = cfg.commit;
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
