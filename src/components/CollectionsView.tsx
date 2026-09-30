import React, { useState } from 'react';
import type { Collection, ReferenceItem } from '../types';
import { ItemCard } from './ItemCard';
import {
  FolderPlus,
  Folder,
  Copy,
  Download,
  Trash2,
  ArrowLeft,
  BookOpen,
} from 'lucide-react';
import { formatCollectionABNT, copyABNTToClipboard, exportToBibTeX } from '../services/abnt';

interface CollectionsViewProps {
  userId: string;
  collections: Collection[];
  items: ReferenceItem[];
  onSaveCollection: (collection: Collection) => Promise<void>;
  onDeleteCollection: (id: string) => Promise<void>;
  onSelectItem: (item: ReferenceItem) => void;
  onToggleFavorite: (e: React.MouseEvent, item: ReferenceItem) => void;
  onToast: (msg: string) => void;
}

export const CollectionsView: React.FC<CollectionsViewProps> = ({
  userId,
  collections,
  items,
  onSaveCollection,
  onDeleteCollection,
  onSelectItem,
  onToggleFavorite,
  onToast,
}) => {
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColDesc, setNewColDesc] = useState('');

  const selectedCollection = collections.find((c) => c.id === selectedCollectionId);
  const collectionItems = selectedCollectionId
    ? items.filter((item) => item.collectionIds?.includes(selectedCollectionId))
    : [];

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim()) return;

    const newCol: Collection = {
      id: `col_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      userId,
      name: newColName.trim(),
      description: newColDesc.trim() || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await onSaveCollection(newCol);
      setNewColName('');
      setNewColDesc('');
      setIsCreating(false);
      onToast('Coleção criada');
    } catch {
      onToast('Erro ao criar coleção');
    }
  };

  const handleCopyAllABNT = async () => {
    if (collectionItems.length === 0) {
      onToast('Nenhum texto nesta coleção para copiar.');
      return;
    }
    const { html, plain } = formatCollectionABNT(collectionItems);
    await copyABNTToClipboard(html, plain);
    onToast('Referências da coleção copiadas em ABNT');
  };

  const handleExportBibTeX = () => {
    if (collectionItems.length === 0) {
      onToast('Nenhum texto nesta coleção para exportar.');
      return;
    }
    const bib = exportToBibTeX(collectionItems);
    const blob = new Blob([bib], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(selectedCollection?.name || 'colecao').toLowerCase().replace(/\s+/g, '_')}.bib`;
    link.click();
    URL.revokeObjectURL(url);
    onToast('Arquivo BibTeX exportado');
  };

  const handleDeleteCurrent = async () => {
    if (!selectedCollectionId) return;
    if (confirm('Tem certeza que deseja excluir esta coleção? Os textos permanecerão na biblioteca.')) {
      await onDeleteCollection(selectedCollectionId);
      setSelectedCollectionId(null);
      onToast('Coleção excluída');
    }
  };

  return (
    <div className="space-y-4">
      {/* If a collection is selected, show detail view */}
      {selectedCollection ? (
        <div className="space-y-4">
          <div className="bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-[#F0E9DF] pb-2">
              <button
                onClick={() => setSelectedCollectionId(null)}
                className="ledger-btn px-2.5 py-1 text-xs font-mono flex items-center gap-1.5"
              >
                <ArrowLeft size={13} />
                <span>Todas as coleções</span>
              </button>

              <button
                onClick={handleDeleteCurrent}
                aria-label="Excluir coleção"
                className="text-[#991B1B] hover:text-[#DC2626] p-1"
                title="Excluir coleção"
              >
                <Trash2 size={15} />
              </button>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <Folder size={18} strokeWidth={1.8} className="text-[#292524]" />
                <h2 className="font-sans font-bold text-base text-[#292524]">
                  {selectedCollection.name}
                </h2>
              </div>
              {selectedCollection.description && (
                <p className="text-xs font-sans text-[#78716C] mt-0.5">
                  {selectedCollection.description}
                </p>
              )}
              <span className="font-mono text-[11px] text-[#78716C] block mt-1">
                {collectionItems.length} {collectionItems.length === 1 ? 'texto' : 'textos'} catalogados
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-[#F0E9DF]">
              <button
                onClick={handleCopyAllABNT}
                className="ledger-btn-primary px-3 py-1.5 text-xs font-mono flex items-center gap-1.5"
              >
                <Copy size={13} strokeWidth={2} />
                <span>Copiar referências da coleção</span>
              </button>

              <button
                onClick={handleExportBibTeX}
                className="ledger-btn px-3 py-1.5 text-xs font-mono flex items-center gap-1.5 bg-[#FAF7F2]"
              >
                <Download size={13} strokeWidth={1.8} />
                <span>Exportar BibTeX</span>
              </button>
            </div>
          </div>

          {/* Collection Items */}
          {collectionItems.length === 0 ? (
            <div className="p-8 text-center bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow">
              <BookOpen size={24} className="mx-auto mb-2 text-[#A8A29E]" />
              <p className="text-xs font-mono text-[#78716C]">
                Nenhum texto associado a esta coleção.
              </p>
              <p className="text-[11px] text-[#A8A29E] mt-1 font-sans">
                Edite um texto na biblioteca para adicioná-lo aqui.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {collectionItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onClick={() => onSelectItem(item)}
                  onToggleFavorite={(e) => onToggleFavorite(e, item)}
                  onCopyABNT={onToast}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* List of All Collections */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[#57534E]">
              Coleções acadêmicas ({collections.length})
            </h2>
            <button
              onClick={() => setIsCreating(!isCreating)}
              className="ledger-btn px-2.5 py-1 text-xs font-mono flex items-center gap-1.5 bg-[#FFFDF9]"
            >
              <FolderPlus size={13} />
              <span>Nova coleção</span>
            </button>
          </div>

          {isCreating && (
            <form
              onSubmit={handleCreateCollection}
              className="p-4 bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow space-y-3 text-xs"
            >
              <div>
                <label className="block text-[#57534E] mb-1 font-sans font-semibold">
                  Nome da coleção *
                </label>
                <input
                  type="text"
                  placeholder="ex: Projeto TCC, Inteligência Artificial, Seminário 2"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-sans text-xs focus:outline-none focus:border-[#292524]"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="block text-[#57534E] mb-1 font-sans">
                  Descrição (opcional)
                </label>
                <input
                  type="text"
                  placeholder="ex: Leituras fundamentais para o capítulo 3"
                  value={newColDesc}
                  onChange={(e) => setNewColDesc(e.target.value)}
                  className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-sans text-xs focus:outline-none focus:border-[#292524]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#F0E9DF]">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="ledger-btn px-3 py-1.5 font-mono text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="ledger-btn-primary px-3 py-1.5 font-mono text-xs"
                >
                  Criar coleção
                </button>
              </div>
            </form>
          )}

          {collections.length === 0 && !isCreating ? (
            <div className="p-8 text-center bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow">
              <Folder size={24} className="mx-auto mb-2 text-[#A8A29E]" />
              <p className="text-xs font-mono text-[#78716C]">
                Nenhuma coleção criada ainda.
              </p>
              <button
                onClick={() => setIsCreating(true)}
                className="ledger-btn px-3 py-1.5 text-xs font-mono mt-3"
              >
                Criar primeira coleção
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {collections.map((col) => {
                const count = items.filter((it) => it.collectionIds?.includes(col.id)).length;
                return (
                  <div
                    key={col.id}
                    onClick={() => setSelectedCollectionId(col.id)}
                    className="p-3.5 bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow cursor-pointer hover:-translate-y-0.5 transition-transform flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Folder size={16} strokeWidth={1.8} className="text-[#292524]" />
                        <h3 className="font-sans font-semibold text-sm text-[#292524]">
                          {col.name}
                        </h3>
                      </div>
                      {col.description && (
                        <p className="text-xs font-sans text-[#78716C] line-clamp-2">
                          {col.description}
                        </p>
                      )}
                    </div>

                    <div className="mt-3 pt-2 border-t border-[#F0E9DF] flex items-center justify-between text-xs font-mono text-[#78716C]">
                      <span>{count} {count === 1 ? 'texto' : 'textos'}</span>
                      <span className="text-[11px] hover:underline">Abrir →</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
