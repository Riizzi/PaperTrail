import assert from 'node:assert/strict';
import { test } from 'node:test';
import { searchItems, scoreItem, fold } from '../src/services/search.ts';
import type { ReferenceItem } from '../src/types.ts';

const item = (over: Partial<ReferenceItem>): ReferenceItem => ({
  id: over.title || 'x', userId: 'u', type: 'article', title: 'T', status: 'to_read', isFavorite: false,
  tags: [], collectionIds: [], createdAt: '', updatedAt: '', ...over,
});

test('sem acento e sem diferenciar maiúsculas', () => {
  assert.equal(fold('Educação À Distância'), 'educacao a distancia');
  assert.ok(scoreItem(item({ title: 'Educação remota' }), 'educacao') > 0);
  assert.ok(scoreItem(item({ title: 'educacao remota' }), 'EDUCAÇÃO') > 0);
});

test('todas as palavras precisam aparecer, em qualquer campo', () => {
  const it = item({ title: 'Ensino remoto', authors: 'Paulo Freire', year: '2020' });
  assert.ok(scoreItem(it, 'freire 2020') > 0);
  assert.equal(scoreItem(it, 'freire 2021'), 0);
});

test('acha em resumo, palavras-chave, DOI e apontamentos', () => {
  assert.ok(scoreItem(item({ abstract: 'Estudo sobre letramento digital' }), 'letramento') > 0);
  assert.ok(scoreItem(item({ keywords: ['neurociência'] }), 'neurociencia') > 0);
  assert.ok(scoreItem(item({ doi: '10.1590/abc' }), '10.1590') > 0);
  assert.ok(scoreItem(item({ notesList: [{ id: 'n', text: 'citar na introdução', createdAt: '', updatedAt: '' }] }), 'introducao') > 0);
});

test('título pesa mais que resumo', () => {
  const noTitulo = item({ title: 'Avaliação formativa' });
  const noResumo = item({ title: 'Outro', abstract: 'fala de avaliação formativa' });
  assert.deepEqual(searchItems([noResumo, noTitulo], 'avaliação').map((i) => i.title), ['Avaliação formativa', 'Outro']);
});
