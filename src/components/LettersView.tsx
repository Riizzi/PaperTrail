import React, { useEffect, useRef, useState } from 'react';
import { Mail, Link2, RefreshCw, Trash2, Copy } from 'lucide-react';
import type { Letter } from '../types';
import { getLetterLink, markLettersRead, deleteLetter } from '../services/letters';
import { LetterNote, tiltFor } from './LetterNote';

interface LettersViewProps {
  userId: string;
  letters: Letter[];
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function formatLetterDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `hoje, ${time}`;
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')}, ${time}`;
}

/** Mural de cartinhas recebidas + link para quem escreve */
export const LettersView: React.FC<LettersViewProps> = ({ userId, letters, onToast }) => {
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRenew, setConfirmRenew] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // ids que chegaram sem ler enquanto o mural esteve aberto (o selo fica até sair da tela)
  const freshIds = useRef(new Set<string>());

  // Abriu o mural: as novas viram lidas (o selo "nova" continua até sair da tela)
  useEffect(() => {
    const unread = letters.filter((l) => !l.readAt).map((l) => l.id);
    unread.forEach((id) => freshIds.current.add(id));
    if (!unread.length) return;
    const t = setTimeout(() => markLettersRead(userId, unread).catch(() => {}), 1200);
    return () => clearTimeout(t);
  }, [letters, userId]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onToast('Link copiado');
    } catch {
      onToast('Não consegui copiar; selecione o link e copie à mão', 'info');
    }
  };

  const loadLink = async (renew = false) => {
    setBusy(true);
    try {
      const l = await getLetterLink(userId, renew);
      setLink(l);
      if (renew) {
        setConfirmRenew(false);
        onToast('Link novo gerado; o anterior parou de funcionar');
      }
      return l;
    } catch {
      onToast('Não foi possível gerar o link agora', 'error');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    const l = link || (await loadLink());
    if (!l) return;
    if (navigator.share) {
      navigator.share({ title: 'Cartinhas', url: l }).catch(() => {});
    } else {
      copy(l);
    }
  };

  return (
    <div className="space-y-5">
      <h1 className="hidden lg:block font-mono text-lg font-bold tracking-tight">Cartinhas</h1>

      {letters.length === 0 ? (
        <div className="p-8 text-center bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow space-y-2">
          <Mail size={28} className="mx-auto text-[#A8A29E]" />
          <p className="font-mono text-xs font-semibold">Nenhuma cartinha ainda</p>
          <p className="text-[11px] text-[#78716C]">
            Mande o link abaixo para quem quiser te deixar mensagens. Elas aparecem aqui.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-7 pt-2">
          {letters.map((l) => (
            <LetterNote key={l.id} color={l.color} tilt={tiltFor(l.id)}>
              {(!l.readAt || freshIds.current.has(l.id)) && (
                <span className="absolute top-1.5 right-2 font-mono text-[9px] font-bold uppercase tracking-wider bg-[#292524] text-[#FAF7F2] px-1">
                  nova
                </span>
              )}
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{l.text}</p>
              <div className="mt-3 flex items-end justify-between gap-2">
                <span className="font-mono text-[10px] text-[#78716C]">{formatLetterDate(l.createdAt)}</span>
                {l.from && <span className="font-mono text-xs text-[#57534E] text-right">— {l.from}</span>}
              </div>
              <div className="mt-2 flex justify-end">
                {confirmDeleteId === l.id ? (
                  <span className="flex items-center gap-2 font-mono text-[11px]">
                    <button onClick={() => setConfirmDeleteId(null)} className="text-[#57534E] underline">
                      manter
                    </button>
                    <button
                      onClick={() =>
                        deleteLetter(userId, l.id)
                          .then(() => onToast('Cartinha apagada'))
                          .catch(() => onToast('Não foi possível apagar', 'error'))
                      }
                      className="text-[#991B1B] font-bold underline"
                    >
                      apagar
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(l.id)}
                    aria-label="Apagar cartinha"
                    className="p-1 -m-1 text-[#A8A29E] hover:text-[#991B1B]"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </LetterNote>
          ))}
        </div>
      )}

      <section className="bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Link2 size={15} strokeWidth={1.8} />
          <h2 className="font-mono text-xs font-bold uppercase tracking-wider">Link para receber cartinhas</h2>
        </div>
        <p className="text-xs text-[#78716C]">
          Quem tiver este link escreve sem precisar de conta. Guarde-o só com quem você quiser.
        </p>

        {link ? (
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.target.select()}
              className="flex-1 min-w-0 bg-[#FAF7F2] border border-[#E8DFD1] px-2 py-1.5 font-mono text-[11px] text-[#57534E]"
            />
            <button onClick={() => copy(link)} className="ledger-btn px-2.5 py-1.5 text-xs font-mono flex items-center gap-1">
              <Copy size={12} /> Copiar
            </button>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={link ? share : () => loadLink()}
            disabled={busy}
            className="ledger-btn-primary px-3 py-1.5 text-xs font-mono flex items-center gap-1.5 disabled:opacity-60"
          >
            <Link2 size={13} />
            {link ? 'Enviar link' : 'Mostrar link'}
          </button>
          {link &&
            (confirmRenew ? (
              <button
                onClick={() => loadLink(true)}
                disabled={busy}
                className="px-3 py-1.5 text-xs font-mono border border-[#991B1B] bg-[#991B1B] text-white flex items-center gap-1.5"
              >
                <RefreshCw size={13} /> Confirmar: o link atual para de funcionar
              </button>
            ) : (
              <button onClick={() => setConfirmRenew(true)} className="ledger-btn px-3 py-1.5 text-xs font-mono flex items-center gap-1.5">
                <RefreshCw size={13} /> Gerar link novo
              </button>
            ))}
        </div>
      </section>
    </div>
  );
};
