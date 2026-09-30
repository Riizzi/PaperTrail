import type { ReferenceItem } from '../types';

/**
 * Fetch book metadata from Open Library via ISBN
 */
export async function fetchFromOpenLibrary(isbnInput: string): Promise<Partial<ReferenceItem>> {
  const cleanIsbn = isbnInput.replace(/[^0-9X]/gi, '').trim();
  if (!cleanIsbn || (cleanIsbn.length !== 10 && cleanIsbn.length !== 13)) {
    throw new Error('ISBN inválido (deve conter 10 ou 13 dígitos).');
  }

  const url = `https://openlibrary.org/isbn/${cleanIsbn}.json`;
  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('ISBN não encontrado no Open Library.');
    }
    throw new Error(`Erro ao consultar Open Library (${response.status})`);
  }

  const data = await response.json();

  // Authors resolution
  let authors = '';
  if (Array.isArray(data.authors) && data.authors.length > 0) {
    try {
      const authorPromises = data.authors.slice(0, 5).map(async (a: any) => {
        if (!a.key) return '';
        const authorRes = await fetch(`https://openlibrary.org${a.key}.json`);
        if (authorRes.ok) {
          const authorData = await authorRes.json();
          return authorData.name || '';
        }
        return '';
      });
      const authorNames = await Promise.all(authorPromises);
      authors = authorNames.filter(Boolean).join('; ');
    } catch {
      // Fallback
    }
  }

  // Year from publish_date
  let year = '';
  if (data.publish_date) {
    const match = data.publish_date.match(/\b(19\d\d|20\d\d)\b/);
    if (match) year = match[1];
  }

  const publishers = Array.isArray(data.publishers) ? data.publishers.join(', ') : (data.publishers || '');
  const publishPlaces = Array.isArray(data.publish_places) ? data.publish_places.join(', ') : (data.publish_places || '');

  return {
    type: 'book',
    title: data.title || '',
    subtitle: data.subtitle || undefined,
    authors: authors || undefined,
    year: year || undefined,
    publisher: publishers || undefined,
    place: publishPlaces || undefined,
    pages: data.number_of_pages ? String(data.number_of_pages) : undefined,
    isbn: cleanIsbn,
  };
}
