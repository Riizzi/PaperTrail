import type { ReferenceItem } from '../types';

/**
 * Fetch bibliographic metadata from CrossRef API via DOI
 */
export async function fetchFromCrossRef(doiInput: string): Promise<Partial<ReferenceItem>> {
  const cleanDoi = doiInput.trim().replace(/^https?:\/\/doi\.org\//, '').replace(/^doi:\s*/i, '');
  if (!cleanDoi) {
    throw new Error('DOI inválido ou vazio');
  }

  const url = `https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`;
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('DOI não encontrado no CrossRef.');
    }
    throw new Error(`Erro ao consultar CrossRef (${response.status})`);
  }

  const data = await response.json();
  const message = data.message;
  if (!message) {
    throw new Error('Resposta inválida do CrossRef.');
  }

  // Determine type
  let type: ReferenceItem['type'] = 'article';
  const crType = message.type;
  if (crType === 'book' || crType === 'monograph') {
    type = 'book';
  } else if (crType === 'book-chapter' || crType === 'book-section') {
    type = 'chapter';
  } else if (crType === 'proceedings-article') {
    type = 'conference';
  } else if (crType === 'dissertation') {
    type = 'thesis';
  }

  // Parse Title & Subtitle
  const titles = message.title || [];
  const fullTitle = titles[0] || '';
  const subtitles = message.subtitle || [];
  const subtitle = subtitles[0] || '';

  // Parse Authors
  let authors = '';
  if (Array.isArray(message.author)) {
    authors = message.author
      .map((a: any) => {
        if (a.family && a.given) {
          return `${a.family}, ${a.given}`;
        }
        return a.name || a.family || a.given || '';
      })
      .filter(Boolean)
      .join('; ');
  }

  // Year
  let year = '';
  const published = message['published-print'] || message['published-online'] || message.created;
  if (published && published['date-parts'] && published['date-parts'][0]) {
    year = String(published['date-parts'][0][0] || '');
  }

  // Publication / Container
  const containerTitles = message['container-title'] || [];
  const publication = containerTitles[0] || message.publisher || '';

  return {
    type,
    title: fullTitle,
    subtitle: subtitle || undefined,
    authors: authors || undefined,
    year: year || undefined,
    publication: publication || undefined,
    publisher: message.publisher || undefined,
    volume: message.volume ? String(message.volume) : undefined,
    number: message.issue ? String(message.issue) : undefined,
    pages: message.page ? String(message.page) : undefined,
    doi: message.DOI || cleanDoi,
    url: message.URL || `https://doi.org/${cleanDoi}`,
  };
}
