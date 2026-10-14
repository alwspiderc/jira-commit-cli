// Sugestão de título por IA (opcional). Sem chave da Anthropic no ambiente, não faz nada.

const DEFAULT_MODEL = 'claude-opus-5-5';
const TIMEOUT_MS = 8_000; // dentro de um hook de commit, ninguém quer esperar

export function aiEnabled(cfg) {
  return cfg.ai !== false && Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/**
 * Sugere o título de uma atividade a partir do diff do stage.
 * Devolve null se a IA estiver desligada, falhar ou demorar — quem chama usa o subject do commit.
 */
export async function suggestTitle(cfg, { diff, files, subject, parentSummary }) {
  if (!aiEnabled(cfg) || (!diff && !files.length)) return null;

  try {
    // import tardio: quem não usa IA não paga o carregamento do SDK
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 0 });

    const context = [
      parentSummary && `Tarefa pai: ${parentSummary}`,
      subject && `Mensagem do commit: ${subject}`,
      files.length && `Arquivos alterados:\n${files.join('\n')}`,
      diff && `Diff:\n${diff}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const response = await client.beta.messages.create({
      model: cfg.aiModel ?? DEFAULT_MODEL,
      max_tokens: 2000,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system:
        'Você escreve títulos de subtarefas do Jira para um time de desenvolvimento brasileiro. ' +
        'Responda só com o título: uma frase em português, no infinitivo ("Criar…", "Corrigir…", "Adicionar…"), ' +
        'até 90 caracteres, sem prefixo de produto, sem chave de issue, sem aspas e sem ponto final. ' +
        'Descreva o que a mudança entrega, não os arquivos.',
      messages: [{ role: 'user', content: context }],
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
