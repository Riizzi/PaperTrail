import { getDocumentProxy, extractText, extractTextItems, getMeta } from 'unpdf';

/**
 * Extração de metadados SEM IA:
 * 1. DOI encontrado no texto/página -> CrossRef (dados exatos)
 * 2. Metatags acadêmicas das páginas (citation_*, padrão do Google Acadêmico)
 * 3. Heurísticas no PDF (maior fonte da 1ª página = título, propriedades do arquivo, seção Resumo/Abstract)
 * A IA fica só como reforço quando nada disso resolve.
 */

export type Meta = Record<string, any>;

const DOI_RE = /\b(10\.\d{4,9}\/[^\s"'<>{}|\\^`\[\]]+)/i;

export function findDoi(text: string): string | null {
  const m = text.match(DOI_RE);
  if (!m) return null;
  return m[1].replace(/[).,;:]+$/, '');
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export async function crossrefLookup(doi: string): Promise<Meta | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}?mailto=papertrail@users.noreply.github.com`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const m = (await res.json())?.message;
    if (!m) return null;

    const crType = m.type;
    const type =
      crType === 'book' || crType === 'monograph' ? 'book'
      : crType === 'book-chapter' || crType === 'book-section' ? 'chapter'
      : crType === 'proceedings-article' ? 'conference'
      : crType === 'dissertation' ? 'thesis'
      : 'article';

    const authors = Array.isArray(m.author)
      ? m.author
          .map((a: any) => (a.family && a.given ? `${a.family}, ${a.given}` : a.name || a.family || a.given || ''))
          .filter(Boolean)
          .join('; ')
      : '';

    const dateParts = (m['published-print'] || m['published-online'] || m.issued || m.created)?.['date-parts']?.[0];

    return {
      type,
      title: m.title?.[0] || '',
      subtitle: m.subtitle?.[0] || '',
      authors,
      year: dateParts?.[0] ? String(dateParts[0]) : '',
      publication: m['container-title']?.[0] || '',
      publisher: m.publisher || '',
      volume: m.volume ? String(m.volume) : '',
      number: m.issue ? String(m.issue) : '',
      pages: m.page ? String(m.page) : '',
      doi: m.DOI || doi,
      url: m.URL || `https://doi.org/${doi}`,
      abstract: m.abstract ? stripTags(m.abstract).replace(/^(Abstract|Resumo)\s*/i, '') : '',
    };
  } catch {
    return null;
  }
}

/** Metatags acadêmicas (citation_*, dc.*) de uma página HTML */
export function metaFromHtml(html: string, url: string): Meta {
  const metas: Array<[string, string]> = [];
  const re = /<meta\s+[^>]*>/gi;
  let tag: RegExpExecArray | null;
  while ((tag = re.exec(html)) !== null) {
    const t = tag[0];
    const name = (t.match(/(?:name|property)\s*=\s*["']([^"']+)["']/i)?.[1] || '').toLowerCase();
    const content = t.match(/content\s*=\s*["']([^"']*)["']/i)?.[1];
    if (name && content) metas.push([name, decodeEntities(content.trim())]);
  }
  const get = (...names: string[]) => metas.find(([n]) => names.includes(n))?.[1] || '';
  const all = (...names: string[]) => metas.filter(([n]) => names.includes(n)).map(([, v]) => v);

  const date = get('citation_publication_date', 'citation_date', 'dc.date', 'article:published_time');
  const titleTag = decodeEntities(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || '');

  return {
    title: get('citation_title', 'dc.title', 'og:title') || titleTag,
    authors: all('citation_author', 'dc.creator').join('; ') || get('author'),
    year: date.match(/(1[5-9]\d{2}|20\d{2})/)?.[1] || '',
    publication: get('citation_journal_title', 'citation_conference_title', 'citation_book_title', 'og:site_name'),
    publisher: get('citation_publisher', 'dc.publisher'),
    volume: get('citation_volume'),
    number: get('citation_issue'),
    pages: [get('citation_firstpage'), get('citation_lastpage')].filter(Boolean).join('-'),
    doi: get('citation_doi', 'dc.identifier').replace(/^doi:\s*/i, '').match(DOI_RE)?.[1] || '',
    isbn: get('citation_isbn'),
    institution: get('citation_dissertation_institution'),
    abstract: get('citation_abstract', 'dc.description', 'description', 'og:description'),
    type: get('citation_journal_title') ? 'article'
      : get('citation_conference_title') ? 'conference'
      : get('citation_dissertation_institution') ? 'thesis'
      : get('citation_title') ? 'article'
      : 'webpage',
    url,
    hasCitationTags: Boolean(get('citation_title')),
  };
}

/** Leitura do PDF: texto das primeiras páginas, título pela maior fonte, propriedades do arquivo */
export async function readPdf(buffer: Buffer): Promise<{ firstPagesText: string; guess: Meta }> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));

  let firstPagesText = '';
  try {
    const { text } = await extractText(pdf);
    firstPagesText = (Array.isArray(text) ? text : [text]).slice(0, 3).join('\n\n').trim().slice(0, 20000);
  } catch {
    // segue sem texto
  }

  let title = '';
  try {
    const { items } = await extractTextItems(pdf);
    const page1 = (items[0] || []).filter((i) => i.str.trim().length > 1);
    if (page1.length) {
      const maxSize = Math.max(...page1.map((i) => i.fontSize || 0));
      const big = page1
        .filter((i) => (i.fontSize || 0) >= maxSize * 0.92)
        .sort((a, b) => b.y - a.y || a.x - b.x);
      title = big.map((i) => i.str.trim()).join(' ').replace(/\s+/g, ' ').trim();
      if (title.length > 300 || title.length < 4) title = '';
    }
  } catch {
    // segue sem título
  }

  let info: Record<string, any> = {};
  try {
    info = (await getMeta(pdf)).info || {};
  } catch {
    // segue sem propriedades
  }

  const infoTitle = typeof info.Title === 'string' ? info.Title.trim() : '';
  const infoAuthor = typeof info.Author === 'string' ? info.Author.trim() : '';
  const usefulInfoTitle = infoTitle && !/^(microsoft|untitled|sem título|documento|document\d*)\b|\.(docx?|pdf)$/i.test(infoTitle);

  const currentYear = new Date().getFullYear();
  const years = (firstPagesText.slice(0, 6000).match(/\b(19[5-9]\d|20\d{2})\b/g) || [])
    .map(Number)
    .filter((y) => y <= currentYear);

  const abstractMatch = firstPagesText.match(
    /(?:^|\n)\s*(?:RESUMO|Resumo|ABSTRACT|Abstract)\s*[:.\-–]?\s*([\s\S]{80,3000}?)(?:\n\s*(?:Palavras[- ]chave|PALAVRAS[- ]CHAVE|Keywords|KEYWORDS|Key words)|\n\s*\n\s*\n)/
  );

  return {
    firstPagesText,
    guess: {
      type: 'article',
      title: title || (usefulInfoTitle ? infoTitle : ''),
      authors: infoAuthor,
      year: years.length ? String(Math.max(...years)) : '',
      abstract: abstractMatch ? abstractMatch[1].replace(/\s+/g, ' ').trim() : '',
    },
  };
}

/** Junta resultados: valores do primeiro objeto têm prioridade, vazios são completados pelo segundo */
export function mergeMeta(primary: Meta, fallback: Meta): Meta {
  const out: Meta = { ...fallback };
  for (const [k, v] of Object.entries(primary)) {
    if (v !== '' && v !== undefined && v !== null) out[k] = v;
  }
  return out;
}
