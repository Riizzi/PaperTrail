import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import type { User } from 'firebase/auth';
import type { ReferenceItem, Collection, ReadingStatus } from './types';
import {
  auth,
  subscribeToUserItems,
  subscribeToUserCollections,
  saveUserItem,
  deleteUserItem,
  saveUserCollection,
  deleteUserCollection,
  checkRedirectAuth,
} from './services/firebase';
import { deleteItemAttachments } from './services/attachments';
import { onAuthStateChanged } from 'firebase/auth';
import { Navigation, type TabType } from './components/Navigation';
import { ItemCard } from './components/ItemCard';
import { CollectionsView } from './components/CollectionsView';
import { SearchView } from './components/SearchView';
import { AccountView } from './components/AccountView';
import { cl4pCapturarDaUrl, cl4pPublicar } from './services/cl4pLink';
import { montarResumoPaper } from './services/cl4pPaper';

import { Sidebar } from './components/Sidebar';
import { Logo } from './components/Logo';
import { ShortcutsHelp } from './components/ShortcutsHelp';
import { BatchBar } from './components/BatchBar';
import { formatCollectionABNT, copyABNTToClipboard } from './services/abnt';
import { useIsDesktop, useOnline } from './hooks/useMediaQuery';
import { useShortcuts } from './hooks/useShortcuts';
import { detectInput, PDF_FILE_RE } from './services/detect';
import type { AddInitial } from './components/AddModal';
import { AuthView } from './components/AuthView';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { ToastContainer, type ToastMessage } from './components/Toast';
import {
  BookMarked,
  Plus,
  Loader2,
  FileDown,
  CheckSquare,
} from 'lucide-react';

// Vínculo com o hub CL4P-RZ vindo pela URL (?cl4p=...)
cl4pCapturarDaUrl();

// Code-split modals with React.lazy to reduce initial bundle size
const AddModal = lazy(() => import('./components/AddModal').then(m => ({ default: m.AddModal })));
const ItemDetailModal = lazy(() => import('./components/ItemDetailModal').then(m => ({ default: m.ItemDetailModal })));

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Firestore state
  const [items, setItems] = useState<ReferenceItem[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);

  // Envia o resumo da biblioteca ao hub CL4P-RZ quando os dados mudam
  useEffect(() => {
    if (!isDataLoading && items.length) cl4pPublicar('papertrail', () => montarResumoPaper(items, collections));
  }, [items, collections, isDataLoading]);

  // Navigation & Modals
  const [currentTab, setCurrentTab] = useState<TabType>('library');
  const [selectedItem, setSelectedItem] = useState<ReferenceItem | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [prefilledDoi, setPrefilledDoi] = useState<string | undefined>(undefined);
  const [addInitial, setAddInitial] = useState<AddInitial | undefined>(undefined);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const isDesktop = useIsDesktop();
  const isOnline = useOnline();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  // Library Filter state
  const [libraryFilterStatus, setLibraryFilterStatus] = useState<'all' | 'to_read' | 'reading' | 'read' | 'favorites'>('all');
  const [librarySort, setLibrarySort] = useState<'createdAt_desc' | 'year_desc' | 'author_asc' | 'title_asc'>(
    () => (localStorage.getItem('pt_library_sort') as any) || 'createdAt_desc'
  );
  useEffect(() => localStorage.setItem('pt_library_sort', librarySort), [librarySort]);

  // Ações em lote
  const [selectMode, setSelectMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const exitSelectMode = () => {
    setSelectMode(false);
    setCheckedIds(new Set());
  };
  const toggleChecked = (id: string) =>
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = `t_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2800);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Auth Listener and redirect check for iOS standalone
  useEffect(() => {
    checkRedirectAuth().catch(() => {});

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Subscriptions
  useEffect(() => {
    if (!currentUser) {
      setItems([]);
      setCollections([]);
      setIsDataLoading(false);
      return;
    }

    setIsDataLoading(true);

    const unsubItems = subscribeToUserItems(
      currentUser.uid,
      (newItems) => {
        setItems(newItems);
        setIsDataLoading(false);
      },
      () => {
        setIsDataLoading(false);
        showToast('Não foi possível carregar seus dados', 'error');
      }
    );

    const unsubCols = subscribeToUserCollections(
      currentUser.uid,
      (newCols) => {
        setCollections(newCols);
      },
      () => {
        showToast('Não foi possível carregar suas coleções', 'error');
      }
    );

    return () => {
      unsubItems();
      unsubCols();
    };
  }, [currentUser]);

  // Keep selectedItem in sync with items updates
  useEffect(() => {
    if (selectedItem) {
      const refreshed = items.find((i) => i.id === selectedItem.id);
      if (refreshed) {
        setSelectedItem(refreshed);
      }
    }
  }, [items]);

  // Actions
  const handleSaveItem = async (item: ReferenceItem) => {
    if (!currentUser) return;
    await saveUserItem(currentUser.uid, item);
  };

  const handleDeleteItem = async (id: string, silent = false) => {
    if (!currentUser) return;
    if (items.find((it) => it.id === id)?.attachment) {
      await deleteItemAttachments(id);
    }
    await deleteUserItem(currentUser.uid, id);
    if (selectedItem?.id === id) {
      setSelectedItem(null);
    }
    if (!silent) showToast('Texto excluído');
  };

  const handleToggleFavorite = async (e: React.MouseEvent, item: ReferenceItem) => {
    e.stopPropagation();
    if (!currentUser) return;
    const updated: ReferenceItem = {
      ...item,
      isFavorite: !item.isFavorite,
      updatedAt: new Date().toISOString(),
    };
    await saveUserItem(currentUser.uid, updated);
  };

  const handleImportDoiFromRelated = (doi: string) => {
    setPrefilledDoi(undefined);
    setAddInitial({ method: 'doi', value: doi });
    setIsAddOpen(true);
  };

  // Filtered Library Items
  const filteredLibraryItems = items
    .filter((item) => {
      if (libraryFilterStatus === 'favorites') return item.isFavorite;
      if (libraryFilterStatus === 'to_read') return item.status === 'to_read';
      if (libraryFilterStatus === 'reading') return item.status === 'reading';
      if (libraryFilterStatus === 'read') return item.status === 'read';
      return true;
    })
    .sort((a, b) => {
      if (librarySort === 'year_desc') return (b.year || '').localeCompare(a.year || '') || b.createdAt.localeCompare(a.createdAt);
      if (librarySort === 'author_asc') return (a.authors || a.title).localeCompare(b.authors || b.title, 'pt-BR');
      if (librarySort === 'title_asc') return a.title.localeCompare(b.title, 'pt-BR');
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

  const checkedItems = items.filter((i) => checkedIds.has(i.id));
  const batchUpdate = async (fn: (i: ReferenceItem) => ReferenceItem, msg: string) => {
    const now = new Date().toISOString();
    await Promise.all(checkedItems.map((i) => handleSaveItem({ ...fn(i), updatedAt: now })));
    showToast(msg);
  };
  const batchHandlers = {
    onSetStatus: (status: ReadingStatus) =>
      batchUpdate((i) => ({ ...i, status }), `Status alterado em ${checkedItems.length} ${checkedItems.length === 1 ? 'texto' : 'textos'}`),
    onAddToCollection: (colId: string) =>
      batchUpdate(
        (i) => ({ ...i, collectionIds: Array.from(new Set([...(i.collectionIds || []), colId])) }),
        `Adicionado à coleção "${collections.find((c) => c.id === colId)?.name || ''}"`
      ),
    onCopyABNT: async () => {
      const list = formatCollectionABNT(checkedItems);
      await copyABNTToClipboard(list.html, list.plain);
      showToast(`Lista ABNT copiada (${checkedItems.length})`);
    },
    onDelete: async () => {
      const ids = checkedItems.map((i) => i.id);
      for (const id of ids) await handleDeleteItem(id, true);
      showToast(`${ids.length} ${ids.length === 1 ? 'texto excluído' : 'textos excluídos'}`);
      exitSelectMode();
    },
  };

  const openAdd = (initial?: AddInitial) => {
    setPrefilledDoi(undefined);
    setAddInitial(initial);
    setIsAddOpen(true);
  };

  const closeAdd = () => {
    setIsAddOpen(false);
    setPrefilledDoi(undefined);
    setAddInitial(undefined);
  };

  // Colar (Ctrl+V fora de campos) ou arrastar um PDF para a janela abre o "Adicionar" já buscando
  const pasteState = useRef({ blocked: false });
  pasteState.current.blocked = !currentUser || isAddOpen || showShortcuts;
  useEffect(() => {
    const isField = (el: EventTarget | null) =>
      el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

    const onPaste = (e: ClipboardEvent) => {
      if (pasteState.current.blocked || isField(e.target)) return;
      const file = Array.from(e.clipboardData?.files || []).find((f) => PDF_FILE_RE.test(f.name));
      if (file) {
        e.preventDefault();
        return openAdd({ method: 'pdf', file });
      }
      const found = detectInput(e.clipboardData?.getData('text') || '');
      if (found) {
        e.preventDefault();
        openAdd(found);
      }
    };
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files');
    let depth = 0;
    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e) || pasteState.current.blocked) return;
      depth++;
      setIsDraggingFile(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setIsDraggingFile(false);
    };
    const onDragOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault(); // sem isso o navegador abre o arquivo e sai do app
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setIsDraggingFile(false);
      if (pasteState.current.blocked) return;
      const file = Array.from(e.dataTransfer?.files || []).find((f) => PDF_FILE_RE.test(f.name));
      if (file) openAdd({ method: 'pdf', file });
      else showToast('Solte um arquivo PDF', 'info');
    };
    window.addEventListener('paste', onPaste);
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToTab = (t: TabType) => {
    if (t === 'add') return openAdd();
    if (t === 'collections') setActiveCollectionId(null);
    if (t !== 'library') exitSelectMode();
    setCurrentTab(t);
    mainRef.current?.scrollTo({ top: 0 });
  };

  /** Anda pela lista que está na tela (a ordem vem do próprio DOM, vale para qualquer aba) */
  const moveSelection = (delta: 1 | -1) => {
    const cards = Array.from(mainRef.current?.querySelectorAll<HTMLElement>('[data-item-id]') || []);
    if (!cards.length) return;
    const ids = cards.map((c) => c.dataset.itemId!);
    const current = selectedItem ? ids.indexOf(selectedItem.id) : -1;
    const nextIndex =
      current === -1 ? (delta === 1 ? 0 : ids.length - 1) : Math.min(ids.length - 1, Math.max(0, current + delta));
    const next = items.find((i) => i.id === ids[nextIndex]);
    if (!next) return;
    setSelectedItem(next);
    cards[nextIndex].scrollIntoView({ block: 'nearest' });
    cards[nextIndex].focus({ preventScroll: true });
  };

  const overlayOpen = isAddOpen || showShortcuts;

  useShortcuts(
    {
      Escape: () => {
        if (showShortcuts) setShowShortcuts(false);
        else if (isAddOpen) closeAdd();
        else if (selectMode) exitSelectMode();
        else if (selectedItem) setSelectedItem(null);
      },
      ...(overlayOpen
        ? {}
        : {
            n: () => openAdd(),
            '/': () => {
              if (currentTab === 'search') document.querySelector<HTMLInputElement>('[data-search-input]')?.focus();
              else goToTab('search');
            },
            '?': () => setShowShortcuts(true),
            j: () => moveSelection(1),
            k: () => moveSelection(-1),
            ArrowDown: () => moveSelection(1),
            ArrowUp: () => moveSelection(-1),
          }),
    },
    !!currentUser
  );

  const modalFallback = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
      <div className="bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow p-4 font-mono text-xs flex items-center gap-2">
        <Loader2 size={16} className="animate-spin text-[#292524]" />
        <span>Carregando painel...</span>
      </div>
    </div>
  );

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center p-4">
        <div className="flex items-center gap-2 font-mono text-xs text-[#78716C]">
          <Loader2 size={16} className="animate-spin text-[#292524]" />
          <span>Iniciando PaperTrail...</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <>
        <AuthView onToast={showToast} />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  const detailProps = selectedItem
    ? {
        item: selectedItem,
        collections,
        onClose: () => setSelectedItem(null),
        onUpdateItem: handleSaveItem,
        onDeleteItem: handleDeleteItem,
        onToast: showToast,
        onImportDoi: handleImportDoiFromRelated,
        shortcutsEnabled: !overlayOpen,
      }
    : null;

  return (
    <div className="min-h-[100dvh] bg-[#FAF7F2] text-[#292524] font-sans lg:flex">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <Sidebar
        currentTab={currentTab}
        onSelectTab={goToTab}
        onAdd={() => openAdd()}
        onShowShortcuts={() => setShowShortcuts(true)}
        items={items}
        collections={collections}
        activeCollectionId={currentTab === 'collections' ? activeCollectionId : null}
        onOpenCollection={(id) => {
          setActiveCollectionId(id);
          setCurrentTab('collections');
          mainRef.current?.scrollTo({ top: 0 });
        }}
      />

      <div className="flex-1 min-w-0 flex flex-col lg:flex-row lg:h-[100dvh]">
        {/* Cabeçalho do celular/tablet (no computador fica a barra lateral) */}
        <header
          className="lg:hidden sticky top-0 z-30 bg-[#FFFDF9] border-b border-[#E8DFD1] ledger-shadow"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <div className="max-w-md md:max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
            <Logo onClick={() => goToTab('library')} />
            <button
              onClick={() => openAdd()}
              className="ledger-btn-primary px-2.5 py-1 text-xs font-mono flex items-center gap-1 min-h-[36px]"
            >
              <Plus size={13} strokeWidth={2.2} />
              <span>Adicionar texto</span>
            </button>
          </div>
        </header>

        {/* Main View Area */}
        <main ref={mainRef} className="flex-1 min-w-0 lg:overflow-y-auto">
          <div className="max-w-md md:max-w-2xl lg:max-w-3xl mx-auto w-full px-4 lg:px-8 pt-3 lg:pt-8 pb-24 lg:pb-12">
        {!isOnline && (
          <div role="status" className="mb-3 px-3 py-2 bg-[#FFF8E7] border border-[#F0D597] text-[11px] font-mono text-[#7A5B00]">
            Sem conexão. Você pode continuar usando; as mudanças sincronizam quando a internet voltar. IA e anexos ficam indisponíveis.
          </div>
        )}
        {/* PWA Install Notice */}
        <PWAInstallBanner />

        {/* Tab Content */}
        {currentTab === 'library' && (
          <div className="space-y-3.5">
            <div className="flex items-center gap-2">
              <h1 className="hidden lg:block font-mono text-lg font-bold tracking-tight mr-auto">Biblioteca</h1>
              <label htmlFor="lib-sort" className="sr-only">Ordenar</label>
              <select
                id="lib-sort"
                value={librarySort}
                onChange={(e) => setLibrarySort(e.target.value as typeof librarySort)}
                className="ml-auto lg:ml-0 bg-[#FFFDF9] border border-[#E8DFD1] px-2 py-1.5 text-xs font-mono text-[#57534E] focus:outline-none focus:border-[#292524]"
              >
                <option value="createdAt_desc">Mais recentes</option>
                <option value="year_desc">Ano de publicação</option>
                <option value="author_asc">Autor (A-Z)</option>
                <option value="title_asc">Título (A-Z)</option>
              </select>
              {items.length > 0 && (
                <button
                  onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                  aria-pressed={selectMode}
                  className={`ledger-btn px-2.5 py-1.5 text-xs font-mono flex items-center gap-1 ${
                    selectMode ? 'bg-[#292524] text-[#FAF7F2] border-[#292524]' : ''
                  }`}
                >
                  <CheckSquare size={13} />
                  {selectMode ? 'Concluir' : 'Selecionar'}
                </button>
              )}
            </div>
            {/* Folder Tab Filter Bar */}
            <div className="flex items-center justify-between border-b border-[#E8DFD1] pb-1 overflow-x-auto gap-1 text-xs font-mono">
              <div className="flex gap-1">
                {(
                  [
                    { id: 'all', label: `Todos (${items.length})` },
                    { id: 'to_read', label: 'Para ler' },
                    { id: 'reading', label: 'Lendo' },
                    { id: 'read', label: 'Lido' },
                    { id: 'favorites', label: '★ Favoritos' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setLibraryFilterStatus(tab.id)}
                    className={`folder-tab whitespace-nowrap ${
                      libraryFilterStatus === tab.id
                        ? 'bg-[#FFFDF9] text-[#292524] font-bold border-b-[#FFFDF9] translate-y-[1px]'
                        : 'text-[#78716C] hover:text-[#292524]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Content List */}
            {isDataLoading ? (
              <div className="py-12 text-center text-xs font-mono text-[#78716C] flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin text-[#292524]" />
                <span>Carregando biblioteca...</span>
              </div>
            ) : filteredLibraryItems.length === 0 ? (
              <div className="p-8 text-center bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow space-y-2">
                <BookMarked size={28} className="mx-auto text-[#A8A29E]" />
                <p className="font-mono text-xs text-[#292524] font-semibold">
                  {libraryFilterStatus === 'all'
                    ? 'Nenhum texto ainda'
                    : 'Nenhum texto neste filtro'}
                </p>
                <p className="text-[11px] text-[#78716C] font-sans">
                  Cole um DOI, ISBN ou link em qualquer lugar da tela, ou arraste um PDF.
                </p>
                <button
                  onClick={() => openAdd()}
                  className="ledger-btn px-3 py-1.5 text-xs font-mono mt-2 inline-flex items-center gap-1.5"
                >
                  <Plus size={13} />
                  <span>Adicionar primeiro texto</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredLibraryItems.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    onClick={() => setSelectedItem(item)}
                    onToggleFavorite={(e) => handleToggleFavorite(e, item)}
                    onCopyABNT={showToast}
                    isSelected={isDesktop && selectedItem?.id === item.id}
                    selectable={selectMode}
                    checked={checkedIds.has(item.id)}
                    onToggleCheck={() => toggleChecked(item.id)}
                  />
                ))}
              </div>
            )}

            {selectMode && (
              <BatchBar
                count={checkedIds.size}
                collections={collections}
                onCancel={exitSelectMode}
                onSelectAll={() => setCheckedIds(new Set(filteredLibraryItems.map((i) => i.id)))}
                {...batchHandlers}
              />
            )}
          </div>
        )}

        {currentTab === 'collections' && (
          <CollectionsView
            userId={currentUser.uid}
            collections={collections}
            items={items}
            onSaveCollection={async (col) => {
              if (currentUser) await saveUserCollection(currentUser.uid, col);
            }}
            onDeleteCollection={async (colId) => {
              if (currentUser) await deleteUserCollection(currentUser.uid, colId);
            }}
            onSelectItem={(item) => setSelectedItem(item)}
            onToggleFavorite={handleToggleFavorite}
            onToast={showToast}
            selectedCollectionId={activeCollectionId}
            onSelectCollection={setActiveCollectionId}
            selectedItemId={isDesktop ? selectedItem?.id : null}
          />
        )}

        {currentTab === 'search' && (
          <SearchView
            items={items}
            onSelectItem={(item) => setSelectedItem(item)}
            onToggleFavorite={handleToggleFavorite}
            onToast={showToast}
            selectedItemId={isDesktop ? selectedItem?.id : null}
          />
        )}

        {currentTab === 'account' && (
          <AccountView
            user={currentUser}
            itemCount={items.length}
            collectionCount={collections.length}
            items={items}
            onToast={showToast}
          />
        )}
          </div>
        </main>

        {/* Painel de detalhe (computador) */}
        {isDesktop && detailProps && (
          <aside className="w-[440px] xl:w-[520px] 2xl:w-[600px] shrink-0 h-[100dvh] border-l border-[#E8DFD1] bg-[#FFFDF9]">
            <Suspense fallback={<div className="p-6 text-xs font-mono text-[#78716C]">Carregando...</div>}>
              <ItemDetailModal key={detailProps.item.id} variant="panel" {...detailProps} />
            </Suspense>
          </aside>
        )}
      </div>

      {/* Barra de abas (celular/tablet) */}
      <div className="lg:hidden">
        <Navigation currentTab={currentTab} onSelectTab={goToTab} itemCount={items.length} />
      </div>

      {/* Floating Add Modal */}
      {isAddOpen && (
        <Suspense fallback={modalFallback}>
          <AddModal
            userId={currentUser.uid}
            collections={collections}
            prefilledDoi={prefilledDoi}
            initial={addInitial}
            onClose={closeAdd}
            onSave={handleSaveItem}
            onToast={showToast}
          />
        </Suspense>
      )}

      {/* Detalhe em tela cheia (celular/tablet) */}
      {!isDesktop && detailProps && (
        <Suspense fallback={modalFallback}>
          <ItemDetailModal key={detailProps.item.id} variant="modal" {...detailProps} />
        </Suspense>
      )}

      {showShortcuts && <ShortcutsHelp onClose={() => setShowShortcuts(false)} />}

      {isDraggingFile && (
        <div className="fixed inset-0 z-[80] pointer-events-none flex items-center justify-center bg-[#FAF7F2]/85 p-6">
          <div className="border-2 border-dashed border-[#292524] bg-[#FFFDF9] ledger-shadow-md px-10 py-8 text-center">
            <FileDown size={28} className="mx-auto mb-2 text-[#292524]" />
            <p className="font-mono text-sm font-bold">Solte o PDF para adicionar</p>
            <p className="text-xs text-[#78716C] mt-1">Os dados são lidos do arquivo e ele fica anexado.</p>
          </div>
        </div>
      )}
    </div>
  );
}
