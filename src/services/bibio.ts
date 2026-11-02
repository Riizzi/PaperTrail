import type { DocumentType, ReferenceItem } from '../types';
import { formatMonthAbbr, parseAuthorsList } from './abnt';

/**
 * Importação e exportação em BibTeX e RIS (formatos do Zotero, Mendeley, EndNote, Google Acadêmico).
 * A leitura devolve só os metadados; quem chama completa id, userId, datas etc.
 */

export type ImportedRef = Partial<ReferenceItem> & { title: string; type: DocumentType };

// ---------- BibTeX ----------

const LATEX_ACCENTS: Record<string, Record<string, string>> = {
  "'": { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú', c: 'ć' },
  '`': { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù', A: 'À', E: 'È', O: 'Ò' },
  '^': { a: 'â', e: 'ê', i: 'î', o: 'ô', u: 'û', A: 'Â', E: 'Ê', O: 'Ô' },
  '~': { a: 'ã', o: 'õ', n: 'ñ', A: 'Ã', O: 'Õ', N: 'Ñ' },
  '"': { a: 'ä', e: 'ë', i: 'ï', o: 'ö', u: 'ü', A: 'Ä', O: 'Ö', U: 'Ü' },
  c: { c: 'ç', C: 'Ç' },
};

/** Tira chaves e comandos LaTeX comuns: {\'e} → é, {\c c} → ç, {DNA} → DNA */
export function cleanLatex(value: string): string {
  return value
    .replace(/\\([`'^~"])\s*\{?\\?([a-zA-Z])\}?/g, (m, acc, ch) => LATEX_ACCENTS[acc]?.[ch] ?? ch)
    .replace(/\\c\s*\{?([a-zA-Z])\}?/g, (m, ch) => LATEX_ACCENTS.c[ch] ?? ch)
    .replace(/\\&/g, '&')
    .replace(/\\%/g, '%')
    .replace(/\\_/g, '_')
    .replace(/\\textendash\s*\{?\}?|--/g, '–')
    .replace(/\\(?:emph|textit|textbf|textsc|mathrm)\{([^{}]*)\}/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function readBibValue(src: string, start: number): [string, number] {
  let i = start;
  while (/\s/.test(src[i] || '')) i++;
  const parts: string[] = [];
  for (;;) {
    const ch = src[i];
    if (ch === '{') {
      let depth = 0;
      const begin = i;
      for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) break;
      }
      parts.push(src.slice(begin + 1, i));
      i++;
    } else if (ch === '"') {
      const begin = ++i;
      let depth = 0;
      for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') depth--;
        else if (src[i] === '"' && depth === 0) break;
      }
      parts.push(src.slice(begin, i));
      i++;
    } else {
      const m = src.slice(i).match(/^[\w.-]+/);
      parts.push(m ? m[0] : '');
      i += m ? m[0].length : 0;
    }
    while (/\s/.test(src[i] || '')) i++;
    if (src[i] === '#') {
      i++;
      while (/\s/.test(src[i] || '')) i++;
      continue;
    }
    return [parts.join(''), i];
  }
}

export function parseBibTeXEntries(text: string): { type: string; fields: Record<string, string> }[] {
  const out: { type: string; fields: Record<string, string> }[] = [];
  const re = /@(\w+)\s*[{(]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const type = m[1].toLowerCase();
    if (type === 'comment' || type === 'preamble' || type === 'string') continue;
    let i = re.lastIndex;
    // chave de citação
    const comma = text.indexOf(',', i);
    if (comma < 0) break;
    i = comma + 1;
    const fields: Record<string, string> = {};
    for (;;) {
      const fm = text.slice(i).match(/^\s*([\w-]+)\s*=/);
      if (!fm) break;
      const [value, next] = readBibValue(text, i + fm[0].length);
      fields[fm[1].toLowerCase()] = value;
      i = next;
      if (text[i] === ',') i++;
    }
    re.lastIndex = i;
    out.push({ type, fields });
  }
  return out;
}

const BIB_TYPES: Record<string, DocumentType> = {
  article: 'article',
  book: 'book',
  inbook: 'chapter',
  incollection: 'chapter',
  phdthesis: 'thesis',
  mastersthesis: 'thesis',
  thesis: 'thesis',
  inproceedings: 'conference',
  conference: 'conference',
  proceedings: 'conference',
  online: 'webpage',
  electronic: 'webpage',
  webpage: 'webpage',
};

/** "Silva, João and Maria Souza" → "Silva, João; Maria Souza" (formato que parseAuthorsList entende) */
function bibAuthors(raw?: string): string | undefined {
  if (!raw) return undefined;
  const list = cleanLatex(raw)
    .split(/\s+and\s+/i)
    .map((a) => a.trim())
    .filter((a) => a && a.toLowerCase() !== 'others');
  return list.length ? list.join('; ') : undefined;
}

function splitTitle(raw: string): { title: string; subtitle?: string } {
  const t = cleanLatex(raw);
  const idx = t.indexOf(': ');
  if (idx > 0 && idx < t.length - 2) return { title: t.slice(0, idx), subtitle: t.slice(idx + 2) };
  return { title: t };
}

function accessDateFrom(raw?: string): string | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? undefined : formatMonthAbbr(d);
}

function tagsFrom(raw?: string): string[] {
  if (!raw) return [];
  return [...new Set(cleanLatex(raw).split(/[;,]/).map((k) => k.trim().toLowerCase()).filter(Boolean))].slice(0, 15);
}

function cleanDoi(raw?: string): string | undefined {
  if (!raw) return undefined;
  return raw.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '') || undefined;
}

export function parseBibTeX(text: string): ImportedRef[] {
  return parseBibTeXEntries(text)
    .map(({ type, fields: f }): ImportedRef | null => {
      if (!f.title) return null;
      const docType = BIB_TYPES[type] || (f.url && !f.journal && !f.journaltitle ? 'webpage' : 'article');
      const { title, subtitle } = splitTitle(f.title);
      const year = (f.year || f.date || '').match(/\d{4}/)?.[0];
      const c = (v?: string) => (v ? cleanLatex(v) || undefined : undefined);
      return {
        type: docType,
        title,
        subtitle,
        authors: bibAuthors(f.author),
        year,
        publication: c(f.journal || f.journaltitle) || (docType === 'conference' ? c(f.booktitle) : undefined),
        bookTitle: docType === 'chapter' ? c(f.booktitle) : undefined,
        bookOrganizer: docType === 'chapter' ? bibAuthors(f.editor) : undefined,
        publisher: c(f.publisher),
        place: c(f.address || f.location),
        volume: c(f.volume),
        number: c(f.number || f.issue),
        pages: c(f.pages)?.replace(/–/g, '-'),
        edition: c(f.edition),
        doi: cleanDoi(f.doi),
        isbn: c(f.isbn),
        url: f.url?.trim() || undefined,
        accessDate: accessDateFrom(f.urldate),
        institution: c(f.school || f.institution),
        degree: type === 'mastersthesis' ? 'Dissertação (Mestrado)' : type === 'phdthesis' ? 'Tese (Doutorado)' : undefined,
        abstract: c(f.abstract),
        tags: tagsFrom(f.keywords),
      };
    })
    .filter((r): r is ImportedRef => !!r);
}

// ---------- RIS ----------

const RIS_TYPES: Record<string, DocumentType> = {
  JOUR: 'article',
  JFULL: 'article',
  MGZN: 'article',
  NEWS: 'article',
  BOOK: 'book',
  EBOOK: 'book',
  CHAP: 'chapter',
  ECHAP: 'chapter',
  THES: 'thesis',
  CONF: 'conference',
  CPAPER: 'conference',
  ELEC: 'webpage',
  WEB: 'webpage',
  BLOG: 'webpage',
};

export function parseRIS(text: string): ImportedRef[] {
  const out: ImportedRef[] = [];
  let rec: Record<string, string[]> | null = null;
  const flush = () => {
    if (!rec) return;
    const g = (...tags: string[]) => tags.map((t) => rec![t]?.[0]).find(Boolean)?.trim();
    const all = (...tags: string[]) => tags.flatMap((t) => rec![t] || []).map((v) => v.trim()).filter(Boolean);
    const rawTitle = g('TI', 'T1', 'CT');
    if (rawTitle) {
      const type = RIS_TYPES[g('TY')?.toUpperCase() || ''] || 'article';
      const { title, subtitle } = splitTitle(rawTitle);
      const sp = g('SP');
      const ep = g('EP');
      const container = g('T2', 'JO', 'JF', 'JA', 'BT');
      out.push({
        type,
        title,
        subtitle,
        authors: all('AU', 'A1').join('; ') || undefined,
        year: (g('PY', 'Y1', 'DA') || '').match(/\d{4}/)?.[0],
        publication: type === 'chapter' ? undefined : container,
        bookTitle: type === 'chapter' ? container : undefined,
        bookOrganizer: type === 'chapter' ? all('A2', 'ED').join('; ') || undefined : undefined,
        publisher: g('PB'),
        place: g('CY', 'PP'),
        volume: g('VL'),
        number: g('IS'),
        pages: sp && ep ? `${sp}-${ep}` : sp,
        edition: g('ET'),
        doi: cleanDoi(g('DO')),
        isbn: type === 'book' || type === 'chapter' ? g('SN') : undefined,
        url: g('UR', 'L2'),
        accessDate: accessDateFrom(g('Y2')),
        institution: type === 'thesis' ? g('PB') : undefined,
        abstract: g('AB', 'N2'),
        tags: tagsFrom(all('KW').join(';')),
      });
    }
    rec = null;
  };
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const m = line.match(/^([A-Z][A-Z0-9])  -\s?(.*)$/);
    if (!m) continue;
    const [, tag, value] = m;
    if (tag === 'TY') {
      flush();
      rec = {};
    }
    if (tag === 'ER') {
      flush();
      continue;
    }
    if (rec) (rec[tag] ||= []).push(value);
  }
  flush();
  return out;
}

/** Decide o formato pelo conteúdo (não pela extensão) */
export function parseReferences(text: string): ImportedRef[] {
  if (/^\s*TY  -/m.test(text)) return parseRIS(text);
  if (/@\w+\s*[{(]/.test(text)) return parseBibTeX(text);
  return [];
}

// ---------- Duplicados ----------

const norm = (s?: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

/** Chaves para achar o mesmo texto: DOI ou título + ano */
export function dedupeKeys(r: Partial<ReferenceItem>): string[] {
  const keys: string[] = [];
  if (r.doi) keys.push(`doi:${r.doi.toLowerCase().trim()}`);
  if (r.title) keys.push(`t:${norm(r.title)}${norm(r.subtitle)}:${r.year || ''}`);
  return keys;
}

// ---------- Exportação RIS ----------

const RIS_OUT: Record<DocumentType, string> = {
  article: 'JOUR',
  book: 'BOOK',
  chapter: 'CHAP',
  thesis: 'THES',
  conference: 'CPAPER',
  webpage: 'ELEC',
};

const PARTICLES = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'van', 'von', 'der', 'del', 'la', 'le']);
/** "SILVA FILHO" → "Silva Filho" (no RIS o sobrenome não vai em maiúsculas) */
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && PARTICLES.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

export function exportToRIS(items: ReferenceItem[]): string {
  return items
    .map((item) => {
      const lines: string[] = [`TY  - ${RIS_OUT[item.type] || 'GEN'}`];
      const add = (tag: string, v?: string) => v && lines.push(`${tag}  - ${v}`);
      add('TI', item.subtitle ? `${item.title}: ${item.subtitle}` : item.title);
      parseAuthorsList(item.authors).forEach((a) => add('AU', a.given ? `${titleCase(a.lastUpper)}, ${a.given}` : a.lastUpper));
      add('PY', item.year);
      add(item.type === 'chapter' ? 'T2' : 'JO', item.type === 'chapter' ? item.bookTitle : item.publication);
      add('PB', item.publisher || item.institution);
      add('CY', item.place);
      add('VL', item.volume);
      add('IS', item.number);
      const [sp, ep] = (item.pages || '').split(/[-–]/);
      add('SP', sp?.trim());
      add('EP', ep?.trim());
      add('ET', item.edition);
      add('DO', item.doi);
      add('SN', item.isbn);
      add('UR', item.url);
      add('AB', item.abstract);
      item.tags?.forEach((t) => add('KW', t));
      lines.push('ER  - ');
      return lines.join('\n');
    })
    .join('\n\n');
}
