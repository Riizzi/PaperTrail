import React from 'react';
import { BookMarked, PlusSquare, FolderTree, Search, User } from 'lucide-react';

export type TabType = 'library' | 'add' | 'collections' | 'search' | 'account';

interface NavigationProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  itemCount?: number;
}

export const Navigation: React.FC<NavigationProps> = ({ currentTab, onSelectTab, itemCount = 0 }) => {
  const tabs = [
    {
      id: 'library' as TabType,
      label: 'Biblioteca',
      icon: BookMarked,
      badge: itemCount > 0 ? String(itemCount) : undefined,
    },
    {
      id: 'add' as TabType,
      label: 'Adicionar',
      icon: PlusSquare,
    },
    {
      id: 'collections' as TabType,
      label: 'Coleções',
      icon: FolderTree,
    },
    {
      id: 'search' as TabType,
      label: 'Buscar',
      icon: Search,
    },
    {
      id: 'account' as TabType,
      label: 'Conta',
      icon: User,
    },
  ];

  return (
    <nav 
      aria-label="Navegação principal"
      className="fixed bottom-0 left-0 right-0 z-40 bg-[#FFFDF9] border-t border-[#E8DFD1] ledger-shadow"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="max-w-md mx-auto flex items-center justify-around h-14">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center min-h-[44px] min-w-[44px] h-full transition-colors relative ${
                isActive
                  ? 'text-[#292524] bg-[#FAF7F2]'
                  : 'text-[#78716C] hover:text-[#292524]'
              }`}
            >
              {isActive && (
                <div className="absolute top-0 left-2 right-2 h-[2px] bg-[#292524]" />
              )}
              <div className="relative">
                <Icon size={19} strokeWidth={isActive ? 2.2 : 1.7} />
                {tab.badge && (
                  <span className="absolute -top-1 -right-3 text-[9px] font-mono font-bold px-1 bg-[#292524] text-[#FFFDF9] leading-tight border border-[#292524]">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className={`text-[10px] mt-1 ${isActive ? 'font-semibold' : 'font-normal'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
