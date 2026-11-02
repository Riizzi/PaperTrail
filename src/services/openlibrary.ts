import type { ReferenceItem } from '../types';
import { fetchJson, HttpError, stripMarkup, abntEdition } from './http';

/**
 * Metadados de livro pelo ISBN: Open Library primeiro; se não achar (comum em livros
 * brasileiros) ou vier incompleto, completa com o Google Books.
 */
export async function fetchFromOpenLibrary(isbnInput: string): Promise<Partial<ReferenceItem>> {
  const cleanIsbn = isbnInput.replace(/[^0-9X]/gi, '').trim();
  if (!cleanIsbn || (cleanIsbn.length !== 10 && cleanIsbn.length !== 13)) {
    throw new Error('ISBN inválido (deve conter 10 ou 13 dígitos).');
  }

  const [ol, gb] = await Promise.all([
    fromOpenLibrary(cleanIsbn).catch(() => null),
    fromGoogleBooks(cleanIsbn).catch(() => null),
  ]);

  if (!ol && !gb) {
    throw new Error('ISBN não encontrado no Open Library nem no Google Books. Preencha manualmente.');
  }

  // Open Library costuma ter local de publicação; Google Books, descrição e nomes completos
  const pick = <K extends keyof ReferenceItem>(k: K) => ol?.[k] || gb?.[k] || undefined;
  return {
    type: 'book',
    title: pick('title') || '',
    subtitle: pick('subtitle'),
    authors: pick('authors'),
    year: pick('year'),
    publisher: pick('publisher'),
    place: pick('place'),
    edition: pick('edition'),
    abstract: gb?.abstract,
    isbn: cleanIsbn,
  };
}

async function fromOpenLibrary(isbn: string): Promise<Partial<ReferenceItem> | null> {
  let data: any;
  try {
    data = await fetchJson(`https://openlibrary.org/isbn/${isbn}.json`, { timeoutMs: 10_000 });
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw err;
  }

  let authors = '';
  if (Array.isArray(data.authors) && data.authors.length > 0) {
    const authorNames = await Promise.all(
      data.authors.slice(0, 5).map(async (a: any) => {
        if (!a.key) return '';
        try {
          const author = await fetchJson(`https://openlibrary.org${a.key}.json`, { timeoutMs: 6000, retries: 0 });
          return author.name || '';
        } catch {
          return '';
        }
      })
    );
    authors = authorNames.filter(Boolean).join('; ');
  }

  const year = String(data.publish_date || '').match(/\b(1[5-9]\d\d|20\d\d)\b/)?.[1];
  const list = (v: any) => (Array.isArray(v) ? v.join(', ') : v || '');

  return {
    title: data.title || '',
    subtitle: data.subtitle || undefined,
    authors: authors || undefined,
    year,
    publisher: list(data.publishers) || undefined,
    // "[São Paulo, Brazil]" → "São Paulo" (ABNT usa só a cidade)
    place: list(data.publish_places).replace(/[\[\]]/g, '').split(/[,;:]/)[0].trim() || undefined,
    edition: abntEdition(data.edition_name),
  };
}

async function fromGoogleBooks(isbn: string): Promise<Partial<ReferenceItem> | null> {
  const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`, { timeoutMs: 10_000 });
  const info = data?.items?.[0]?.volumeInfo;
  if (!info?.title) return null;
  return {
    title: info.title,
    subtitle: info.subtitle || undefined,
    authors: Array.isArray(info.authors) ? info.authors.join('; ') : undefined,
    year: String(info.publishedDate || '').match(/\d{4}/)?.[0],
    publisher: info.publisher || undefined,
    abstract: stripMarkup(info.description) || undefined,
  };
}
