import React, { useState, useEffect, Suspense, lazy } from 'react';
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
import { AuthView } from './components/AuthView';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { ToastContainer, type ToastMessage } from './components/Toast';
import {
  BookMarked,
  Plus,
  Loader2,
} from 'lucide-react';

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

  // Navigation & Modals
  const [currentTab, setCurrentTab] = useState<TabType>('library');
  const [selectedItem, setSelectedItem] = useState<ReferenceItem | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [prefilledDoi, setPrefilledDoi] = useState<string | undefined>(undefined);

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

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#292524] flex flex-col font-sans">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Retro Ledger Top Header */}
      <header
        className="sticky top-0 z-30 bg-[#FFFDF9] border-b border-[#E8DFD1] ledger-shadow"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo & Identity */}
          <div
            onClick={() => setCurrentTab('library')}
            className="flex items-center gap-2.5 cursor-pointer select-none"
          >
            <div className="w-8 h-8 rounded-sm bg-[#D6CFC4] border border-[#292524] flex items-center justify-center ledger-shadow-sm">
              <svg width="20" height="20" viewBox="0 0 512 512" fill="none">
                <rect width="512" height="512" fill="#D6CFC4" />
                <path d="M 180 120 L 310 120 L 370 180 L 370 340 L 180 340 Z" fill="#EBE5DC" stroke="#1C1917" strokeWidth="24" strokeLinejoin="round" />
                <path d="M 310 120 L 310 180 L 370 180" fill="#D6CFC4" stroke="#1C1917" strokeWidth="24" strokeLinejoin="round" />
                <line x1="220" y1="210" x2="330" y2="210" stroke="#1C1917" strokeWidth="18" strokeLinecap="round" />
                <line x1="220" y1="250" x2="310" y2="250" stroke="#1C1917" strokeWidth="18" strokeLinecap="round" />
                <path d="M 275 340 C 275 390, 220 400, 200 430 C 185 450, 195 470, 240 460 C 290 450, 340 430, 360 460" stroke="#1C1917" strokeWidth="20" strokeLinecap="round" strokeDasharray="6 24" />
              </svg>
            </div>
            <div>
              <span className="font-mono font-bold text-sm text-[#292524] tracking-tight block leading-tight">
                PaperTrail
              </span>
              <span className="font-mono text-[9px] uppercase tracking-widest text-[#78716C] block leading-tight">
                Referências
              </span>
            </div>
          </div>

          {/* Header Action Button */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setPrefilledDoi(undefined);
                setIsAddOpen(true);
              }}
              className="ledger-btn-primary px-2.5 py-1 text-xs font-mono flex items-center gap-1 min-h-[36px]"
            >
              <Plus size={13} strokeWidth={2.2} />
              <span>Adicionar texto</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main View Area */}
      <main className="flex-1 max-w-md mx-auto w-full px-4 pt-3 pb-24">
        {/* PWA Install Notice */}
        <PWAInstallBanner />

        {/* Tab Content */}
        {currentTab === 'library' && (
          <div className="space-y-3.5">
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
                  onClick={() => {
                    setPrefilledDoi(undefined);
                    setIsAddOpen(true);
                  }}
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
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {currentTab === 'add' && (
          <div className="pt-2">
            <Suspense fallback={modalFallback}>
              <AddModal
                userId={currentUser.uid}
                collections={collections}
                prefilledDoi={prefilledDoi}
                onClose={() => setCurrentTab('library')}
                onSave={handleSaveItem}
                onToast={showToast}
              />
            </Suspense>
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
          />
        )}

        {currentTab === 'search' && (
          <SearchView
            items={items}
            onSelectItem={(item) => setSelectedItem(item)}
            onToggleFavorite={handleToggleFavorite}
            onToast={showToast}
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
      </main>

      {/* Bottom Tab Bar Navigation */}
      <Navigation
        currentTab={currentTab}
        onSelectTab={(t) => {
          if (t === 'add') {
            setPrefilledDoi(undefined);
            setIsAddOpen(true);
          } else {
            setCurrentTab(t);
          }
        }}
        itemCount={items.length}
      />

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

      {/* Detail Modal */}
      {selectedItem && (
        <Suspense fallback={modalFallback}>
          <ItemDetailModal
            item={selectedItem}
            collections={collections}
            onClose={() => setSelectedItem(null)}
            onUpdateItem={handleSaveItem}
            onDeleteItem={handleDeleteItem}
            onToast={showToast}
            onImportDoi={handleImportDoiFromRelated}
          />
        </Suspense>
      )}
    </div>
  );
}
