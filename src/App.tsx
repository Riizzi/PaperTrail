import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import type { User } from 'firebase/auth';
import type { ReferenceItem, Collection } from './types';
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
import { useIsDesktop } from './hooks/useMediaQuery';
import { useShortcuts } from './hooks/useShortcuts';
import { AuthView } from './components/AuthView';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { ToastContainer, type ToastMessage } from './components/Toast';
import {
  BookMarked,
  Plus,
  Loader2,
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

  const isDesktop = useIsDesktop();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  // Library Filter state
  const [libraryFilterStatus, setLibraryFilterStatus] = useState<'all' | 'to_read' | 'reading' | 'read' | 'favorites'>('all');

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

  const handleDeleteItem = async (id: string) => {
    if (!currentUser) return;
    if (items.find((it) => it.id === id)?.attachment) {
      await deleteItemAttachments(id);
    }
    await deleteUserItem(currentUser.uid, id);
    if (selectedItem?.id === id) {
      setSelectedItem(null);
    }
    showToast('Texto excluído');
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
    setPrefilledDoi(doi);
    setIsAddOpen(true);
  };

  // Filtered Library Items
  const filteredLibraryItems = items.filter((item) => {
    if (libraryFilterStatus === 'favorites') return item.isFavorite;
    if (libraryFilterStatus === 'to_read') return item.status === 'to_read';
    if (libraryFilterStatus === 'reading') return item.status === 'reading';
    if (libraryFilterStatus === 'read') return item.status === 'read';
    return true;
  });

  const openAdd = () => {
    setPrefilledDoi(undefined);
    setIsAddOpen(true);
  };

  const goToTab = (t: TabType) => {
    if (t === 'add') return openAdd();
    if (t === 'collections') setActiveCollectionId(null);
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
        else if (isAddOpen) {
          setIsAddOpen(false);
          setPrefilledDoi(undefined);
        } else if (selectedItem) setSelectedItem(null);
      },
      ...(overlayOpen
        ? {}
        : {
            n: openAdd,
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
        onAdd={openAdd}
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
              onClick={openAdd}
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
        {/* PWA Install Notice */}
        <PWAInstallBanner />

        {/* Tab Content */}
        {currentTab === 'library' && (
          <div className="space-y-3.5">
            <h1 className="hidden lg:block font-mono text-lg font-bold tracking-tight">Biblioteca</h1>
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
                  Importe artigos por DOI, ISBN, URL, PDF ou adicione manualmente.
                </p>
                <button
                  onClick={openAdd}
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
                  />
                ))}
              </div>
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
            onClose={() => {
              setIsAddOpen(false);
              setPrefilledDoi(undefined);
            }}
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
    </div>
  );
}
