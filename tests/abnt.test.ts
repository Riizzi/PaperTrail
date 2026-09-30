import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatReferenceABNT, formatCitationABNT, formatCollectionABNT, parseAuthorsList } from '../src/services/abnt.ts';
import type { ReferenceItem } from '../src/types.ts';

const base = (over: Partial<ReferenceItem>): ReferenceItem => ({
  id: 'x', userId: 'u', type: 'article', title: 'T', status: 'to_read', isFavorite: false,
  tags: [], collectionIds: [], createdAt: '', updatedAt: '', ...over,
});

test('autores: formatos comuns', () => {
  const names = (s: string) => parseAuthorsList(s).map(a => a.fullABNT);
  assert.deepEqual(names('João Pedro da Silva; Maria Clara Santos'), ['SILVA, João Pedro da', 'SANTOS, Maria Clara']);
  assert.deepEqual(names('João Pedro da Silva, Maria Clara Santos'), ['SILVA, João Pedro da', 'SANTOS, Maria Clara']);
  assert.deepEqual(names('João Silva, Maria Souza e Pedro Lima'), ['SILVA, João', 'SOUZA, Maria', 'LIMA, Pedro']);
  assert.deepEqual(names('Silva, João Pedro'), ['SILVA, João Pedro']);
  assert.deepEqual(names('Freire, Paulo; Shor, Ira'), ['FREIRE, Paulo', 'SHOR, Ira']);
  assert.deepEqual(names('Antonio Carlos Silva Filho'), ['SILVA FILHO, Antonio Carlos']);
});

test('artigo completo', () => {
  const r = formatReferenceABNT(base({
    authors: 'Silva, João; Souza, Maria', title: 'Ensino remoto', subtitle: 'desafios',
    publication: 'Revista Brasileira de Educação', place: 'Rio de Janeiro', volume: '25', number: '2', pages: '1-20', year: '2020', doi: 'https://doi.org/10.1590/abc',
  }));
  assert.equal(r.plain, 'SILVA, João; SOUZA, Maria. Ensino remoto: desafios. Revista Brasileira de Educação, Rio de Janeiro, v. 25, n. 2, p. 1-20, 2020. DOI: 10.1590/abc.');
  assert.match(r.html, /<b>Revista Brasileira de Educação<\/b>/);
});

test('artigo sem periódico e sem local não deixa vírgula sobrando', () => {
  const r = formatReferenceABNT(base({ authors: 'Ana Lima', title: 'X', volume: '3', year: '2021' }));
  assert.equal(r.plain, 'LIMA, Ana. X. v. 3, 2021.');
  assert.ok(r.missingFields.includes('periódico'));
});

test('livro e sem ano', () => {
  const r = formatReferenceABNT(base({ type: 'book', authors: 'Paulo Freire', title: 'Pedagogia do oprimido', edition: '17. ed.', place: 'Rio de Janeiro', publisher: 'Paz e Terra' }));
  assert.equal(r.plain, 'FREIRE, Paulo. Pedagogia do oprimido. 17. ed. Rio de Janeiro: Paz e Terra, [20--?].');
  assert.ok(r.missingFields.includes('ano'));
});

test('evento: negrito em Anais', () => {
  const r = formatReferenceABNT(base({ type: 'conference', authors: 'Ana Lima', title: 'Y', publication: 'Congresso Brasileiro de Educação', number: '10', year: '2018', place: 'Recife', publisher: 'UFPE', pages: '5-9' }));
  assert.equal(r.plain, 'LIMA, Ana. Y. In: CONGRESSO BRASILEIRO DE EDUCAÇÃO, 10., 2018, Recife. Anais [...]. Recife: UFPE, 2018. p. 5-9.');
  assert.match(r.html, /<b>Anais<\/b>/);
  assert.doesNotMatch(r.html, /<b>CONGRESSO/);
});

test('citações', () => {
  const c = formatCitationABNT(base({ authors: 'Silva, João; Souza, Maria', year: '2023' }), '34');
  assert.equal(c.indirect, '(SILVA; SOUZA, 2023)');
  assert.equal(c.direct, '(SILVA; SOUZA, 2023, p. 34)');
  assert.equal(c.inText, 'Silva e Souza (2023)');
  const et = formatCitationABNT(base({ authors: 'A B; C D; E F; G H', year: '2020' }));
  assert.equal(et.indirect, '(B et al., 2020)');
});

test('coleção ordenada por sobrenome', () => {
  const r = formatCollectionABNT([
    base({ authors: 'Zélia Almeida', title: 'A', year: '2020' }),
    base({ authors: 'Bruno Zanetti', title: 'B', year: '2020' }),
  ]);
  assert.ok(r.plain.startsWith('ALMEIDA'));
});

test('HTML escapado', () => {
  const r = formatReferenceABNT(base({ type: 'book', title: 'A <b> & C', year: '2020' }));
  assert.match(r.html, /A &lt;b&gt; &amp; C/);
});
