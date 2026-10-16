/** Resumo da biblioteca para o hub CL4P-RZ (contrato "papertrail", schema 1). */
import type { Collection, ReferenceItem } from '../types';

const STATUS: Record<string, string> = { to_read: 'quero_ler', reading: 'lendo', read: 'lido' };

export function montarResumoPaper(items: ReferenceItem[], collections: Collection[]) {
  const nomes = new Map(collections.map((c) => [c.id, c.name]));
  return {
    items: items.map((i) => ({
      id: i.id,
      title: i.subtitle ? `${i.title}: ${i.subtitle}` : i.title,
      authors: i.authors,
      year: i.year,
      type: i.type,
      status: STATUS[i.status] || i.status,
      favorite: i.isFavorite,
      tags: i.tags,
      collections: i.collectionIds.map((id) => nomes.get(id)).filter(Boolean),
      addedAt: i.createdAt,
      updatedAt: i.updatedAt,
      hasSummary: Boolean(i.summary),
      notesCount: i.notesList?.length ?? 0,
    })),
  };
}
