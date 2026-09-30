import type { ReferenceItem } from '../types';

/**
 * Deterministic ABNT (NBR 6023:2018) reference formatter
 */

const MONTHS_PT = [
  'jan.', 'fev.', 'mar.', 'abr.', 'maio', 'jun.',
  'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'
];

export function formatMonthAbbr(date: Date = new Date()): string {
  const day = date.getDate();
  const month = MONTHS_PT[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

// Data provável quando o ano não é informado (século XXI provável)
const UNKNOWN_YEAR = '[20--?]';

export function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Parse an author string into individual authors: "SILVA, João Pedro"
 */
export function formatSingleAuthorABNT(name: string): { lastUpper: string; given: string; fullABNT: string; lastNameOnly: string } {
  const trimmed = name.trim();
  if (!trimmed) return { lastUpper: '', given: '', fullABNT: '', lastNameOnly: '' };

  // If already in "SOBRENOME, Nome" format
  if (trimmed.includes(',')) {
    const [last, ...rest] = trimmed.split(',');
    const lastName = last.trim();
    const givenName = rest.join(',').trim();
    const lastUpper = lastName.toUpperCase();
    return {
      lastUpper,
      given: givenName,
      fullABNT: `${lastUpper}, ${givenName}`,
      lastNameOnly: lastUpper,
    };
  }

  // If in "Nome Sobrenome" format
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    const single = parts[0].toUpperCase();
    return { lastUpper: single, given: '', fullABNT: single, lastNameOnly: single };
  }

  // Handle suffixes like "Júnior", "Filho", "Neto", "Sobrinho"
  const suffixes = ['junior', 'júnior', 'filho', 'neto', 'sobrinho', 'segundo', 'terceiro'];
  let lastIndex = parts.length - 1;
  let lastName = parts[lastIndex];

  if (suffixes.includes(lastName.toLowerCase()) && parts.length > 2) {
    lastIndex = parts.length - 2;
    lastName = `${parts[lastIndex]} ${parts[parts.length - 1]}`;
    const givenName = parts.slice(0, lastIndex).join(' ');
    const lastUpper = lastName.toUpperCase();
    return {
      lastUpper,
      given: givenName,
      fullABNT: `${lastUpper}, ${givenName}`,
      lastNameOnly: lastUpper,
    };
  }

  const givenName = parts.slice(0, lastIndex).join(' ');
  const lastUpper = lastName.toUpperCase();
  return {
    lastUpper,
    given: givenName,
    fullABNT: `${lastUpper}, ${givenName}`,
    lastNameOnly: lastUpper,
  };
}

const SURNAME_PARTICLE = /^(da|de|do|das|dos|du|del|della|di|van|von|le|la)\s/i;

/**
 * Detecta lista de nomes completos separados por vírgula ("Nome Sobrenome, Nome Sobrenome"),
 * diferente de um único autor no formato "SOBRENOME, Nome".
 */
function looksLikeFullNameList(authorsStr: string): boolean {
  const segments = authorsStr.replace(/\s+(?:e|&)\s+/g, ', ').split(',').map(s => s.trim()).filter(Boolean);
  if (segments.length < 2) return false;
  return segments.every(seg => seg.split(/\s+/).length >= 2 && !SURNAME_PARTICLE.test(seg) && !/^[A-Z]\.?$/.test(seg));
}

/**
 * Split author string by semicolons, "and", "e", or commas
 */
export function parseAuthorsList(authorsStr?: string): Array<{ lastUpper: string; given: string; fullABNT: string; lastNameOnly: string }> {
  if (!authorsStr || !authorsStr.trim()) return [];

  let rawList: string[] = [];
  if (authorsStr.includes(';')) {
    rawList = authorsStr.split(';').map(s => s.trim()).filter(Boolean);
  } else if (authorsStr.includes(' and ')) {
    rawList = authorsStr.split(' and ').map(s => s.trim()).filter(Boolean);
  } else if (looksLikeFullNameList(authorsStr)) {
    // "João Pedro da Silva, Maria Clara Santos e Ana Lima"
    rawList = authorsStr.replace(/\s+(?:e|&)\s+/g, ', ').split(',').map(s => s.trim()).filter(Boolean);
  } else if (authorsStr.includes(' e ') && !authorsStr.includes(',')) {
    rawList = authorsStr.split(' e ').map(s => s.trim()).filter(Boolean);
  } else {
    const commas = (authorsStr.match(/,/g) || []).length;
    if (commas <= 1) {
      rawList = [authorsStr.trim()];
    } else {
      rawList = authorsStr.split(/,(?=\s*[A-Z][a-zà-ÿ]+|\s*[A-Z]{2,})/g).map(s => s.trim()).filter(Boolean);
      if (rawList.length === 0) rawList = [authorsStr.trim()];
    }
  }

  return rawList.map(formatSingleAuthorABNT);
}

/**
 * Format authors according to ABNT (NBR 6023:2018):
 * - Up to 3: all listed, separated by semicolon
 * - 4 or more: first author + "et al."
 */
export function formatAuthorsABNT(authorsStr?: string): string {
  const list = parseAuthorsList(authorsStr);
  if (list.length === 0) return '';
  if (list.length <= 3) {
    return list.map(a => a.fullABNT).join('; ');
  }
  return `${list[0].fullABNT} et al.`;
}

export function getMissingABNTFields(item: ReferenceItem): string[] {
  const missing: string[] = [];
  if (!item.authors) missing.push('autor');
  if (!item.year) missing.push('ano');

  switch (item.type) {
    case 'article':
      if (!item.publication) missing.push('periódico');
      if (!item.pages) missing.push('páginas');
      break;
    case 'book':
      if (!item.publisher) missing.push('editora');
      if (!item.place) missing.push('local');
      break;
    case 'chapter':
      if (!item.bookTitle) missing.push('título do livro');
      if (!item.publisher) missing.push('editora');
      if (!item.place) missing.push('local');
      if (!item.pages) missing.push('páginas');
      break;
    case 'thesis':
      if (!item.institution) missing.push('instituição');
      if (!item.degree) missing.push('grau acadêmico');
      break;
    case 'conference':
      if (!item.publication) missing.push('evento');
      break;
    case 'webpage':
      if (!item.url) missing.push('URL');
      break;
  }
  return missing;
}

export interface ABNTResult {
  html: string;
  plain: string;
  missingFields: string[];
}

/**
 * Formats full bibliographic reference strictly according to ABNT NBR 6023:2018
 */
export function formatReferenceABNT(item: ReferenceItem): ABNTResult {
  const authorsABNT = formatAuthorsABNT(item.authors);
  const authorPrefix = authorsABNT ? `${authorsABNT}. ` : '';

  // Sem ano: usar data provável entre colchetes ex: [2024?] em vez de s.d.
  const year = item.year?.trim() || UNKNOWN_YEAR;

  const place = item.place?.trim() || '[S. l.]';
  const publisher = item.publisher?.trim() || '[s. n.]';

  let html = '';
  let plain = '';
  const missingFields = getMissingABNTFields(item);

  const safeTitle = escapeHtml(item.title || '');
  const safeSubtitle = item.subtitle ? `: ${escapeHtml(item.subtitle)}` : '';
  const plainTitle = item.title || '';
  const plainSubtitle = item.subtitle ? `: ${item.subtitle}` : '';

  switch (item.type) {
    case 'article': {
      // Artigo: AUTOR. Título do artigo. **Periódico**, local, v. X, n. Y, p. inicial-final, ano. DOI: ...
      // Campos ausentes são omitidos (sem vírgulas sobrando); o local só entra se informado.
      const pub = item.publication?.trim() || '';
      const doi = item.doi ? item.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '') : '';
      const tail = [
        item.place?.trim(),
        item.volume ? `v. ${item.volume}` : '',
        item.number ? `n. ${item.number}` : '',
        item.pages ? `p. ${item.pages}` : '',
        year,
      ].filter(Boolean) as string[];

      const htmlSource = pub ? [`<b>${escapeHtml(pub)}</b>`, ...tail.map(escapeHtml)] : tail.map(escapeHtml);
      const plainSource = pub ? [pub, ...tail] : tail;

      html = `${escapeHtml(authorPrefix)}${safeTitle}${safeSubtitle}. ${htmlSource.join(', ')}.${doi ? ` DOI: ${escapeHtml(doi)}.` : ''}`;
      plain = `${authorPrefix}${plainTitle}${plainSubtitle}. ${plainSource.join(', ')}.${doi ? ` DOI: ${doi}.` : ''}`;
      break;
    }

    case 'book': {
      // Livro: AUTOR. Título (bold): subtítulo. Edição. Local: Editora, ano.
      const edition = item.edition?.trim().replace(/\.+$/, '');
      const editionStr = edition ? ` ${escapeHtml(edition)}.` : '';
      const plainEdition = edition ? ` ${edition}.` : '';
      const isbnStr = item.isbn ? ` ISBN: ${escapeHtml(item.isbn)}.` : '';
      const plainIsbn = item.isbn ? ` ISBN: ${item.isbn}.` : '';

      html = `${escapeHtml(authorPrefix)}<b>${safeTitle}</b>${safeSubtitle}.${editionStr} ${escapeHtml(place)}: ${escapeHtml(publisher)}, ${year}.${isbnStr}`;
      plain = `${authorPrefix}${plainTitle}${plainSubtitle}.${plainEdition} ${place}: ${publisher}, ${year}.${plainIsbn}`;
      break;
    }

    case 'chapter': {
      // Capítulo: AUTOR DO CAPÍTULO. Título do capítulo. In: ORGANIZADOR (org.). Título do livro (bold). Local: Editora, ano. p. X-Y.
      const orgStr = item.bookOrganizer ? `${escapeHtml(item.bookOrganizer)} (org.). ` : '';
      const plainOrg = item.bookOrganizer ? `${item.bookOrganizer} (org.). ` : '';
      const bTitle = item.bookTitle ? item.bookTitle.trim() : '';
      const safeBTitle = bTitle ? `<b>${escapeHtml(bTitle)}</b>. ` : '';
      const plainBTitle = bTitle ? `${bTitle}. ` : '';
      const pagesStr = item.pages ? ` p. ${escapeHtml(item.pages)}.` : '';
      const plainPages = item.pages ? ` p. ${item.pages}.` : '';

      html = `${escapeHtml(authorPrefix)}${safeTitle}${safeSubtitle}. In: ${orgStr}${safeBTitle}${escapeHtml(place)}: ${escapeHtml(publisher)}, ${year}.${pagesStr}`;
      plain = `${authorPrefix}${plainTitle}${plainSubtitle}. In: ${plainOrg}${plainBTitle}${place}: ${publisher}, ${year}.${plainPages}`;
      break;
    }

    case 'thesis': {
      // Tese/dissertação: AUTOR. Título (bold). Ano. Tipo (Grau em Área) – Instituição, Local, ano.
      const degreeStr = item.degree ? `${escapeHtml(item.degree)} – ` : '';
      const plainDegree = item.degree ? `${item.degree} – ` : '';
      const instStr = item.institution ? `${escapeHtml(item.institution)}, ` : '';
      const plainInst = item.institution ? `${item.institution}, ` : '';

      html = `${escapeHtml(authorPrefix)}<b>${safeTitle}</b>${safeSubtitle}. ${year}. ${degreeStr}${instStr}${escapeHtml(place)}, ${year}.`;
      plain = `${authorPrefix}${plainTitle}${plainSubtitle}. ${year}. ${plainDegree}${plainInst}${place}, ${year}.`;
      break;
    }

    case 'conference': {
      // Trabalho em evento: AUTOR. Título. In: NOME DO EVENTO EM MAIÚSCULAS, número., ano, Local. Anais [...]. Local: Editora, ano. p. X-Y.
      // O negrito vai em "Anais", não no nome do evento!
      const eventName = item.publication ? escapeHtml(item.publication.toUpperCase()) : '';
      const plainEvent = item.publication ? item.publication.toUpperCase() : '';
      const numStr = item.number ? `, ${escapeHtml(item.number.replace(/\.$/, ''))}.` : '';
      const plainNum = item.number ? `, ${item.number.replace(/\.$/, '')}.` : '';
      const pagesStr = item.pages ? ` p. ${escapeHtml(item.pages)}.` : '';
      const plainPages = item.pages ? ` p. ${item.pages}.` : '';

      const eventHtml = [eventName ? `${eventName}${numStr}` : '', year, escapeHtml(place)].filter(Boolean).join(', ');
      const eventPlain = [plainEvent ? `${plainEvent}${plainNum}` : '', year, place].filter(Boolean).join(', ');
      html = `${escapeHtml(authorPrefix)}${safeTitle}${safeSubtitle}. In: ${eventHtml}. <b>Anais</b> [...]. ${escapeHtml(place)}: ${escapeHtml(publisher)}, ${year}.${pagesStr}`;
      plain = `${authorPrefix}${plainTitle}${plainSubtitle}. In: ${eventPlain}. Anais [...]. ${place}: ${publisher}, ${year}.${plainPages}`;
      break;
    }

    case 'webpage':
    default: {
      // Site: AUTOR/INSTITUIÇÃO. Título (bold). Local, ano. Disponível em: URL. Acesso em: dia mês ano.
      const accessDate = item.accessDate || formatMonthAbbr();
      const urlStr = item.url ? ` Disponível em: ${escapeHtml(item.url)}.` : '';
      const plainUrl = item.url ? ` Disponível em: ${item.url}.` : '';

      html = `${escapeHtml(authorPrefix)}<b>${safeTitle}</b>${safeSubtitle}. ${escapeHtml(place)}, ${year}.${urlStr} Acesso em: ${escapeHtml(accessDate)}.`;
      plain = `${authorPrefix}${plainTitle}${plainSubtitle}. ${place}, ${year}.${plainUrl} Acesso em: ${accessDate}.`;
      break;
    }
  }

  return { html, plain, missingFields };
}

/**
 * Formats citations:
 * - Citação indireta: (SILVA; SOUZA, 2023)
 * - Citação direta: (SILVA; SOUZA, 2023, p. 34)
 * - Autor no texto: Silva e Souza (2023)
 */
export function formatCitationABNT(item: ReferenceItem, page?: string): {
  indirect: string;
  direct: string;
  inText: string;
} {
  const list = parseAuthorsList(item.authors);
  const year = item.year?.trim() || UNKNOWN_YEAR;
  const pageStr = page ? `, p. ${page}` : ', p. __';

  if (list.length === 0) {
    const firstWord = (item.title || 'ANÔNIMO').split(/\s+/)[0].toUpperCase();
    return {
      indirect: `(${firstWord}, ${year})`,
      direct: `(${firstWord}, ${year}${pageStr})`,
      inText: `${firstWord} (${year})`,
    };
  }

  if (list.length === 1) {
    const lastUpper = list[0].lastUpper;
    const lastCapitalized = capitalizeName(list[0].lastNameOnly);
    return {
      indirect: `(${lastUpper}, ${year})`,
      direct: `(${lastUpper}, ${year}${pageStr})`,
      inText: `${lastCapitalized} (${year})`,
    };
  }

  if (list.length === 2) {
    const lastUpper = `${list[0].lastUpper}; ${list[1].lastUpper}`;
    const inText = `${capitalizeName(list[0].lastNameOnly)} e ${capitalizeName(list[1].lastNameOnly)}`;
    return {
      indirect: `(${lastUpper}, ${year})`,
      direct: `(${lastUpper}, ${year}${pageStr})`,
      inText: `${inText} (${year})`,
    };
  }

  if (list.length === 3) {
    const lastUpper = `${list[0].lastUpper}; ${list[1].lastUpper}; ${list[2].lastUpper}`;
    const inText = `${capitalizeName(list[0].lastNameOnly)}, ${capitalizeName(list[1].lastNameOnly)} e ${capitalizeName(list[2].lastNameOnly)}`;
    return {
      indirect: `(${lastUpper}, ${year})`,
      direct: `(${lastUpper}, ${year}${pageStr})`,
      inText: `${inText} (${year})`,
    };
  }

  // 4 or more authors: first author + et al.
  const lastUpper = `${list[0].lastUpper} et al.`;
  const inText = `${capitalizeName(list[0].lastNameOnly)} et al.`;
  return {
    indirect: `(${lastUpper}, ${year})`,
    direct: `(${lastUpper}, ${year}${pageStr})`,
    inText: `${inText} (${year})`,
  };
}

function capitalizeName(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export async function copyABNTToClipboard(htmlText: string, plainText: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard && navigator.clipboard.write) {
      const blobHtml = new Blob([htmlText], { type: 'text/html' });
      const blobText = new Blob([plainText], { type: 'text/plain' });
      const item = new ClipboardItem({
        'text/html': blobHtml,
        'text/plain': blobText,
      });
      await navigator.clipboard.write([item]);
      return true;
    }
  } catch (e) {
    console.warn('ClipboardItem write failed, falling back to writeText:', e);
  }

  try {
    await navigator.clipboard.writeText(plainText);
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
}

/**
 * Format collection references:
 * Ordenar pelo SOBRENOME do primeiro autor já formatado em ABNT (e pelo título quando não houver autor), não pela string bruta
 */
export function formatCollectionABNT(items: ReferenceItem[]): { html: string; plain: string } {
  const sorted = [...items].sort((a, b) => {
    const listA = parseAuthorsList(a.authors);
    const listB = parseAuthorsList(b.authors);

    const keyA = (listA.length > 0 ? listA[0].lastUpper : a.title || '').toLowerCase();
    const keyB = (listB.length > 0 ? listB[0].lastUpper : b.title || '').toLowerCase();

    return keyA.localeCompare(keyB, 'pt-BR');
  });

  const htmlList = sorted.map(item => {
    const ref = formatReferenceABNT(item);
    return `<p style="margin-bottom: 1em;">${ref.html}</p>`;
  }).join('\n');

  const plainList = sorted.map(item => {
    const ref = formatReferenceABNT(item);
    return ref.plain;
  }).join('\n\n');

  return { html: htmlList, plain: plainList };
}

/**
 * Export collection items to BibTeX format
 */
export function exportToBibTeX(items: ReferenceItem[]): string {
  return items.map(item => {
    const list = parseAuthorsList(item.authors);
    const authorKey = list.length > 0 ? list[0].lastUpper.toLowerCase().replace(/[^a-z0-9]/g, '') : 'anon';
    const yearKey = item.year || 'nodate';
    const citeKey = `${authorKey}${yearKey}`;

    const bibAuthors = list.map(a => `${a.lastUpper}, ${a.given}`).join(' and ') || 'Anonymous';
    const type = item.type === 'book' ? 'book' : item.type === 'chapter' ? 'incollection' : item.type === 'thesis' ? 'phdthesis' : 'article';

    const fields: string[] = [
      `  author = {${bibAuthors}}`,
      `  title = {${item.title}${item.subtitle ? ': ' + item.subtitle : ''}}`,
      item.year ? `  year = {${item.year}}` : '',
      item.publication ? `  journal = {${item.publication}}` : '',
      item.bookTitle ? `  booktitle = {${item.bookTitle}}` : '',
      item.publisher ? `  publisher = {${item.publisher}}` : '',
      item.volume ? `  volume = {${item.volume}}` : '',
      item.number ? `  number = {${item.number}}` : '',
      item.pages ? `  pages = {${item.pages}}` : '',
      item.doi ? `  doi = {${item.doi}}` : '',
      item.isbn ? `  isbn = {${item.isbn}}` : '',
      item.url ? `  url = {${item.url}}` : '',
    ].filter(Boolean);

    return `@${type}{${citeKey},\n${fields.join(',\n')}\n}`;
  }).join('\n\n');
}
