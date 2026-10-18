import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripVTControlCharacters } from 'node:util';
import { truncateVisible } from '../src/ui/output.js';
import {
  commitBody,
  detailLines,
  formatMessage,
  issueKeyRegex,
  parseIssueKey,
  keyReserve,
  splitConventional,
} from '../src/core/commit-message.js';
import { commitOptions, fromCz } from '../src/core/commit-options.js';
import { capitalizeTitle, draftTitle, mostCommonProduct, productOf, resolvePrefix } from '../src/core/issue-title.js';
import { buildTree } from '../src/core/issue-tree.js';
import { matchIssues, rankChoices } from '../src/core/issue-match.js';
import { myIssuesJql, projectSearchJql } from '../src/core/jql.js';
import { adfDocument } from '../src/core/adf.js';
import { bodyParagraphs, commentParagraphs, issueDescription } from '../src/core/document.js';
import { wikiText } from '../src/core/wiki.js';
import { HOOK_BLOCK, hasCurrentBlock, hasCz, isLegacy, withHookBlock } from '../src/core/hook-script.js';
import { validate } from '../src/core/validate.js';
import { BACK, exit, runSteps } from '../src/utils/steps.js';
import { setLanguage } from '../src/i18n/index.js';

setLanguage('pt');

describe('commit-message', () => {
  it('separa o prefixo Conventional Commits', () => {
    assert.deepEqual(splitConventional('feat(home): adiciona card'), { prefix: 'feat(home): ', subject: 'adiciona card' });
    assert.deepEqual(splitConventional('fix!: corrige'), { prefix: 'fix!: ', subject: 'corrige' });
    assert.deepEqual(splitConventional('adiciona card'), { prefix: '', subject: 'adiciona card' });
  });

  it('lê a chave digitada com ou sem o prefixo do projeto', () => {
    assert.equal(parseIssueKey('APP', '12'), 'APP-12');
    assert.equal(parseIssueKey('APP', ' app-12 '), 'APP-12');
    assert.equal(parseIssueKey('APP', 'texto'), null);
    assert.equal(parseIssueKey('APP', 'OUTRO-12'), null);
  });

  it('acha a chave do projeto', () => {
    assert.ok(issueKeyRegex('APP').test('feat: APP-12 algo'));
    assert.ok(!issueKeyRegex('APP').test('feat: XAPP-12 algo'));
  });

  it('tira comentários e o que vem depois da tesoura do corpo', () => {
    const lines = ['', 'corpo', '# comentário', '# ------------------------ >8 ------------------------', 'diff'];
    assert.equal(commitBody(lines), 'corpo');
  });

  it('monta corpo e BREAKING CHANGE', () => {
    assert.deepEqual(detailLines({ body: 'a | b', breaking: 'x' }), ['', 'a', 'b', '', 'BREAKING CHANGE: x']);
    assert.deepEqual(detailLines(), []);
  });

  it('aplica o format', () => {
    assert.equal(formatMessage('{prefix}{key} {subject}', 'APP-1', 'feat(home): card'), 'feat(home): APP-1 card');
    assert.equal(formatMessage('{key}: {message}', 'APP-1', 'card'), 'APP-1: card');
  });

  it('reserva o espaço da chave', () => {
    assert.equal(keyReserve({ format: '{prefix}{key} {subject}', projectKey: 'LOJA' }), 'LOJA-00000 '.length);
  });
});

describe('commit-options', () => {
  it('normaliza tipos e devolve null sem a seção', () => {
    assert.equal(commitOptions({}), null);
    assert.equal(commitOptions({ commit: false }), null);
    assert.deepEqual(commitOptions({ commit: { types: ['feat'] } }).types, [{ value: 'feat' }]);
  });

  it('importa do cz', () => {
    const section = fromCz({
      types: [{ value: 'feat', name: 'feat:     Uma nova funcionalidade' }, { value: 'wip', name: 'wip' }],
      scopes: [{ name: 'home' }, 'login'],
      subjectLimit: 80,
    });
    assert.deepEqual(section, {
      types: [{ value: 'feat', description: 'Uma nova funcionalidade' }, 'wip'],
      scopes: ['home', 'login'],
      headerMaxLength: 80,
    });
  });
});

describe('issue-title', () => {
  it('capitaliza depois do prefixo', () => {
    assert.equal(capitalizeTitle('P | M: atualiza link', 'P | M: '), 'P | M: Atualiza link');
    assert.equal(capitalizeTitle('atualiza link', 'outro: '), 'Atualiza link');
  });

  it('capitaliza com o prefixo editado ou pontuação no começo', () => {
    assert.equal(capitalizeTitle('Q | M: atualiza link', 'P | M: '), 'Q | M: Atualiza link');
    assert.equal(capitalizeTitle('P | M:atualiza', 'P | M: '), 'P | M:Atualiza');
    assert.equal(capitalizeTitle('P | M: "atualiza"', 'P | M: '), 'P | M: "Atualiza"');
    assert.equal(capitalizeTitle('P | M: ícone novo', 'P | M: '), 'P | M: Ícone novo');
    assert.equal(capitalizeTitle('2 telas novas', ''), '2 telas novas');
  });

  it('resolve o prefixo do produto', () => {
    assert.equal(resolvePrefix('{product} | Mobile: ', 'TÁTICO'), 'TÁTICO | Mobile: ');
    assert.equal(resolvePrefix('{product} | Mobile: ', ''), '');
    assert.equal(resolvePrefix('Fixo: ', ''), 'Fixo: ');
    assert.equal(resolvePrefix(undefined, 'X'), '');
  });

  it('acha o produto mais comum', () => {
    assert.equal(productOf('TÁTICO | Mobile: x'), 'TÁTICO');
    assert.equal(productOf('sem produto'), '');
    const issues = [{ summary: 'A | x' }, { summary: 'B | y' }, { summary: 'B | z' }, { summary: 'nada' }];
    assert.equal(mostCommonProduct(issues), 'B');
  });

  it('usa o separador de produto configurado', () => {
    assert.equal(productOf('APP - Mobile: x', ' - '), 'APP');
    assert.equal(mostCommonProduct([{ summary: 'X / a' }, { summary: 'X / b' }], ' / '), 'X');
  });

  it('monta o título da atividade com o produto do pai', () => {
    const parent = { summary: 'LOJA | Mobile - Benefícios: Criar tela' };
    assert.deepEqual(draftTitle({ template: '{product} | Mobile: ', subject: 'adiciona card', parent }), {
      prefix: 'LOJA | Mobile: ',
      title: 'LOJA | Mobile: Adiciona card',
    });
  });

  it('sem pai, usa o produto mais comum; a sugestão da IA vale mais que o commit', () => {
    const issues = [{ summary: 'A | x' }, { summary: 'B | y' }, { summary: 'B | z' }];
    const draft = draftTitle({ template: '{product} | Mobile: ', subject: 'commit', suggestion: 'criar card', issues });
    assert.deepEqual(draft, { prefix: 'B | Mobile: ', title: 'B | Mobile: Criar card' });
    assert.deepEqual(draftTitle({ template: '{product} | Tarefa: ', subject: 'rasasdasd' }), { prefix: '', title: 'Rasasdasd' });
  });
});

describe('issue-tree', () => {
  it('agrupa subtarefas sob o pai e puxa o foco para o topo', () => {
    const issues = [
      { key: 'A-1', summary: 'tarefa' },
      { key: 'A-3', summary: 'sub', parent: { key: 'A-2', summary: 'pai fora' } },
      { key: 'A-4', summary: 'sub', parent: { key: 'A-1' } },
    ];
    const tree = buildTree(issues, 'A-3');
    assert.deepEqual(
      tree.map((f) => [f.root.key, f.inList, f.children.map((c) => c.key)]),
      [
        ['A-2', false, ['A-3']],
        ['A-1', true, ['A-4']],
      ],
    );
  });
});

describe('issue-match', () => {
  it('filtra sem acento e com todas as palavras', () => {
    const issues = [
      { key: 'A-1', summary: 'Benefício na home' },
      { key: 'A-2', summary: 'Login' },
    ];
    assert.deepEqual(
      matchIssues(issues, 'benef HOME').map((i) => i.key),
      ['A-1'],
    );
    assert.deepEqual(
      matchIssues(issues, 'a-2').map((i) => i.key),
      ['A-2'],
    );
  });

  it('põe quem começa com o termo antes de quem só contém', () => {
    const choices = [{ keywords: 'refactor' }, { keywords: 'feat' }];
    assert.deepEqual(rankChoices(choices, 'f'), [{ keywords: 'feat' }, { keywords: 'refactor' }]);
    assert.deepEqual(rankChoices(choices, 'zzz'), []);
  });
});

describe('jql', () => {
  it('filtra suas atividades por status ou pelas abertas', () => {
    assert.match(myIssuesJql('APP', ['1', '2']), /status IN \(1, 2\)/);
    assert.match(myIssuesJql('APP', null), /statusCategory != Done/);
  });

  it('busca no projeto pela chave ou pelo título', () => {
    assert.equal(projectSearchJql('APP', '12'), 'key = APP-12');
    assert.equal(projectSearchJql('APP', 'app-12'), 'key = APP-12');
    assert.match(projectSearchJql('APP', 'README.md'), /summary ~ "README\*" AND summary ~ "md\*"/);
    assert.equal(projectSearchJql('APP', 'a'), null);
  });
});

describe('documento', () => {
  it('separa os parágrafos do corpo e do comentário', () => {
    assert.deepEqual(bodyParagraphs('um\n\n dois \n\n\n'), ['um', 'dois']);
    assert.deepEqual(commentParagraphs('primeira | segunda |  '), ['primeira', 'segunda']);
    assert.deepEqual(commentParagraphs('  |  '), []);
  });

  it('monta o ADF com parágrafos e a lista de arquivos', () => {
    const doc = adfDocument({ paragraphs: ['um', 'dois'], files: ['M a.js'], filesTitle: 'Arquivos alterados' });
    assert.deepEqual(
      doc.content.map((n) => n.type),
      ['paragraph', 'paragraph', 'heading', 'bulletList'],
    );
    assert.deepEqual(doc.content[3].content[0].content[0].content[0].marks, [{ type: 'code' }]);
    assert.equal(adfDocument({}), undefined);
  });

  it('monta o wiki markup do Jira Server', () => {
    assert.equal(
      wikiText({ paragraphs: ['um', 'dois'], files: ['M a.js'], filesTitle: 'Arquivos alterados' }),
      'um\n\ndois\n\nh4. Arquivos alterados\n\n* {{M a.js}}',
    );
    assert.equal(wikiText({}), undefined);
  });

  it('monta a descrição da atividade com o corpo, o BREAKING CHANGE e os arquivos', () => {
    const commit = { body: 'corpo da mensagem', details: { body: 'das perguntas', breaking: 'muda a API' } };
    assert.deepEqual(issueDescription(commit, ['M a.js']), {
      paragraphs: ['das perguntas', 'BREAKING CHANGE: muda a API', 'corpo da mensagem'],
      files: ['M a.js'],
    });
    assert.deepEqual(issueDescription({ body: '', details: {} }), { paragraphs: [], files: [] });
  });
});

describe('runSteps', () => {
  const answer = (...values) => {
    const queue = [...values];
    return () => queue.shift();
  };

  it('volta ao passo anterior e guarda só as respostas válidas', async () => {
    const a = answer('a1', 'a2');
    const b = answer(BACK, 'b2');
    const state = await runSteps([
      { key: 'a', run: a },
      { key: 'b', run: b },
    ]);
    assert.deepEqual(state, { a: 'a2', b: 'b2' });
  });

  it('pula passos com when falso também na volta', async () => {
    const c = answer(BACK, 'c2');
    const a = answer('a1', 'a2');
    const state = await runSteps([
      { key: 'a', run: a },
      { key: 'b', when: () => false, run: () => 'nunca' },
      { key: 'c', run: c },
    ]);
    assert.deepEqual(state, { a: 'a2', c: 'c2' });
  });

  it('devolve BACK no primeiro passo e o valor de exit', async () => {
    assert.equal(await runSteps([{ run: () => BACK }]), BACK);
    assert.equal(await runSteps([{ run: () => exit('saiu') }, { run: () => assert.fail() }]), 'saiu');
  });

  it('com resume começa no último passo e volta para os anteriores', async () => {
    const calls = [];
    const state = await runSteps(
      [
        { key: 'a', run: () => (calls.push('a'), 'a2') },
        { key: 'b', run: () => (calls.push('b'), calls.length === 1 ? BACK : 'b2') },
      ],
      { a: 'a1', b: 'b1' },
      { resume: true },
    );
    assert.deepEqual(calls, ['b', 'a', 'b']);
    assert.deepEqual(state, { a: 'a2', b: 'b2' });
  });
});

describe('validate', () => {
  const schema = JSON.parse(readFileSync(new URL('../schema/jira-commit.schema.json', import.meta.url), 'utf8'));

  it('aceita uma config completa', () => {
    const cfg = {
      $schema: './x.json',
      projectKey: 'LOJA',
      issueType: 'Mobile',
      statuses: ['Em andamento'],
      maxResults: 100,
      storyPointsScale: [1, 2, 3],
      autoLinkBranch: true,
      commit: { types: ['chore', { value: 'feat', description: 'x' }], scopes: ['home'], headerMaxLength: 120 },
    };
    assert.deepEqual(validate(schema, cfg), { errors: [], warnings: [] });
    assert.deepEqual(validate(schema, { projectKey: 'APP', commit: false }).errors, []);
  });

  it('aponta cada erro com o caminho do campo', () => {
    const { errors } = validate(schema, {
      projectKey: 'app',
      maxResults: 0,
      statuses: 'Em andamento',
      commit: { types: [{ description: 'sem value' }, 3] },
    });
    assert.deepEqual(errors, [
      'projectKey está num formato inválido (ex.: APP)',
      'maxResults deve ser no mínimo 1',
      'statuses deve ser lista',
      'commit.types[0].value é obrigatório',
      'commit.types[1] deve ser texto ou objeto',
    ]);
  });

  it('exige projectKey e só avisa sobre campos desconhecidos', () => {
    const { errors, warnings } = validate(schema, { campoNovo: 1 });
    assert.deepEqual(errors, ['projectKey é obrigatório']);
    assert.deepEqual(warnings, ['campoNovo não é um campo conhecido']);
  });

  it('rejeita commit: true', () => {
    assert.deepEqual(validate(schema, { projectKey: 'APP', commit: true }).errors, ['commit deve ser false ou objeto']);
  });
});

describe('hook-script', () => {
  const block = HOOK_BLOCK.join('\n');

  it('cria o hook do zero', () => {
    assert.equal(withHookBlock(null), `#!/bin/sh\n${block}\n`);
  });

  it('acrescenta no fim de um hook que já existe, sem apagar nada', () => {
    assert.equal(withHookBlock('#!/bin/sh\nnpx lint\n'), `#!/bin/sh\nnpx lint\n\n${block}\n`);
  });

  it('troca a linha antiga do npx pelo bloco novo no mesmo lugar', () => {
    const legacy =
      '#!/bin/sh\n\n# jira-commit\nif sh -c ": >/dev/tty" 2>/dev/null; then npx --no-install jira-commit hook "$1" "$2" < /dev/tty; fi\nnpx outro\n';
    assert.ok(isLegacy(legacy));
    const updated = withHookBlock(legacy);
    assert.equal(updated, `#!/bin/sh\n\n${block}\nnpx outro\n`);
    assert.ok(hasCurrentBlock(updated) && !isLegacy(updated));
  });

  it('não muda um hook que já está atualizado', () => {
    const current = withHookBlock('#!/bin/sh\nnpx lint\n');
    assert.equal(withHookBlock(current), current);
  });

  it('tira o commitizen quando pedido', () => {
    const script = '#!/bin/sh\nexec < /dev/tty && npx cz --hook || true\n';
    assert.ok(hasCz(script));
    assert.ok(!hasCz(withHookBlock(script, { removeCz: true })));
  });
});

describe('truncateVisible', () => {
  it('corta pelo texto visível e mantém as cores', () => {
    const colored = '\x1b[92mverde\x1b[39m e \x1b[96mciano\x1b[39m';
    assert.equal(truncateVisible(colored, 50), colored);
    const cut = truncateVisible(colored, 8);
    assert.equal(stripVTControlCharacters(cut), 'verde e…');
    assert.ok(cut.startsWith('\x1b[92mverde'));
    assert.ok(cut.endsWith('\x1b[0m'));
    assert.equal(truncateVisible('sem cor nenhuma', 7), 'sem co…');
  });
});
