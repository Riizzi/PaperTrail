import React from 'react';
import { BookMarked, FolderTree, Search, User, Plus, Folder, Keyboard } from 'lucide-react';
import type { Collection, ReferenceItem } from '../types';
import type { TabType } from './Navigation';
import { Logo } from './Logo';

interface SidebarProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  onAdd: () => void;
  onShowShortcuts: () => void;
  items: ReferenceItem[];
  collections: Collection[];
  activeCollectionId: string | null;
  onOpenCollection: (id: string) => void;
}

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="font-mono text-[10px] px-1 border border-[#E8DFD1] bg-[#FAF7F2] text-[#78716C] leading-4 min-w-4 text-center">
    {children}
  </kbd>
);

/** Navegação do computador (≥ 1024 px). No celular fica a barra de abas embaixo. */
export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  onAdd,
  onShowShortcuts,
  items,
  collections,
  activeCollectionId,
  onOpenCollection,
}) => {
  const nav: { id: TabType; label: string; icon: typeof BookMarked; count?: number; key?: string }[] = [
    { id: 'library', label: 'Biblioteca', icon: BookMarked, count: items.length },
    { id: 'search', label: 'Buscar', icon: Search, key: '/' },
    { id: 'collections', label: 'Coleções', icon: FolderTree, count: collections.length },
    { id: 'account', label: 'Conta', icon: User },
  ];

  const countByCollection = (id: string) => items.filter((i) => i.collectionIds?.includes(id)).length;
  const sortedCollections = [...collections].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  return (
    <aside className="hidden lg:flex w-60 shrink-0 h-[100dvh] sticky top-0 flex-col border-r border-[#E8DFD1] bg-[#FFFDF9]">
      <div className="px-4 h-16 flex items-center border-b border-[#E8DFD1]">
        <Logo onClick={() => onSelectTab('library')} />
      </div>

      <div className="p-3">
        <button onClick={onAdd} className="ledger-btn-primary w-full px-3 py-2 text-xs font-mono flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Plus size={14} strokeWidth={2.2} />
            Adicionar texto
          </span>
          <kbd className="font-mono text-[10px] px-1 border border-[#57534E] text-[#D6D3D1] leading-4">N</kbd>
        </button>
      </div>

      <nav aria-label="Navegação principal" className="px-2 space-y-0.5">
        {nav.map(({ id, label, icon: Icon, count, key }) => {
          const active = currentTab === id && !(id === 'collections' && activeCollectionId);
          return (
            <button
              key={id}
              onClick={() => onSelectTab(id)}
              aria-current={active ? 'page' : undefined}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-[13px] border transition-colors ${
                active
                  ? 'bg-[#FAF7F2] border-[#E8DFD1] text-[#292524] font-semibold ledger-shadow-sm'
                  : 'border-transparent text-[#57534E] hover:text-[#292524] hover:bg-[#FAF7F2]'
              }`}
            >
              <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
              <span className="flex-1 text-left">{label}</span>
              {count !== undefined && <span className="font-mono text-[11px] text-[#A8A29E]">{count}</span>}
              {key && <Kbd>{key}</Kbd>}
            </button>
          );
        })}
      </nav>

      {sortedCollections.length > 0 && (
        <div className="mt-5 flex-1 min-h-0 flex flex-col">
          <p className="px-4 pb-1.5 font-mono text-[10px] uppercase tracking-widest text-[#A8A29E]">Coleções</p>
          <div className="px-2 overflow-y-auto space-y-0.5 pb-3">
            {sortedCollections.map((col) => {
              const active = currentTab === 'collections' && activeCollectionId === col.id;
              return (
                <button
                  key={col.id}
                  onClick={() => onOpenCollection(col.id)}
                  title={col.name}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-[13px] border ${
                    active
                      ? 'bg-[#FAF7F2] border-[#E8DFD1] text-[#292524] font-semibold'
                      : 'border-transparent text-[#57534E] hover:text-[#292524] hover:bg-[#FAF7F2]'
                  }`}
                >
                  <Folder size={14} strokeWidth={1.8} className="shrink-0" />
                  <span className="flex-1 text-left truncate">{col.name}</span>
                  <span className="font-mono text-[11px] text-[#A8A29E]">{countByCollection(col.id)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-auto p-3 border-t border-[#E8DFD1]">
        <button
          onClick={onShowShortcuts}
          className="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-mono text-[#78716C] hover:text-[#292524]"
        >
          <Keyboard size={14} />
          <span className="flex-1 text-left">Atalhos</span>
          <Kbd>?</Kbd>
        </button>
      </div>
    </aside>
  );
};
