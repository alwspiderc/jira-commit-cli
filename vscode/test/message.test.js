import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { linkMessage } from '../src/message.js';
import { normalizeRoot } from '../src/repo-config.js';

const cfg = { projectKey: 'KAN', format: '{prefix}{key} {subject}' };

describe('linkMessage', () => {
  it('mensagem vazia: só a chave, pronta para continuar digitando', () => {
    assert.equal(linkMessage(cfg, '', 'KAN-7'), 'KAN-7 ');
  });

  it('põe a chave depois do tipo e do escopo', () => {
    assert.equal(linkMessage(cfg, 'feat(home): adiciona card', 'KAN-7'), 'feat(home): KAN-7 adiciona card');
  });

  it('troca a chave que já estava', () => {
    assert.equal(linkMessage(cfg, 'feat(home): KAN-1 adiciona card', 'KAN-7'), 'feat(home): KAN-7 adiciona card');
  });

  it('só mexe na primeira linha', () => {
    assert.equal(linkMessage(cfg, 'fix: corrige foco\n\ncorpo do commit', 'KAN-7'), 'fix: KAN-7 corrige foco\n\ncorpo do commit');
  });

  it('segue o format do repositório', () => {
    assert.equal(linkMessage({ projectKey: 'KAN', format: '{key}: {message}' }, 'feat: x', 'KAN-7'), 'KAN-7: feat: x');
  });
});

describe('normalizeRoot', () => {
  it('no Windows, escreve a raiz como o git (barras normais e letra do disco maiúscula)', () => {
    assert.equal(normalizeRoot('c:\\Users\\ester\\app', 'win32'), 'C:/Users/ester/app');
  });

  it('fora do Windows, não mexe', () => {
    assert.equal(normalizeRoot('/home/ester/app', 'linux'), '/home/ester/app');
  });
});
