import type { OpenAlexWork } from '../types';

/**
 * Searches OpenAlex public API for real academic works
 */
export async function searchOpenAlexWorks(searchTerms: string[], excludeTitle?: string): Promise<OpenAlexWork[]> {
  if (!searchTerms || searchTerms.length === 0) return [];

  const resultsMap = new Map<string, OpenAlexWork>();
  const normalizedExclude = (excludeTitle || '').toLowerCase().trim();

  // Query OpenAlex with the generated terms
  for (const term of searchTerms.slice(0, 3)) {
    try {
      const url = `https://api.openalex.org/works?search=${encodeURIComponent(term)}&per_page=6&sort=cited_by_count:desc&mailto=academic@papertrail.app`;
      const res = await fetch(url);

      if (!res.ok) continue;

      const data = await res.json();
      const works: OpenAlexWork[] = data.results || [];

      for (const work of works) {
        if (!work.title) continue;

        // Skip exact current title match
        if (normalizedExclude && work.title.toLowerCase().trim() === normalizedExclude) {
          continue;
        }

        const key = work.doi || work.title.toLowerCase();
        if (!resultsMap.has(key)) {
          resultsMap.set(key, work);
        }
      }

      if (resultsMap.size >= 8) break;
    } catch (err) {
      console.warn(`OpenAlex search failed for term "${term}":`, err);
    }
  }

  return Array.from(resultsMap.values()).slice(0, 8);
}
