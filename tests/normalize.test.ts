import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixAuthors, fixNameCase, splitSubtitle, cleanAbstract, normalizeMetadata } from '../src/services/normalize';

test('nomes em caixa alta (CrossRef/SciELO) viram maiúsculas normais', () => {
  assert.equal(
    fixAuthors('CARVALHO, RICARDO VINICIUS C. DOS SANTOS E; PAULA, ANA PAULA PAES DE'),
    'Carvalho, Ricardo Vinicius C. dos Santos e; Paula, Ana Paula Paes de'
  );
  assert.equal(fixNameCase("D'ÁVILA, JEAN-PAUL"), "D'Ávila, Jean-Paul");
  assert.equal(fixNameCase('SILVA, JOÃO II'), 'Silva, João II');
});

test('nomes que já estão certos e siglas não mudam', () => {
  assert.equal(fixAuthors('Aquino, André Carlos Busanelli de; McDonald, Ian'), 'Aquino, André Carlos Busanelli de; McDonald, Ian');
  assert.equal(fixNameCase('IBGE'), 'IBGE');
  assert.equal(fixNameCase('BRASIL. Ministério da Saúde'), 'BRASIL. Ministério da Saúde');
});

test('subtítulo é separado no primeiro dois-pontos', () => {
  assert.deepEqual(splitSubtitle('Reavaliando o paradigma: a burocracia racional-legal pré-1930'), {
    title: 'Reavaliando o paradigma',
    subtitle: 'a burocracia racional-legal pré-1930',
  });
  assert.deepEqual(splitSubtitle('Sem subtítulo'), { title: 'Sem subtítulo' });
  assert.deepEqual(splitSubtitle('Parte 2: o retorno'), { title: 'Parte 2: o retorno' });
});

test('rótulo de resumo sai do começo', () => {
  assert.equal(cleanAbstract('RESUMO Este artigo discute'), 'Este artigo discute');
  assert.equal(cleanAbstract('Abstract: The idea'), 'The idea');
  assert.equal(cleanAbstract('Resumos de pesquisa'), 'Resumos de pesquisa');
});

test('normalizeMetadata junta tudo e respeita subtítulo já informado', () => {
  const out = normalizeMetadata({
    title: 'POLÍTICAS PÚBLICAS: TEORIA E PRÁTICA',
    authors: 'SOUZA, CELINA',
    abstract: 'RESUMO O texto',
  });
  assert.equal(out.title, 'Políticas públicas');
  assert.equal(out.subtitle, 'teoria e prática');
  assert.equal(out.authors, 'Souza, Celina');
  assert.equal(out.abstract, 'O texto');

  const kept = normalizeMetadata({ title: 'Título: com dois-pontos', subtitle: 'já veio' });
  assert.equal(kept.title, 'Título: com dois-pontos');
  assert.equal(kept.subtitle, 'já veio');
});
