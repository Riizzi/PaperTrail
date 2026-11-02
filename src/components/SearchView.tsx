import React, { useState, useMemo } from 'react';
import type { ReferenceItem, SortOption, ReadingStatus, DocumentType } from '../types';
import { ItemCard } from './ItemCard';
import { scoreItem } from '../services/search';
import { Search, SlidersHorizontal, X } from 'lucide-react';

interface SearchViewProps {
  items: ReferenceItem[];
  onSelectItem: (item: ReferenceItem) => void;
  onToggleFavorite: (e: React.MouseEvent, item: ReferenceItem) => void;
  onToast: (msg: string) => void;
  selectedItemId?: string | null;
}

export const SearchView: React.FC<SearchViewProps> = ({
  items,
  onSelectItem,
  onToggleFavorite,
  onToast,
  selectedItemId,
}) => {
  const [queryText, setQueryText] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('relevance');
  const [filterStatus, setFilterStatus] = useState<ReadingStatus | 'all'>('all');
  const [filterType, setFilterType] = useState<DocumentType | 'all'>('all');
  const [filterFavoriteOnly, setFilterFavoriteOnly] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Extract all unique tags
  const allTags = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => {
      it.tags?.forEach((t) => set.add(t));
    });
    return Array.from(set).sort();
  }, [items]);

  // Filter & Sort
  const filteredItems = useMemo(() => {
    const q = queryText.trim();
    const scores = new Map<string, number>();

    return items
      .filter((item) => {
        // Busca sem acento por título, autores, ano, tags, DOI, resumo, palavras-chave e apontamentos
        if (q) {
          const score = scoreItem(item, q);
          if (!score) return false;
          scores.set(item.id, score);
        }

        // Reading status
        if (filterStatus !== 'all' && item.status !== filterStatus) {
          return false;
        }

        // Document type
        if (filterType !== 'all' && item.type !== filterType) {
          return false;
        }

        // Favorites
        if (filterFavoriteOnly && !item.isFavorite) {
          return false;
        }

        // Selected tag
        if (selectedTag && !item.tags?.includes(selectedTag)) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        switch (sortOption) {
          case 'relevance':
            return q
              ? (scores.get(b.id) || 0) - (scores.get(a.id) || 0)
              : (b.createdAt || '').localeCompare(a.createdAt || '');
          case 'createdAt_desc':
            return (b.createdAt || '').localeCompare(a.createdAt || '');
          case 'createdAt_asc':
            return (a.createdAt || '').localeCompare(b.createdAt || '');
          case 'year_desc':
            return (b.year || '').localeCompare(a.year || '');
          case 'year_asc':
            return (a.year || '').localeCompare(b.year || '');
          case 'author_asc':
            return (a.authors || a.title || '').localeCompare(b.authors || b.title || '', 'pt-BR');
          case 'title_asc':
            return (a.title || '').localeCompare(b.title || '', 'pt-BR');
          default:
            return 0;
        }
      });
  }, [items, queryText, sortOption, filterStatus, filterType, filterFavoriteOnly, selectedTag]);

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          data-search-input
          placeholder="Título, autor, ano, tag, DOI, resumo ou apontamento"
          className="w-full bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow p-3 pl-9 text-xs font-sans text-[#292524] focus:outline-none focus:border-[#292524]"
          autoFocus
        />
        <Search size={15} className="absolute left-3 top-3.5 text-[#78716C]" />
        {queryText && (
          <button
            onClick={() => setQueryText('')}
            className="absolute right-3 top-3 text-[#78716C] hover:text-[#292524] p-0.5"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Filter and Sort Toolbar */}
      <div className="p-3 bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow space-y-2.5 text-xs font-mono">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Sort */}
          <div>
            <label className="block text-[11px] text-[#78716C] mb-1 font-sans">
              Ordenar por
            </label>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-1.5 text-xs font-mono text-[#292524]"
            >
              <option value="relevance">Relevância (ou mais recentes, sem busca)</option>
              <option value="createdAt_desc">Data de adição (mais recentes)</option>
              <option value="createdAt_asc">Data de adição (mais antigos)</option>
              <option value="year_desc">Ano de publicação (mais recentes)</option>
              <option value="year_asc">Ano de publicação (mais antigos)</option>
              <option value="author_asc">Autor (A-Z)</option>
              <option value="title_asc">Título (A-Z)</option>
            </select>
          </div>

          {/* Type Filter */}
          <div>
            <label className="block text-[11px] text-[#78716C] mb-1 font-sans">
              Tipo de obra
            </label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-1.5 text-xs font-mono text-[#292524]"
            >
              <option value="all">Todos os tipos</option>
              <option value="article">Artigo de periódico</option>
              <option value="book">Livro</option>
              <option value="chapter">Capítulo</option>
              <option value="thesis">Tese / TCC</option>
              <option value="conference">Evento / Anais</option>
              <option value="webpage">Página Web</option>
            </select>
          </div>
        </div>

        {/* Quick Filter Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[#F0E9DF]">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-2 py-0.5 text-[11px] border ${
              filterStatus === 'all' ? 'bg-[#292524] text-[#FAF7F2] border-[#292524]' : 'bg-[#FAF7F2] text-[#57534E] border-[#E8DFD1]'
            }`}
          >
            Todos status
          </button>
          <button
            onClick={() => setFilterStatus('to_read')}
            className={`px-2 py-0.5 text-[11px] border ${
              filterStatus === 'to_read' ? 'bg-[#292524] text-[#FAF7F2] border-[#292524]' : 'bg-[#FAF7F2] text-[#57534E] border-[#E8DFD1]'
            }`}
          >
            Para ler
          </button>
          <button
            onClick={() => setFilterStatus('reading')}
            className={`px-2 py-0.5 text-[11px] border ${
              filterStatus === 'reading' ? 'bg-[#292524] text-[#FAF7F2] border-[#292524]' : 'bg-[#FAF7F2] text-[#57534E] border-[#E8DFD1]'
            }`}
          >
            Lendo
          </button>
          <button
            onClick={() => setFilterStatus('read')}
            className={`px-2 py-0.5 text-[11px] border ${
              filterStatus === 'read' ? 'bg-[#292524] text-[#FAF7F2] border-[#292524]' : 'bg-[#FAF7F2] text-[#57534E] border-[#E8DFD1]'
            }`}
          >
            Lido
          </button>

          <button
            onClick={() => setFilterFavoriteOnly(!filterFavoriteOnly)}
            className={`px-2 py-0.5 text-[11px] border ${
              filterFavoriteOnly ? 'bg-[#292524] text-[#FAF7F2] border-[#292524]' : 'bg-[#FAF7F2] text-[#57534E] border-[#E8DFD1]'
            }`}
          >
            ★ Favoritos
          </button>
        </div>

        {/* Tags row */}
        {allTags.length > 0 && (
          <div className="pt-2 border-t border-[#F0E9DF] flex flex-wrap items-center gap-1">
            <span className="text-[10px] text-[#78716C] uppercase mr-1">Tags:</span>
            {selectedTag && (
              <button
                onClick={() => setSelectedTag(null)}
                className="folder-chip bg-[#292524] text-[#FAF7F2]"
              >
                #{selectedTag} ×
              </button>
            )}
            {allTags.map((t) => {
              if (t === selectedTag) return null;
              return (
                <button
                  key={t}
                  onClick={() => setSelectedTag(t)}
                  className="folder-chip hover:bg-[#E8DFD1]"
                >
                  #{t}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Results List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-mono text-[#78716C]">
          <span>
            {filteredItems.length} {filteredItems.length === 1 ? 'resultado encontrado' : 'resultados encontrados'}
          </span>
        </div>

        {filteredItems.length === 0 ? (
          <div className="p-8 text-center bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow">
            <p className="text-xs font-mono text-[#78716C]">
              Nenhum texto encontrado para os filtros atuais.
            </p>
          </div>
        ) : (
          filteredItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onClick={() => onSelectItem(item)}
              onToggleFavorite={(e) => onToggleFavorite(e, item)}
              onCopyABNT={onToast}
              isSelected={selectedItemId === item.id}
            />
          ))
        )}
      </div>
    </div>
  );
};
