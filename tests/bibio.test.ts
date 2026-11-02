import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBibTeX, parseRIS, parseReferences, cleanLatex, exportToRIS, dedupeKeys } from '../src/services/bibio.ts';
import { formatReferenceABNT, exportToBibTeX } from '../src/services/abnt.ts';
import type { ReferenceItem } from '../src/types.ts';

const BIB = `
@comment{exportado pelo Zotero}
@article{silva2020,
  title = {Ensino remoto: desafios da {Educa\\c{c}\\~ao}},
  author = {Silva, Jo{\\~a}o and Maria Souza},
  journal = "Revista Brasileira de Educa{\\c c}{\\~a}o",
  year = 2020,
  volume = {25}, number = {2}, pages = {1--20},
  doi = {https://doi.org/10.1590/abc},
  keywords = {educação, ensino remoto}
}

@incollection{lima2019,
  title = {Um capítulo},
  author = {Lima, Pedro},
  booktitle = {Livro organizado},
  editor = {Costa, Ana},
  publisher = {Editora X},
  address = {São Paulo},
  year = {2019}
}

@phdthesis{t1, title={Tese qualquer}, author={Rocha, Bia}, school={USP}, year={2021}}
`;

test('BibTeX: artigo com acentos LaTeX, DOI e páginas', () => {
  const [a, b, c] = parseBibTeX(BIB);
  assert.equal(a.type, 'article');
  assert.equal(a.title, 'Ensino remoto');
  assert.equal(a.subtitle, 'desafios da Educação');
  assert.equal(a.authors, 'Silva, João; Maria Souza');
  assert.equal(a.publication, 'Revista Brasileira de Educação');
  assert.equal(a.year, '2020');
  assert.equal(a.pages, '1-20');
  assert.equal(a.doi, '10.1590/abc');
  assert.deepEqual(a.tags, ['educação', 'ensino remoto']);

  assert.equal(b.type, 'chapter');
  assert.equal(b.bookTitle, 'Livro organizado');
  assert.equal(b.bookOrganizer, 'Costa, Ana');
  assert.equal(b.place, 'São Paulo');

  assert.equal(c.type, 'thesis');
  assert.equal(c.institution, 'USP');
  assert.equal(c.degree, 'Tese (Doutorado)');
});

test('BibTeX importado sai certo em ABNT', () => {
  const [a] = parseBibTeX(BIB);
  const item = { id: 'x', userId: 'u', status: 'to_read', isFavorite: false, collectionIds: [], createdAt: '', updatedAt: '', ...a } as ReferenceItem;
  assert.equal(
    formatReferenceABNT(item).plain,
    'SILVA, João; SOUZA, Maria. Ensino remoto: desafios da Educação. Revista Brasileira de Educação, v. 25, n. 2, p. 1-20, 2020. DOI: 10.1590/abc.'
  );
});

test('cleanLatex', () => {
  assert.equal(cleanLatex("Jos{\\'e} M{\\\"u}ller \\& {DNA}"), 'José Müller & DNA');
});

const RIS = `TY  - JOUR
TI  - Ensino remoto: desafios
AU  - Silva, João
AU  - Souza, Maria
PY  - 2020/05/01
JO  - Revista Brasileira de Educação
VL  - 25
IS  - 2
SP  - 1
EP  - 20
DO  - 10.1590/abc
KW  - educação
ER  -

TY  - BOOK
TI  - Pedagogia do oprimido
AU  - Freire, Paulo
PB  - Paz e Terra
CY  - Rio de Janeiro
PY  - 1987
SN  - 9788577534371
ER  - `;

test('RIS: artigo e livro', () => {
  const [a, b] = parseRIS(RIS);
  assert.equal(a.type, 'article');
  assert.equal(a.authors, 'Silva, João; Souza, Maria');
  assert.equal(a.year, '2020');
  assert.equal(a.pages, '1-20');
  assert.equal(a.subtitle, 'desafios');
  assert.equal(b.type, 'book');
  assert.equal(b.publisher, 'Paz e Terra');
  assert.equal(b.isbn, '9788577534371');
});

test('detecta o formato pelo conteúdo', () => {
  assert.equal(parseReferences(RIS).length, 2);
  assert.equal(parseReferences(BIB).length, 3);
  assert.equal(parseReferences('texto qualquer').length, 0);
});

test('RIS exportado volta igual na leitura', () => {
  const [a] = parseRIS(RIS);
  const item = { id: 'x', userId: 'u', status: 'to_read', isFavorite: false, collectionIds: [], createdAt: '', updatedAt: '', ...a } as ReferenceItem;
  const [back] = parseRIS(exportToRIS([item]));
  assert.equal(back.title, 'Ensino remoto');
  assert.equal(back.authors, 'Silva, João; Souza, Maria');
  assert.equal(back.pages, '1-20');
  assert.equal(back.doi, '10.1590/abc');
});

test('duplicados por DOI ou título + ano', () => {
  assert.deepEqual(dedupeKeys({ doi: '10.1/ABC', title: 'Título Á', year: '2020' }), ['doi:10.1/abc', 't:tituloa:2020']);
});

test('BibTeX exportado: chaves únicas e leitura de volta', () => {
  const base = { userId: 'u', type: 'article' as const, status: 'to_read' as const, isFavorite: false, tags: [], collectionIds: [], createdAt: '', updatedAt: '' };
  const bib = exportToBibTeX([
    { ...base, id: '1', title: 'A', authors: 'João Silva', year: '2020', doi: '10.1/a' },
    { ...base, id: '2', title: 'B', authors: 'Ana Silva', year: '2020' },
    { ...base, id: '3', title: 'C', authors: 'Lúcia Ávila', year: '2021' },
  ] as ReferenceItem[]);
  assert.match(bib, /@article\{silva2020,/);
  assert.match(bib, /@article\{silva2020a,/);
  assert.match(bib, /@article\{avila2021,/);
  const back = parseBibTeX(bib);
  assert.equal(back.length, 3);
  assert.equal(back[0].doi, '10.1/a');
});
