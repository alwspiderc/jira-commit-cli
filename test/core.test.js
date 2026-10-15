import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  commitBody,
  detailLines,
  formatMessage,
  issueKeyRegex,
  keyReserve,
  splitConventional,
} from '../src/core/commit-message.js';
import { commitOptions, fromCz } from '../src/core/commit-options.js';
import { capitalizeTitle, mostCommonProduct, productOf, resolvePrefix } from '../src/core/issue-title.js';
import { buildTree } from '../src/core/issue-tree.js';
import { matchIssues, rankChoices } from '../src/core/issue-match.js';
import { myIssuesJql, projectSearchJql } from '../src/core/jql.js';
import { commitDescription } from '../src/core/adf.js';

describe('commit-message', () => {
  it('separa o prefixo Conventional Commits', () => {
    assert.deepEqual(splitConventional('feat(home): adiciona card'), { prefix: 'feat(home): ', subject: 'adiciona card' });
    assert.deepEqual(splitConventional('fix!: corrige'), { prefix: 'fix!: ', subject: 'corrige' });
    assert.deepEqual(splitConventional('adiciona card'), { prefix: '', subject: 'adiciona card' });
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

describe('adf', () => {
  it('monta parágrafos e a lista de arquivos', () => {
    const doc = commitDescription({ body: 'um\n\ndois', files: ['M a.js'] });
    assert.deepEqual(
      doc.content.map((n) => n.type),
      ['paragraph', 'paragraph', 'heading', 'bulletList'],
    );
    assert.deepEqual(doc.content[3].content[0].content[0].content[0].marks, [{ type: 'code' }]);
    assert.equal(commitDescription({}), undefined);
  });
});
