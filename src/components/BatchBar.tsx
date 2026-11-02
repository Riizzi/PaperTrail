import React, { useState } from 'react';
import { X, Copy, Trash2, FolderPlus, Loader2 } from 'lucide-react';
import type { Collection, ReadingStatus } from '../types';

interface BatchBarProps {
  count: number;
  collections: Collection[];
  onCancel: () => void;
  onSelectAll: () => void;
  onSetStatus: (s: ReadingStatus) => Promise<void>;
  onAddToCollection: (id: string) => Promise<void>;
  onCopyABNT: () => Promise<void>;
  onDelete: () => Promise<void>;
}

/** Barra de ações para os textos marcados (fica presa embaixo da lista) */
export const BatchBar: React.FC<BatchBarProps> = ({
  count,
  collections,
  onCancel,
  onSelectAll,
  onSetStatus,
  onAddToCollection,
  onCopyABNT,
  onDelete,
}) => {
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || count === 0;
  const selectCls =
    'ledger-btn px-2 py-1.5 text-xs font-mono bg-[#FFFDF9] max-w-[150px] disabled:opacity-50 cursor-pointer';

  return (
    <div
      className="fixed lg:sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-4 left-0 right-0 z-30 px-3 lg:px-0"
      role="toolbar"
      aria-label="Ações nos textos marcados"
    >
      <div className="max-w-md md:max-w-2xl lg:max-w-none mx-auto bg-[#292524] text-[#FAF7F2] border border-[#292524] shadow-[3px_3px_0_#A8A29E] p-2 flex flex-wrap items-center gap-2">
        <button onClick={onCancel} aria-label="Sair da seleção" className="p-1.5 text-[#D6D3D1] hover:text-white">
          <X size={16} />
        </button>
        <span className="font-mono text-xs font-bold mr-1">
          {count} {count === 1 ? 'marcado' : 'marcados'}
        </span>
        <button onClick={onSelectAll} className="font-mono text-[11px] underline underline-offset-2 text-[#D6D3D1] hover:text-white mr-auto">
          Marcar todos
        </button>

        {busy && <Loader2 size={14} className="animate-spin" />}

        <label className="sr-only" htmlFor="batch-status">Mudar status</label>
        <select
          id="batch-status"
          disabled={disabled}
          value=""
          onChange={(e) => e.target.value && run(() => onSetStatus(e.target.value as ReadingStatus))()}
          className={`${selectCls} text-[#292524]`}
        >
          <option value="">Status...</option>
          <option value="to_read">Para ler</option>
          <option value="reading">Lendo</option>
          <option value="read">Lido</option>
        </select>

        {collections.length > 0 && (
          <>
            <label className="sr-only" htmlFor="batch-col">Adicionar à coleção</label>
            <span className="relative inline-flex items-center">
              <FolderPlus size={12} className="absolute left-2 text-[#57534E] pointer-events-none" />
              <select
                id="batch-col"
                disabled={disabled}
                value=""
                onChange={(e) => e.target.value && run(() => onAddToCollection(e.target.value))()}
                className={`${selectCls} pl-6 text-[#292524]`}
              >
                <option value="">Coleção...</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </span>
          </>
        )}

        <button
          onClick={run(onCopyABNT)}
          disabled={disabled}
          className="ledger-btn px-2 py-1.5 text-xs font-mono bg-[#FFFDF9] text-[#292524] flex items-center gap-1 disabled:opacity-50"
        >
          <Copy size={12} />
          ABNT
        </button>

        {confirmDelete ? (
          <button
            onClick={run(async () => {
              await onDelete();
              setConfirmDelete(false);
            })}
            disabled={disabled}
            className="px-2 py-1.5 text-xs font-mono bg-[#991B1B] border border-[#991B1B] text-white flex items-center gap-1"
          >
            <Trash2 size={12} />
            Confirmar exclusão
          </button>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={disabled}
            aria-label="Excluir marcados"
            className="p-1.5 text-[#FCA5A5] hover:text-white disabled:opacity-50"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  );
};
