const DEFAULT_MODEL = 'claude-opus-5-5';
const TIMEOUT_MS = 8_000;

export function aiEnabled(cfg) {
  return cfg.ai !== false && Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export async function suggestTitle(cfg, { diff, files, subject, parentSummary }) {
  if (!aiEnabled(cfg) || (!diff && !files.length)) return null;

  return ask(
    cfg,
    'Você escreve títulos de subtarefas do Jira para um time de desenvolvimento brasileiro. ' +
      'Responda só com o título: uma frase em português, no infinitivo ("Criar…", "Corrigir…", "Adicionar…"), ' +
      'até 90 caracteres, sem prefixo de produto, sem chave de issue, sem aspas e sem ponto final. ' +
      'Descreva o que a mudança entrega, não os arquivos.',
    [
      parentSummary && `Tarefa pai: ${parentSummary}`,
      subject && `Mensagem do commit: ${subject}`,
      files.length && `Arquivos alterados:\n${files.join('\n')}`,
      diff && `Diff:\n${diff}`,
    ],
  );
}

export async function suggestSubject(cfg, { diff, files, examples }) {
  if (!aiEnabled(cfg) || (!diff && !files.length)) return null;

  return ask(
    cfg,
    'Você escreve a descrição da primeira linha de mensagens de commit (Conventional Commits) ' +
      'para um time de desenvolvimento brasileiro. Responda só com a descrição: uma frase curta em ' +
      'português, no mesmo estilo dos exemplos (sem exemplos: "adiciona card de benefício na home"), ' +
      'começando com letra minúscula, até 72 caracteres, sem tipo, sem escopo, sem chave de issue, ' +
      'sem aspas e sem ponto final. Descreva o que a mudança faz, não os arquivos.',
    [
      examples.length && `Descrições recentes deste repositório:\n${examples.join('\n')}`,
      files.length && `Arquivos alterados:\n${files.join('\n')}`,
      diff && `Diff:\n${diff}`,
    ],
  );
}

async function ask(cfg, system, context) {
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 0 });

    const response = await client.beta.messages.create({
      model: cfg.aiModel ?? DEFAULT_MODEL,
      max_tokens: 2000,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      messages: [{ role: 'user', content: context.filter(Boolean).join('\n\n') }],
    });

    if (response.stop_reason === 'refusal') return null;
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
      .split('\n')[0]
      .replace(/^["'“]|["'”.]$/g, '');
    return text || null;
  } catch {
    return null;
  }
}
