import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Letter } from '../types';
import { LETTER_COLORS } from '../services/letters';
import { LetterNote } from './LetterNote';

interface CornerLetterProps {
  userId: string;
  /** cartinhas em ordem do mais recente para o mais antigo */
  letters: Letter[];
  unreadCount: number;
  onOpen: () => void;
  /** no computador, desloca para não ficar por cima do painel de detalhe */
  besidePanel?: boolean;
}

// O "fechado" fica só neste aparelho (localStorage); nada é gravado no Firestore.
const storageKey = (uid: string) => `papertrail:cartinha-fechada:${uid}`;

function readDismissed(uid: string): string | null {
  try {
    return localStorage.getItem(storageKey(uid));
  } catch {
    return null;
  }
}

/**
 * Post-it colado no canto da tela com a cartinha mais recente.
 * Fica lá mesmo depois de lida; o × dobra o papel até chegar outra cartinha.
 */
export const CornerLetter: React.FC<CornerLetterProps> = ({ userId, letters, unreadCount, onOpen, besidePanel }) => {
  const latest = letters[0];
  const [dismissedId, setDismissedId] = useState<string | null>(() => readDismissed(userId));

  useEffect(() => setDismissedId(readDismissed(userId)), [userId]);

  if (!latest) return null;

  const folded = dismissedId === latest.id;
  const setFolded = (value: boolean) => {
    const next = value ? latest.id : null;
    setDismissedId(next);
    try {
      if (next) localStorage.setItem(storageKey(userId), next);
      else localStorage.removeItem(storageKey(userId));
    } catch {
      /* modo privado: vale só nesta sessão */
    }
  };

  const position = `fixed z-20 right-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-5 ${
    besidePanel ? 'lg:right-[460px] xl:right-[540px] 2xl:right-[620px]' : 'lg:right-6'
  }`;
  const c = LETTER_COLORS[latest.color] || LETTER_COLORS.amarelo;

  if (folded) {
    return (
      <button
        onClick={() => setFolded(false)}
        className={`${position} w-11 h-11 border shadow-[2px_2px_0_#E5DCD0] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none`}
        style={{
          backgroundColor: c.bg,
          borderColor: c.border,
          clipPath: 'polygon(0 0, 100% 0, 100% 100%, 30% 100%, 0 70%)',
        }}
        aria-label="Mostrar a última cartinha"
        title="Mostrar a última cartinha"
      >
        <span aria-hidden="true" className="absolute left-0 bottom-0 w-[13px] h-[13px] bg-[#E8DFD1]" style={{ clipPath: 'polygon(0 0, 100% 100%, 0 100%)' }} />
      </button>
    );
  }

  return (
    <div className={`${position} w-[min(15rem,calc(100vw-1.5rem))] lg:w-64`}>
      <LetterNote color={latest.color} tilt={1.2} className="!px-3 !pt-5 !pb-2.5 lg:!px-4 lg:!pt-6">
        <button
          onClick={() => setFolded(true)}
          className="absolute top-1 right-1 p-1.5 text-[#57534E] hover:text-[#292524]"
          aria-label="Dobrar o post-it"
          title="Dobrar"
        >
          <X size={14} strokeWidth={2.2} />
        </button>
        <button onClick={onOpen} className="block w-full text-left" aria-label="Abrir cartinhas">
          {unreadCount > 0 && (
            <span className="inline-block mb-1 font-mono text-[9px] font-bold uppercase tracking-wider bg-[#292524] text-[#FAF7F2] px-1">
              {unreadCount === 1 ? 'nova' : `${unreadCount} novas`}
            </span>
          )}
          <p className="text-[13px] lg:text-sm leading-relaxed whitespace-pre-wrap break-words line-clamp-4 lg:line-clamp-6">
            {latest.text}
          </p>
          {latest.from && <p className="mt-1.5 text-right font-mono text-[11px] text-[#57534E]">— {latest.from}</p>}
        </button>
      </LetterNote>
    </div>
  );
};
