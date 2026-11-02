import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectInput, isValidIsbn } from '../src/services/detect.ts';

test('DOI solto, com prefixo e pelo doi.org', () => {
  assert.deepEqual(detectInput('10.1590/S1413-24782020000100001'), { method: 'doi', value: '10.1590/S1413-24782020000100001' });
  assert.deepEqual(detectInput('doi: 10.1000/xyz123.'), { method: 'doi', value: '10.1000/xyz123' });
  assert.deepEqual(detectInput('https://doi.org/10.1038/nphys1170'), { method: 'doi', value: '10.1038/nphys1170' });
  assert.deepEqual(detectInput('http://dx.doi.org/10.1016/j.cell.2009.01.002'), { method: 'doi', value: '10.1016/j.cell.2009.01.002' });
});

test('ISBN 10 e 13 com dígito verificador', () => {
  assert.ok(isValidIsbn('978-85-359-0277-8'));
  assert.ok(isValidIsbn('0-306-40615-2'));
  assert.ok(!isValidIsbn('978-85-359-0277-9'));
  assert.deepEqual(detectInput('ISBN 978-85-359-0277-8'), { method: 'isbn', value: '9788535902778' });
  assert.equal(detectInput('1234567890123'), null);
});

test('arXiv vira link do resumo', () => {
  assert.deepEqual(detectInput('arXiv:2101.00001v2'), { method: 'url', value: 'https://arxiv.org/abs/2101.00001v2' });
  assert.deepEqual(detectInput('https://arxiv.org/pdf/1706.03762.pdf'), { method: 'url', value: 'https://arxiv.org/abs/1706.03762' });
  assert.deepEqual(detectInput('https://arxiv.org/abs/1706.03762'), { method: 'url', value: 'https://arxiv.org/abs/1706.03762' });
});

test('links e textos comuns', () => {
  assert.deepEqual(detectInput('https://www.scielo.br/j/rbedu/a/abc'), { method: 'url', value: 'https://www.scielo.br/j/rbedu/a/abc' });
  assert.deepEqual(detectInput('www.exemplo.com/artigo'), { method: 'url', value: 'https://www.exemplo.com/artigo' });
  assert.equal(detectInput('uma frase qualquer'), null);
  assert.equal(detectInput(''), null);
});
