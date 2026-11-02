import type { Meta } from './metadata.js';

/**
 * SciELO pela API pública ArticleMeta (articlemeta.scielo.org), sem IA.
 * Ela traz o que as metatags e o CrossRef não trazem bem: título no idioma original,
 * editora de verdade (o CrossRef diz "FapUNIFESP (SciELO)"), cidade, volume, número e páginas.
 * Também funciona quando o site da coleção recusa o nosso acesso.
 */

const API = 'https://articlemeta.scielo.org/api/v1';

export function isScieloUrl(url: string): boolean {
  try {
    return /(^|\.)scielo(sp)?\.|^scielo\./i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** PID do formato antigo: scielo.php?script=sci_arttext&pid=S0034-76122020000100001 */
export function scieloPid(url: string): string | null {
  try {
    const pid = new URL(url).searchParams.get('pid') || '';
    return /^S\d{4}-\d{3}[\dX]\d{13}$/i.test(pid) ? pid.toUpperCase() : null;
  } catch {
    return null;
  }
}

async function getJson(url: string, timeoutMs = 8000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Coleções conhecidas; a lista completa vem da API na primeira consulta
const KNOWN: Record<string, string> = {
  'scielo.br': 'scl',
  'scielosp.org': 'spa',
  'scielo.org.co': 'col',
  'scielo.org.ar': 'arg',
  'scielo.cl': 'chl',
  'scielo.org.mx': 'mex',
  'scielo.pt': 'prt',
  'scielo.isciii.es': 'esp',
  'scielo.org.pe': 'per',
  'scielo.sld.cu': 'cub',
  'scielo.edu.uy': 'ury',
  'scielo.org.za': 'sza',
};
let collectionsCache: Record<string, string> | null = null;

async function collectionFor(host: string): Promise<string | null> {
  const h = host.toLowerCase().replace(/^www\./, '');
  if (KNOWN[h]) return KNOWN[h];
  if (!collectionsCache) {
    const list = await getJson(`${API}/collection/identifiers/`);
    collectionsCache = {};
    if (Array.isArray(list)) {
      for (const c of list) if (c?.domain && c?.code) collectionsCache[String(c.domain).replace(/^www\./, '')] = c.code;
    }
  }
  return collectionsCache[h] || null;
}

const first = (field: any): string => (Array.isArray(field) ? String(field[0]?._ ?? '').trim() : '');

/** Item na língua pedida, ou o primeiro */
function inLang(field: any, lang: string, key = '_'): string {
  if (!Array.isArray(field)) return '';
  const hit = field.find((f: any) => f?.l === lang && f?.[key]) || field.find((f: any) => f?.[key]);
  return hit ? String(hit[key]).replace(/\s+/g, ' ').trim() : '';
}

function journalFields(t: any): Meta {
  if (!t) return {};
  return {
    publication: first(t.v100),
    publisher: Array.isArray(t.v480) ? t.v480.map((p: any) => p?._).filter(Boolean).join('; ') : '',
    place: first(t.v490),
  };
}

export async function scieloArticle(pid: string, host: string): Promise<Meta | null> {
  const collection = await collectionFor(host);
  const j = await getJson(`${API}/article/?code=${encodeURIComponent(pid)}${collection ? `&collection=${collection}` : ''}`);
  const a = j?.article;
  if (!a) return null;

  const lang = first(a.v40) || 'pt';
  const authors = Array.isArray(a.v10)
    ? a.v10
        .map((p: any) => [p?.s, p?.n].filter(Boolean).join(', '))
        .filter(Boolean)
        .join('; ')
    : '';
  const pagesField = Array.isArray(a.v14) ? a.v14.find((p: any) => p?.f) : null;
  const pages = pagesField ? [pagesField.f, pagesField.l].filter(Boolean).join('-') : '';
  const issue = j.issue?.issue || {};

  return {
    type: 'article',
    title: inLang(a.v12, lang),
    authors,
    year: String(j.publication_year || '').match(/\d{4}/)?.[0] || '',
    ...journalFields(j.title),
    volume: first(issue.v31),
    number: first(issue.v32),
    pages,
    doi: String(j.doi || '').trim(),
    abstract: inLang(a.v83, lang, 'a'),
  };
}

/** Revista pelo ISSN (aceita vários, separados por vírgula): editora e cidade */
export async function scieloJournal(issns: string): Promise<Meta | null> {
  for (const issn of issns.split(/[,;\s]+/).filter((i) => /^\d{4}-\d{3}[\dX]$/i.test(i)).slice(0, 3)) {
    let j = await getJson(`${API}/journal/?issn=${encodeURIComponent(issn)}`);
    if (Array.isArray(j)) j = j[0];
    const fields = journalFields(j);
    if (fields.publisher || fields.place) return fields;
  }
  return null;
}
