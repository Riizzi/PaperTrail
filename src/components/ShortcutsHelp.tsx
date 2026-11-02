import React from 'react';
import { X } from 'lucide-react';

const SHORTCUTS: [string[], string][] = [
  [['N'], 'Adicionar texto'],
  [['/'], 'Buscar'],
  [['J', '↓'], 'Próximo texto da lista'],
  [['K', '↑'], 'Texto anterior'],
  [['Enter'], 'Abrir texto em foco'],
  [['C'], 'Copiar ABNT do texto aberto'],
  [['F'], 'Favoritar o texto aberto'],
  [['E'], 'Editar o texto aberto'],
  [['Esc'], 'Fechar painel ou janela'],
  [['?'], 'Mostrar esta lista'],
];

export const ShortcutsHelp: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
    <div
      role="dialog"
      aria-label="Atalhos de teclado"
      onClick={(e) => e.stopPropagation()}
      className="w-full max-w-sm bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow-md"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8DFD1] bg-[#FAF7F2]">
        <span className="font-mono text-xs font-bold uppercase tracking-wider">Atalhos de teclado</span>
        <button onClick={onClose} aria-label="Fechar" className="p-1 text-[#78716C] hover:text-[#292524]">
          <X size={16} />
        </button>
      </div>
      <ul className="p-4 space-y-2">
        {SHORTCUTS.map(([keys, label]) => (
          <li key={label} className="flex items-center justify-between text-xs">
            <span className="text-[#57534E]">{label}</span>
            <span className="flex gap-1">
              {keys.map((k) => (
                <kbd key={k} className="font-mono text-[11px] px-1.5 border border-[#E8DFD1] bg-[#FAF7F2] ledger-shadow-sm">
                  {k}
                </kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  </div>
);
