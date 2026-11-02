import type { ReferenceItem } from '../types';

/** minúsculas e sem acento: "Educação" → "educacao" */
export const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

// Peso de cada campo: achar no título vale mais que achar no resumo
const FIELDS: [number, (i: ReferenceItem) => string | undefined][] = [
  [10, (i) => i.title],
  [6, (i) => i.subtitle],
  [8, (i) => i.authors],
  [5, (i) => i.tags?.join(' ')],
  [5, (i) => i.keywords?.join(' ')],
  [4, (i) => i.year],
  [4, (i) => i.doi],
  [3, (i) => i.publication],
  [3, (i) => i.publisher],
  [3, (i) => i.institution],
  [3, (i) => i.bookTitle],
  [2, (i) => i.notesList?.map((n) => `${n.text} ${n.page || ''}`).join(' ') || i.notes],
  [1, (i) => i.abstract],
  [1, (i) => i.summary],
  [1, (i) => i.keyPoints?.join(' ')],
];

/**
 * Pontua o texto para a busca. Cada palavra digitada precisa aparecer em algum campo
 * (sem diferenciar acento); a pontuação soma os pesos dos campos onde aparece.
 * Retorna 0 se não casar.
 */
export function scoreItem(item: ReferenceItem, query: string): number {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return 1;
  const fields = FIELDS.map(([w, get]) => [w, fold(get(item) || '')] as const);
  let total = 0;
  for (const term of terms) {
    let best = 0;
    for (const [w, text] of fields) {
      if (!text) continue;
      const idx = text.indexOf(term);
      if (idx === -1) continue;
      // começo de palavra vale um pouco mais
      const atWordStart = idx === 0 || /[^a-z0-9]/.test(text[idx - 1]);
      best += w * (atWordStart ? 1.5 : 1);
    }
    if (!best) return 0;
    total += best;
  }
  return total;
}

export function searchItems(items: ReferenceItem[], query: string): ReferenceItem[] {
  if (!query.trim()) return items;
  return items
    .map((item) => ({ item, score: scoreItem(item, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.item);
}
