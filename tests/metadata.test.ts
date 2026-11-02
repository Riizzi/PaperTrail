import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isScieloUrl, scieloPid } from '../api/_lib/scielo';
import { isAggregatorPublisher, pageText, metaFromHtml } from '../api/_lib/metadata';

test('reconhece links do SciELO e o PID do formato antigo', () => {
  assert.ok(isScieloUrl('https://www.scielo.br/j/rap/a/B4kVmkS5jHTgWh3jjStnS8H/?lang=pt'));
  assert.ok(isScieloUrl('https://www.scielosp.org/article/rsp/2020.v54/1/'));
  assert.ok(isScieloUrl('http://www.scielo.org.co/scielo.php?script=sci_arttext&pid=S0120-55522020000100001'));
  assert.ok(!isScieloUrl('https://blog.example.com/scielo'));
  assert.equal(
    scieloPid('https://www.scielo.br/scielo.php?script=sci_arttext&pid=S0034-76122020000100001&lng=pt'),
    'S0034-76122020000100001'
  );
  assert.equal(scieloPid('https://www.scielo.br/j/rap/a/B4kVmkS5jHTgWh3jjStnS8H/'), null);
});

test('editora do CrossRef que só distribui o DOI é descartada', () => {
  assert.ok(isAggregatorPublisher('FapUNIFESP (SciELO)'));
  assert.ok(isAggregatorPublisher('SciELO Agencia Nacional de Investigacion y Desarrollo (ANID)'));
  assert.ok(!isAggregatorPublisher('Fundação Getulio Vargas'));
});

test('texto da página para a IA pula menus e usa o conteúdo principal', () => {
  const menu = '<nav>' + 'Menu Revistas Coleções '.repeat(200) + '</nav>';
  const article = '<article><h1>Título do artigo</h1><p>' + 'Texto do artigo. '.repeat(50) + '</p></article>';
  const html = `<html><head><script>var x=1</script></head><body>${menu}<div>lateral</div>${article}<footer>rodapé</footer></body></html>`;
  const text = pageText(html);
  assert.ok(text.startsWith('Título do artigo'));
  assert.ok(!text.includes('Menu Revistas'));
  assert.ok(!text.includes('rodapé'));
});

test('metatags guardam o ISSN para consultar a revista', () => {
  const html = '<meta name="citation_title" content="T"><meta name="citation_issn" content="0034-7612">';
  assert.equal(metaFromHtml(html, 'https://x.org').issn, '0034-7612');
});
