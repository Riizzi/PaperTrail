import React, { useEffect, useState } from 'react';
import { X, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import { getAttachmentUrl } from '../services/attachments';

interface PdfReaderProps {
  storagePath: string;
  name: string;
  onClose: () => void;
}

/** Leitor do anexo dentro do app (usa o leitor de PDF do próprio navegador) */
export const PdfReader: React.FC<PdfReaderProps> = ({ storagePath, name, onClose }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getAttachmentUrl(storagePath)
      .then((u) => alive && setUrl(u))
      .catch((e) => alive && setError(e?.message || 'Não foi possível abrir o anexo.'));
    return () => {
      alive = false;
    };
  }, [storagePath]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#FAF7F2]" role="dialog" aria-label={`Leitura: ${name}`}>
      <div
        className="flex items-center gap-2 px-4 h-12 border-b border-[#E8DFD1] bg-[#FFFDF9] shrink-0"
        style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <span className="flex-1 truncate font-mono text-xs font-semibold text-[#292524]">{name}</span>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="ledger-btn px-2.5 py-1 text-xs font-mono flex items-center gap-1"
          >
            <ExternalLink size={12} />
            Nova aba
          </a>
        )}
        <button onClick={onClose} aria-label="Fechar leitura" className="p-1.5 text-[#78716C] hover:text-[#292524]">
          <X size={18} />
        </button>
      </div>
      <div className="flex-1 min-h-0">
        {error ? (
          <div className="h-full flex items-center justify-center gap-2 text-xs font-mono text-[#991B1B]">
            <AlertCircle size={14} />
            {error}
          </div>
        ) : url ? (
          <iframe src={url} title={name} className="w-full h-full border-0 bg-white" />
        ) : (
          <div className="h-full flex items-center justify-center gap-2 text-xs font-mono text-[#78716C]">
            <Loader2 size={14} className="animate-spin" />
            Abrindo anexo...
          </div>
        )}
      </div>
    </div>
  );
};
