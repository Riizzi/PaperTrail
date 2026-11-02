import type { ReferenceItem } from '../types';
import { fetchJson, HttpError, stripMarkup, abntEdition } from './http';

/**
 * Metadados pelo DOI na API pública do Crossref
 */
export async function fetchFromCrossRef(doiInput: string): Promise<Partial<ReferenceItem>> {
  const cleanDoi = doiInput
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '');
  if (!cleanDoi) {
    throw new Error('DOI inválido ou vazio');
  }

  let data: any;
  try {
    data = await fetchJson(`https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`, { timeoutMs: 12_000 });
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) {
      throw new Error('DOI não encontrado no Crossref. Confira o número ou tente pelo link.');
    }
    if (err instanceof HttpError && err.status === 0) {
      throw new Error('O Crossref demorou para responder. Tente de novo em instantes.');
    }
    throw new Error('Não foi possível consultar o Crossref agora. Tente de novo em instantes.');
  }

  const message = data?.message;
  if (!message) {
    throw new Error('Resposta inválida do Crossref.');
  }

  // Tipo
  let type: ReferenceItem['type'] = 'article';
  const crType = message.type;
  if (crType === 'book' || crType === 'monograph' || crType === 'edited-book' || crType === 'reference-book') {
    type = 'book';
  } else if (crType === 'book-chapter' || crType === 'book-section' || crType === 'book-part') {
    type = 'chapter';
  } else if (crType === 'proceedings-article') {
    type = 'conference';
  } else if (crType === 'dissertation') {
    type = 'thesis';
  }

  const fullTitle = stripMarkup(message.title?.[0]);
  const subtitle = stripMarkup(message.subtitle?.[0]);

  const names = (list: any[] | undefined) =>
    (Array.isArray(list) ? list : [])
      .map((a: any) => (a.family && a.given ? `${a.family}, ${a.given}` : a.name || a.family || a.given || ''))
      .filter(Boolean)
      .join('; ');

  // Ano: data de publicação "oficial" primeiro
  let year = '';
  const published =
    message.issued || message['published-print'] || message['published-online'] || message.published || message.created;
  if (published?.['date-parts']?.[0]?.[0]) {
    year = String(published['date-parts'][0][0]);
  }

  const container = stripMarkup(message['container-title']?.[0]);
  const isbn = Array.isArray(message.ISBN) ? message.ISBN[0] : undefined;
  const abstract = stripMarkup(message.abstract).replace(/^(abstract|resumo)\s*[:.]?\s*/i, '');

  return {
    type,
    title: fullTitle,
    subtitle: subtitle || undefined,
    authors: names(message.author) || undefined,
    year: year || undefined,
    publication: type === 'chapter' ? undefined : container || undefined,
    bookTitle: type === 'chapter' ? container || undefined : undefined,
    bookOrganizer: type === 'chapter' ? names(message.editor) || undefined : undefined,
    publisher: message.publisher || undefined,
    place: message['publisher-location'] || undefined,
    volume: message.volume ? String(message.volume) : undefined,
    number: message.issue ? String(message.issue) : undefined,
    pages: message.page ? String(message.page) : undefined,
    edition: abntEdition(message['edition-number']),
    isbn,
    abstract: abstract || undefined,
    doi: message.DOI || cleanDoi,
    url: message.URL || `https://doi.org/${cleanDoi}`,
  };
}
