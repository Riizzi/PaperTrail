import React, { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Library } from 'lucide-react';
import type { ReferenceItem } from '../types';
import { parseReferences, dedupeKeys, exportToRIS } from '../services/bibio';
import { exportToBibTeX } from '../services/abnt';
import { saveUserItem } from '../services/firebase';

interface ImportExportCardProps {
  userId: string;
  items: ReferenceItem[];
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

function download(name: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Importar do Zotero/Mendeley/Google Acadêmico (BibTeX ou RIS) e exportar a biblioteca toda */
export const ImportExportCard: React.FC<ImportExportCardProps> = ({ userId, items, onToast }) => {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const parsed = parseReferences(await file.text());
      if (!parsed.length) throw new Error('Nenhuma referência encontrada. Use um arquivo .bib ou .ris.');

      const known = new Set(items.flatMap(dedupeKeys));
      const now = Date.now();
      const fresh: ReferenceItem[] = [];
      let duplicates = 0;
      for (const [i, ref] of parsed.entries()) {
        const keys = dedupeKeys(ref);
        if (keys.some((k) => known.has(k))) {
          duplicates++;
          continue;
        }
        keys.forEach((k) => known.add(k));
        const stamp = new Date(now + i).toISOString();
        fresh.push({
          status: 'to_read',
          isFavorite: false,
          collectionIds: [],
          notesList: [],
          ...ref,
          tags: ref.tags || [],
          id: `item_${now}_${i}_${Math.random().toString(36).slice(2, 6)}`,
          userId,
          createdAt: stamp,
          updatedAt: stamp,
        });
      }

      // Grava em lotes para não abrir centenas de escritas de uma vez
      for (let i = 0; i < fresh.length; i += 25) {
        await Promise.all(fresh.slice(i, i + 25).map((it) => saveUserItem(userId, it)));
      }

      const msg = `${fresh.length} ${fresh.length === 1 ? 'texto importado' : 'textos importados'}${
        duplicates ? ` · ${duplicates} já ${duplicates === 1 ? 'estava' : 'estavam'} na biblioteca` : ''
      }`;
      setResult(msg);
      onToast(msg);
    } catch (err: any) {
      onToast(err?.message || 'Erro ao importar', 'error');
    } finally {
      setBusy(false);
    }
  };

  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <div className="bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Library size={15} strokeWidth={1.8} className="text-[#292524]" />
        <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#292524]">
          Zotero, Mendeley e outros
        </h3>
      </div>
      <p className="text-xs font-sans text-[#78716C]">
        Importe referências em BibTeX (.bib) ou RIS (.ris). Textos que já estão na biblioteca (mesmo DOI ou mesmo título e
        ano) são pulados.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
        <label className={`ledger-btn-primary py-2 text-xs flex items-center justify-center gap-1.5 cursor-pointer ${busy ? 'opacity-60' : ''}`}>
          <ArrowDownToLine size={14} />
          <span>{busy ? 'Importando...' : 'Importar .bib / .ris'}</span>
          <input type="file" accept=".bib,.ris,.txt,.bibtex" onChange={handleImport} disabled={busy} className="hidden" />
        </label>
        <button
          onClick={() => download(`papertrail_${stamp}.bib`, exportToBibTeX(items), 'application/x-bibtex')}
          disabled={!items.length}
          className="ledger-btn py-2 text-xs flex items-center justify-center gap-1.5 bg-[#FAF7F2] disabled:opacity-50"
        >
          <ArrowUpFromLine size={14} />
          <span>Exportar BibTeX</span>
        </button>
        <button
          onClick={() => download(`papertrail_${stamp}.ris`, exportToRIS(items), 'application/x-research-info-systems')}
          disabled={!items.length}
          className="ledger-btn py-2 text-xs flex items-center justify-center gap-1.5 bg-[#FAF7F2] disabled:opacity-50"
        >
          <ArrowUpFromLine size={14} />
          <span>Exportar RIS</span>
        </button>
      </div>
      {result && <p className="text-[11px] font-mono text-[#57534E]">{result}</p>}
    </div>
  );
};
