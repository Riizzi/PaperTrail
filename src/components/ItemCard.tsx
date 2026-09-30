import React from 'react';
import type { ReferenceItem } from '../types';
import {
  FileText,
  Book,
  BookOpen,
  GraduationCap,
  Globe,
  Users,
  Star,
  Copy,
  Paperclip,
  StickyNote,
} from 'lucide-react';
import { formatReferenceABNT, copyABNTToClipboard } from '../services/abnt';

interface ItemCardProps {
  item: ReferenceItem;
  onClick: () => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
  onCopyABNT: (text: string) => void;
}

export const ItemCard: React.FC<ItemCardProps> = ({
  item,
  onClick,
  onToggleFavorite,
  onCopyABNT,
}) => {
  const getTypeLabel = (type: ReferenceItem['type']) => {
    switch (type) {
      case 'article': return 'Artigo';
      case 'book': return 'Livro';
      case 'chapter': return 'Capítulo';
      case 'thesis': return 'Tese/TCC';
      case 'conference': return 'Evento';
      case 'webpage': return 'Web';
      default: return 'Doc';
    }
  };

  const getTypeIcon = (type: ReferenceItem['type']) => {
    switch (type) {
      case 'article': return <FileText size={13} strokeWidth={1.8} />;
      case 'book': return <Book size={13} strokeWidth={1.8} />;
      case 'chapter': return <BookOpen size={13} strokeWidth={1.8} />;
      case 'thesis': return <GraduationCap size={13} strokeWidth={1.8} />;
      case 'conference': return <Users size={13} strokeWidth={1.8} />;
      case 'webpage': return <Globe size={13} strokeWidth={1.8} />;
      default: return <FileText size={13} strokeWidth={1.8} />;
    }
  };

  const getStatusBadge = (status: ReferenceItem['status']) => {
    switch (status) {
      case 'to_read':
        return <span className="font-mono text-[10px] text-[#78716C] uppercase tracking-wider">Para ler</span>;
      case 'reading':
        return <span className="font-mono text-[10px] text-[#292524] font-bold uppercase tracking-wider">Lendo</span>;
      case 'read':
        return <span className="font-mono text-[10px] text-[#57534E] uppercase tracking-wider">✓ Lido</span>;
    }
  };

  const handleQuickCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const abnt = formatReferenceABNT(item);
    await copyABNTToClipboard(abnt.html, abnt.plain);
    onCopyABNT('Referência ABNT copiada');
  };

  // Notes count (notesList or legacy notes)
  const notesCount = item.notesList?.length || (item.notes ? 1 : 0);

  return (
    <article
      onClick={onClick}
      className="group relative bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow p-3.5 pt-3 transition-transform hover:-translate-y-0.5 cursor-pointer"
    >
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2 border-b border-[#F0E9DF] pb-2 mb-2 text-xs">
        <div className="flex items-center gap-1.5 font-mono text-[11px] text-[#57534E]">
          {getTypeIcon(item.type)}
          <span className="font-semibold uppercase tracking-wider">{getTypeLabel(item.type)}</span>
          {item.year && (
            <>
              <span className="text-[#A8A29E]">•</span>
              <span className="font-mono font-bold text-[#292524]">{item.year}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {getStatusBadge(item.status)}

          {/* Paperclip icon if item has attachment */}
          {item.attachment && (
            <span title={`Anexo: ${item.attachment.name}`} className="text-[#57534E] flex items-center">
              <Paperclip size={13} strokeWidth={2} />
            </span>
          )}

          {/* Post-it count icon if item has notes */}
          {notesCount > 0 && (
            <span title={`${notesCount} apontamento(s)`} className="flex items-center gap-0.5 font-mono text-[10px] text-[#78716C] bg-[#FBF1C7] border border-[#E8D9A0] px-1 py-0.2 rounded-xs">
              <StickyNote size={11} className="text-[#B58900]" />
              <span>{notesCount}</span>
            </span>
          )}

          <button
            onClick={onToggleFavorite}
            aria-label={item.isFavorite ? 'Remover dos favoritos' : 'Favoritar'}
            className="p-1 text-[#78716C] hover:text-[#292524]"
          >
            <Star
              size={15}
              strokeWidth={1.8}
              fill={item.isFavorite ? '#292524' : 'none'}
              className={item.isFavorite ? 'text-[#292524]' : 'text-[#A8A29E]'}
            />
          </button>
        </div>
      </div>

      {/* Title */}
      <h3 className="font-sans font-semibold text-sm leading-snug text-[#292524] mb-1">
        {item.title}
        {item.subtitle && <span className="font-normal text-[#57534E]">: {item.subtitle}</span>}
      </h3>

      {/* Authors */}
      {item.authors && (
        <p className="text-xs text-[#57534E] line-clamp-1 mb-1 font-sans">
          {item.authors}
        </p>
      )}

      {/* Publication / Journal / Publisher */}
      {(item.publication || item.publisher) && (
        <p className="font-mono text-[11px] text-[#78716C] italic line-clamp-1 mb-2">
          {item.publication || item.publisher}
        </p>
      )}

      {/* Tags */}
      {item.tags && item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2.5">
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="folder-chip"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer bar */}
      <div className="flex items-center justify-between pt-2 border-t border-[#F0E9DF] text-[11px] font-mono text-[#78716C]">
        <span className="truncate max-w-[190px]">
          {item.doi ? `DOI: ${item.doi.replace(/^https?:\/\/doi\.org\//, '')}` : (item.institution || item.place || 'ABNT NBR 6023')}
        </span>

        <button
          onClick={handleQuickCopy}
          title="Copiar ABNT"
          className="ledger-btn px-2 py-1 text-[11px] font-mono flex items-center gap-1 bg-[#FAF7F2] text-[#292524] hover:bg-[#F2ECE1]"
        >
          <Copy size={11} strokeWidth={1.8} />
          <span>ABNT</span>
        </button>
      </div>
    </article>
  );
};
