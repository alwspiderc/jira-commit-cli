import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { catalogs, detectLanguage, language, setLanguage, t } from '../src/i18n/index.js';
import { defaultTypes } from '../src/core/commit-options.js';
import { systemPrompt } from '../src/infra/ai.js';

const shape = (value) => {
  if (typeof value === 'function') return `fn(${value.length})`;
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]));
  return 'text';
};

describe('i18n', () => {
  afterEach(() => setLanguage('pt'));

  it('pt e en têm as mesmas chaves e as mesmas variáveis', () => {
    assert.deepEqual(shape(catalogs.en), shape(catalogs.pt));
  });

  it('escolhe o idioma: JIRA_COMMIT_LANG, senão o do sistema (pt* → pt, resto → en)', () => {
    assert.equal(detectLanguage({ JIRA_COMMIT_LANG: 'en' }, 'pt-BR'), 'en');
    assert.equal(detectLanguage({ JIRA_COMMIT_LANG: 'xx' }, 'pt-BR'), 'pt');
    assert.equal(detectLanguage({}, 'pt-PT'), 'pt');
    assert.equal(detectLanguage({}, 'en-US'), 'en');
    assert.equal(detectLanguage({}, 'es-ES'), 'en');
  });

  it('troca o idioma na hora e ignora idiomas desconhecidos', () => {
    setLanguage('en');
    assert.equal(t.menu.skipShort, 'Skip');
    setLanguage('fr');
    assert.equal(language(), 'en');
    setLanguage('pt');
    assert.equal(t.menu.skipShort, 'Pular');
  });

  it('tipos padrão do commit seguem o idioma', () => {
    setLanguage('en');
    assert.deepEqual(defaultTypes()[0], { value: 'feat', description: 'A new feature' });
    assert.equal(defaultTypes().length, 14);
  });
});

describe('IA', () => {
  afterEach(() => setLanguage('pt'));

  it('acrescenta a orientação do projeto ao prompt', () => {
    assert.equal(systemPrompt('Base.', undefined), 'Base.');
    assert.equal(systemPrompt('Base.', '  '), 'Base.');
    assert.equal(systemPrompt('Base.', 'Use termos bancários'), 'Base.\n\nOrientação deste projeto: Use termos bancários');
    setLanguage('en');
    assert.match(systemPrompt('Base.', 'Banking terms'), /Guidance for this project: Banking terms$/);
  });

  it('os prompts não citam mais um time específico', () => {
    for (const lang of ['pt', 'en']) {
      setLanguage(lang);
      assert.doesNotMatch(t.ai.titleSystem + t.ai.subjectSystem, /brasileiro|brazilian/i);
    }
  });
});
