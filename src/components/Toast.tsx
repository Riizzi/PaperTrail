import React from 'react';

export interface ToastMessage {
  id: string;
  text: string;
  type?: 'success' | 'error' | 'info';
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none px-4 w-full max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => onDismiss(t.id)}
          className={`pointer-events-auto px-4 py-2 border text-xs font-mono font-medium ledger-shadow flex items-center justify-between gap-3 transition-all ${
            t.type === 'error'
              ? 'bg-[#FFF5F5] border-[#E8B4B4] text-[#991B1B]'
              : 'bg-[#FFFDF9] border-[#E8DFD1] text-[#292524]'
          }`}
        >
          <span>{t.text}</span>
          <span className="text-[10px] text-[#78716C] cursor-pointer">✕</span>
        </div>
      ))}
    </div>
  );
};
