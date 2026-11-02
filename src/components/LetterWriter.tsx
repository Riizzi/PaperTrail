import React, { useEffect, useState } from 'react';
import { Send, Loader2, Check, AlertCircle } from 'lucide-react';
import type { LetterColor } from '../types';
import { LETTER_COLORS, MAX_FROM_CHARS, MAX_LETTER_CHARS, parseLetterHash, sendLetter } from '../services/letters';
import { LetterNote } from './LetterNote';
import { LogoMark } from './Logo';

const FROM_KEY = 'pt_letter_from';
const COLOR_KEY = 'pt_letter_color';

/** Página /cartinha#uid.chave — escrever uma cartinha, sem login */
export const LetterWriter: React.FC = () => {
  const [target] = useState(() => parseLetterHash(window.location.hash));
  const [text, setText] = useState('');
  const [from, setFrom] = useState(() => localStorage.getItem(FROM_KEY) || '');
  const [color, setColor] = useState<LetterColor>(() => (localStorage.getItem(COLOR_KEY) as LetterColor) || 'amarelo');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Cartinha · PaperTrail';
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    if (!navigator.onLine) {
      setError('Sem internet agora. A cartinha não foi enviada.');
      return;
    }
    setStatus('sending');
    setError(null);
    try {
      await sendLetter(target, { text, from, color });
      localStorage.setItem(FROM_KEY, from.trim());
      localStorage.setItem(COLOR_KEY, color);
      setStatus('sent');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível enviar.');
      setStatus('idle');
    }
  };

  return (
    <div
      className="min-h-[100dvh] bg-[#FAF7F2] text-[#292524] font-sans flex flex-col items-center px-4"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)' }}
    >
      <div className="w-full max-w-md space-y-5">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-sm bg-[#D6CFC4] border border-[#292524] flex items-center justify-center ledger-shadow-sm">
            <LogoMark />
          </span>
          <div>
            <p className="font-mono font-bold text-sm leading-tight">Cartinha</p>
            <p className="font-mono text-[9px] uppercase tracking-widest text-[#78716C] leading-tight">PaperTrail</p>
          </div>
        </div>

        {!target ? (
          <div className="p-4 bg-[#FFF5F5] border border-[#FCA5A5] text-[#991B1B] text-sm flex gap-2">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <span>Link incompleto. Peça o link de cartinhas de novo para quem vai receber.</span>
          </div>
        ) : status === 'sent' ? (
          <div className="space-y-5 text-center pt-6">
            <LetterNote color={color} tilt={-1.5} className="mx-auto max-w-xs text-left">
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{text.trim()}</p>
              {from.trim() && <p className="mt-3 text-right font-mono text-xs text-[#57534E]">— {from.trim()}</p>}
            </LetterNote>
            <p className="font-mono text-sm font-bold flex items-center justify-center gap-1.5">
              <Check size={16} /> Cartinha entregue
            </p>
            <button
              onClick={() => {
                setText('');
                setStatus('idle');
              }}
              className="ledger-btn px-4 py-2 text-xs font-mono"
            >
              Escrever outra
            </button>
          </div>
        ) : (
          <form onSubmit={handleSend} className="space-y-4">
            <LetterNote color={color} tilt={-0.6}>
              <label htmlFor="letter-text" className="sr-only">Mensagem</label>
              <textarea
                id="letter-text"
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, MAX_LETTER_CHARS))}
                rows={7}
                placeholder="Escreva sua mensagem..."
                className="w-full bg-transparent resize-none text-[16px] leading-relaxed placeholder:text-[#A8A29E] focus:outline-none"
                autoFocus
              />
              <div className="flex items-center gap-2 mt-1">
                <label htmlFor="letter-from" className="font-mono text-xs text-[#57534E]">—</label>
                <input
                  id="letter-from"
                  value={from}
                  onChange={(e) => setFrom(e.target.value.slice(0, MAX_FROM_CHARS))}
                  placeholder="assinatura (opcional)"
                  className="flex-1 bg-transparent font-mono text-[16px] sm:text-xs text-[#57534E] placeholder:text-[#A8A29E] focus:outline-none border-b border-dashed border-black/15"
                />
              </div>
              <p className="text-right font-mono text-[10px] text-[#A8A29E] mt-2">
                {text.length}/{MAX_LETTER_CHARS}
              </p>
            </LetterNote>

            <fieldset className="flex items-center gap-2">
              <legend className="sr-only">Cor do papel</legend>
              {(Object.keys(LETTER_COLORS) as LetterColor[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={LETTER_COLORS[c].label}
                  aria-pressed={color === c}
                  className={`w-9 h-9 border ${color === c ? 'border-[#292524] shadow-[2px_2px_0_#292524]' : 'border-[#E8DFD1]'}`}
                  style={{ backgroundColor: LETTER_COLORS[c].bg }}
                />
              ))}
              <button
                type="submit"
                disabled={!text.trim() || status === 'sending'}
                className="ml-auto ledger-btn-primary px-4 py-2.5 text-sm font-mono flex items-center gap-2 disabled:opacity-50"
              >
                {status === 'sending' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                Enviar
              </button>
            </fieldset>

            {error && (
              <div role="alert" className="p-3 bg-[#FFF5F5] border border-[#FCA5A5] text-[#991B1B] text-xs font-mono">
                {error}
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
};
