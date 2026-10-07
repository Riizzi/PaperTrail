import { getDocumentProxy, getMeta } from 'unpdf';

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

export function stripTags(s: string): string {
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

  // Só as 3 primeiras páginas: rápido mesmo em livros grandes
  const pageTexts: string[] = [];
  let title = '';
  const pagesToRead = Math.min(3, pdf.numPages || 0);
  for (let p = 1; p <= pagesToRead; p++) {
    try {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const items = (content.items as any[])
        .filter((i) => typeof i.str === 'string')
        .map((i) => ({
          str: i.str as string,
          y: i.transform?.[5] ?? 0,
          x: i.transform?.[4] ?? 0,
          size: Math.hypot(i.transform?.[0] ?? 0, i.transform?.[1] ?? 0),
          eol: Boolean(i.hasEOL),
        }));
      pageTexts.push(items.map((i) => i.str + (i.eol ? '\n' : ' ')).join('').replace(/[ \t]+\n/g, '\n'));

      if (p === 1) {
        const visible = items.filter((i) => i.str.trim().length > 1);
        if (visible.length) {
          const maxSize = Math.max(...visible.map((i) => i.size));
          // Só o tamanho de letra máximo (tolerância pequena): no corpo do texto a diferença é de ~1pt
          const big = visible.filter((i) => i.size >= maxSize - 0.3).sort((a, b) => b.y - a.y || a.x - b.x);
          title = big.map((i) => i.str.trim()).join(' ').replace(/\s+/g, ' ').trim();
          if (title.length > 300 || title.length < 4) title = '';
        }
      }
    } catch {
      // página ilegível: segue
    }
  }
  const firstPagesText = pageTexts.join('\n\n').trim().slice(0, 20000);

  let info: Record<string, any> = {};
  try {
    info = (await getMeta(pdf)).info || {};
  } catch {
    // segue sem propriedades
  }

  const infoTitle = typeof info.Title === 'string' ? info.Title.trim() : '';
  const infoAuthor = typeof info.Author === 'string' ? info.Author.trim() : '';
  const usefulInfoTitle = infoTitle && !/^(microsoft|untitled|sem título|documento|document\d*)\b|\.(docx?|pdf)$/i.test(infoTitle);

  // Autores: linhas antes do RESUMO/ABSTRACT com "Nome – e-mail" ou nome seguido de número de nota
  const head = (pageTexts[0] || '').split(/\n\s*(?:RESUMO|Resumo|ABSTRACT|Abstract)\b/)[0];
  const authorNames: string[] = [];
  for (const rawLine of head.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const withEmail = line.match(/^(.{5,80}?)\s*[–—\-,(]\s*\S+@\S+/);
    const candidate = (withEmail ? withEmail[1] : line).replace(/[\d*¹²³⁴⁵⁶⁷⁸⁹]+$/, '').trim();
    const words = candidate.split(/\s+/);
    const looksLikeName =
      words.length >= 2 && words.length <= 8 &&
      words.every((w) => /^[A-ZÀ-Ý][a-zà-ÿ'’.-]*$|^(da|de|do|das|dos|e)$/i.test(w) && !/^[A-ZÀ-Ý]{4,}$/.test(w)) &&
      /^[A-ZÀ-Ý]/.test(words[0]);
    if ((withEmail || /\d\s*$/.test(line)) && looksLikeName) authorNames.push(candidate);
  }
  const textAuthors = authorNames.slice(0, 10).join('; ');

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
      title: toSentenceCase(title) || (usefulInfoTitle ? infoTitle : ''),
      authors: textAuthors || infoAuthor,
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

/** Título todo em MAIÚSCULAS vira "Frase normal", mantendo siglas com números (COVID-19) */
function toSentenceCase(t: string): string {
  if (!t) return t;
  const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (!letters || letters !== letters.toUpperCase()) return t;
  const lower = t
    .split(/\s+/)
    .map((w) => (/\d/.test(w) && /[A-ZÀ-Ý]/.test(w) ? w : w.toLowerCase()))
    .join(' ')
    .replace(/\.$/, '');
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Remove parâmetros de rastreamento (fbclid, utm_*, gclid...) */
export function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_eid$|mc_cid$|igshid$|_hs)/i.test(k)) u.searchParams.delete(k);
    }
    return u.toString();
  } catch {
    return raw;
  }
}

/** Página de verificação anti-robô (Cloudflare, "Hold tight", captchas) em vez do conteúdo */
export function isBotChallenge(status: number, html: string): boolean {
  const sample = html.slice(0, 20000);
  return (
    /just a moment|checking your browser|hold tight|establishing a secure connection|cf-browser-verification|challenge-platform|cf-chl|ddos protection|attention required|captcha|verify you are human|access denied/i.test(sample) &&
    (status >= 400 || !/citation_title|og:title/i.test(sample) || sample.length < 15000)
  );
}

/** Sites WordPress (como o blog da SciELO): dados pela API pública do próprio site */
export async function wordpressLookup(target: string): Promise<Meta | null> {
  let u: URL;
  try {
    u = new URL(target);
  } catch {
    return null;
  }
  const tryJson = async (endpoint: string) => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const r = await fetch(endpoint, { headers: { Accept: 'application/json' }, signal: controller.signal });
      clearTimeout(timer);
      if (!r.ok || !/json/i.test(r.headers.get('content-type') || '')) return null;
      return await r.json();
    } catch {
      return null;
    }
  };

  const postId = u.searchParams.get('p');
  if (postId && /^\d+$/.test(postId)) {
    const post = await tryJson(`${u.origin}/wp-json/wp/v2/posts/${postId}?_embed=author`);
    if (post?.title?.rendered) {
      return {
        type: 'webpage',
        title: decodeEntities(stripTags(post.title.rendered)),
        authors: post._embedded?.author?.[0]?.name || '',
        year: String(post.date || '').slice(0, 4),
        abstract: decodeEntities(stripTags(post.excerpt?.rendered || '')),
        url: post.link || target,
        contentText: decodeEntities(stripTags(post.content?.rendered || '')).slice(0, 15000),
      };
    }
  }

  const oembed = await tryJson(`${u.origin}/wp-json/oembed/1.0/embed?url=${encodeURIComponent(target)}`);
  if (oembed?.title) {
    return {
      type: 'webpage',
      title: decodeEntities(oembed.title),
      authors: oembed.author_name || '',
      publication: oembed.provider_name || '',
      url: target,
    };
  }
  return null;
}
