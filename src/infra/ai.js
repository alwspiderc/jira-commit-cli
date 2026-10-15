import { t } from '../i18n/index.js';

const DEFAULT_MODEL = 'claude-opus-5-5';
const TIMEOUT_MS = 8_000;

export function aiEnabled(cfg) {
  return cfg.ai !== false && Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export async function suggestTitle(cfg, { diff, files, subject, parentSummary }) {
  if (!aiEnabled(cfg) || (!diff && !files.length)) return null;

  return ask(cfg, t.ai.titleSystem, [
    parentSummary && `${t.ai.parentTask}: ${parentSummary}`,
    subject && `${t.ai.commitMessage}: ${subject}`,
    files.length && `${t.ai.changedFiles}:\n${files.join('\n')}`,
    diff && `Diff:\n${diff}`,
  ]);
}

export async function suggestSubject(cfg, { diff, files, examples }) {
  if (!aiEnabled(cfg) || (!diff && !files.length)) return null;

  return ask(cfg, t.ai.subjectSystem, [
    examples.length && `${t.ai.recentSubjects}:\n${examples.join('\n')}`,
    files.length && `${t.ai.changedFiles}:\n${files.join('\n')}`,
    diff && `Diff:\n${diff}`,
  ]);
}

export function systemPrompt(base, instructions) {
  return instructions?.trim() ? `${base}\n\n${t.ai.projectInstructions}: ${instructions.trim()}` : base;
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
      system: systemPrompt(system, cfg.aiInstructions),
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
