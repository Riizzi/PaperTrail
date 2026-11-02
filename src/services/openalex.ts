import type { OpenAlexWork } from '../types';
import { fetchJson } from './http';

/**
 * Busca obras reais no OpenAlex (a IA só sugere os termos; as referências vêm daqui).
 * Os termos são consultados em paralelo e os resultados, sem repetir, ficam na ordem dos termos.
 */
export async function searchOpenAlexWorks(searchTerms: string[], excludeTitle?: string): Promise<OpenAlexWork[]> {
  if (!searchTerms || searchTerms.length === 0) return [];

  const normalizedExclude = (excludeTitle || '').toLowerCase().trim();
  const select = 'id,doi,title,publication_year,cited_by_count,primary_location,authorships';

  let failures = 0;
  const pages = await Promise.all(
    searchTerms.slice(0, 3).map((term) =>
      fetchJson<{ results?: OpenAlexWork[] }>(
        `https://api.openalex.org/works?search=${encodeURIComponent(term)}&per_page=6&select=${select}`,
        { timeoutMs: 10_000 }
      )
        .then((d) => d.results || [])
        .catch((err) => {
          failures++;
          console.warn(`OpenAlex: busca falhou para "${term}":`, err);
          return [] as OpenAlexWork[];
        })
    )
  );

  const resultsMap = new Map<string, OpenAlexWork>();
  for (const works of pages) {
    for (const work of works) {
      if (!work.title) continue;
      if (normalizedExclude && work.title.toLowerCase().trim() === normalizedExclude) continue;
      const key = work.doi || work.title.toLowerCase();
      if (!resultsMap.has(key)) resultsMap.set(key, work);
    }
  }

  // Todas as consultas falharam (não é o mesmo que "não achou nada")
  if (failures === pages.length) throw new Error('OpenAlex indisponível');
  return Array.from(resultsMap.values()).slice(0, 8);
}
