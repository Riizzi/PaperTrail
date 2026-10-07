import React, { useState, useEffect, useRef } from 'react';
import type { ReferenceItem, Collection, OpenAlexWork, NoteEntry } from '../types';
import {
  X,
  Copy,
  Sparkles,
  ExternalLink,
  BookOpen,
  Trash2,
  ChevronDown,
  Loader2,
  Plus,
  Check,
  Star,
  Paperclip,
  StickyNote,
  AlertCircle,
  FileText,
  Upload,
} from 'lucide-react';
import {
  formatReferenceABNT,
  formatCitationABNT,
  copyABNTToClipboard,
  getMissingABNTFields,
} from '../services/abnt';
import { requestSummary, requestSearchTerms, requestExtractText } from '../services/api';
import { searchOpenAlexWorks } from '../services/openalex';
import { saveItemFulltext, deleteItemFulltext } from '../services/firebase';
import { uploadItemAttachment, deleteItemAttachment, openAttachment, MAX_ATTACHMENT_SIZE } from '../services/attachments';

const TYPE_LABELS: Record<string, string> = {
  article: 'Artigo',
  book: 'Livro',
  chapter: 'Capítulo',
  thesis: 'Tese/TCC',
  conference: 'Evento',
  webpage: 'Página web',
};

interface ItemDetailModalProps {
  item: ReferenceItem;
  collections: Collection[];
  onClose: () => void;
  onUpdateItem: (updated: ReferenceItem) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onToast: (msg: string) => void;
  onImportDoi: (doi: string) => void;
}

export const ItemDetailModal: React.FC<ItemDetailModalProps> = ({
  item,
  collections,
  onClose,
  onUpdateItem,
  onDeleteItem,
  onToast,
  onImportDoi,
}) => {
  const [activeTab, setActiveTab] = useState<'content' | 'edit'>('content');
  const [showCopyMenu, setShowCopyMenu] = useState(false);

  // Attachment & upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isExtracting, setIsExtracting] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI Summary State
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Related Works State
  const [relatedWorks, setRelatedWorks] = useState<OpenAlexWork[]>([]);
  const [isLoadingRelated, setIsLoadingRelated] = useState(false);
  const [relatedError, setRelatedError] = useState<string | null>(null);
  const [addedDois, setAddedDois] = useState<Set<string>>(new Set());

  // Apontamentos (Post-its) state
  const [notesList, setNotesList] = useState<NoteEntry[]>(() => {
    if (item.notesList && item.notesList.length > 0) {
      return item.notesList;
    }
    // Migrate legacy notes
    if (item.notes && item.notes.trim()) {
      return [
        {
          id: `note_${Date.now()}`,
          text: item.notes.trim(),
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        },
      ];
    }
    return [];
  });

  const [activeEditingNoteId, setActiveEditingNoteId] = useState<string | null>(null);

  // Edit form state
  const [editForm, setEditForm] = useState<ReferenceItem>({ ...item });
  const [tagInput, setTagInput] = useState('');

  // Missing ABNT fields
  const missingABNTFields = getMissingABNTFields(item);

  // Load related works
  useEffect(() => {
    loadRelatedWorks();
  }, [item.id]);

  const loadRelatedWorks = async () => {
    setIsLoadingRelated(true);
    setRelatedError(null);
    try {
      const terms = await requestSearchTerms(item);
      const searchTerms = terms && terms.length > 0 ? terms : [item.title];
      const works = await searchOpenAlexWorks(searchTerms, item.title);
      setRelatedWorks(works);
    } catch {
      try {
        const fallbackWords = item.title.split(/\s+/).slice(0, 4).join(' ');
        const fallbackWorks = await searchOpenAlexWorks([fallbackWords], item.title);
        setRelatedWorks(fallbackWorks);
      } catch {
        setRelatedError('Não foi possível carregar textos relacionados.');
      }
    } finally {
      setIsLoadingRelated(false);
    }
  };

  // Upload attachment and extract text + auto-generate summary
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit: 20 MB
    if (file.size > MAX_ATTACHMENT_SIZE) {
      setAttachmentError('Arquivo excede o limite máximo de 20 MB.');
      onToast('Arquivo excede o limite de 20 MB.');
      return;
    }

    setAttachmentError(null);
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const previousPath = item.attachment?.storagePath;
      const { storagePath } = await uploadItemAttachment(
        item.id,
        file,
        (progress) => setUploadProgress(progress)
      );
      // Substituição: apaga o arquivo antigo
      if (previousPath && previousPath !== storagePath) {
        deleteItemAttachment(previousPath);
      }

      const newAttachment = {
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        storagePath,
        uploadedAt: new Date().toISOString(),
      };

      setIsUploading(false);
      setIsExtracting(true);
      onToast('Arquivo enviado. Extraindo texto...');

      // Extract text via server
      let extractedResult = { pageCount: 1, wordCount: 0, text: '' };
      try {
        extractedResult = await requestExtractText(storagePath);
        await saveItemFulltext(item.userId, item.id, extractedResult.text, {
          pageCount: extractedResult.pageCount,
          wordCount: extractedResult.wordCount,
        });
      } catch (extractErr) {
        console.warn('Extraction notice:', extractErr);
      }

      setIsExtracting(false);

      // Auto-generate summary based on newly extracted full text
      setIsGeneratingSummary(true);
      let summaryData: any = null;
      try {
        summaryData = await requestSummary(
          { ...item, id: item.id },
          extractedResult.text
        );
      } catch (sumErr) {
        console.warn('Summary auto-generation notice:', sumErr);
      } finally {
        setIsGeneratingSummary(false);
      }

      const updated: ReferenceItem = {
        ...item,
        attachment: newAttachment,
        pageCount: extractedResult.pageCount || item.pageCount,
        wordCount: extractedResult.wordCount || item.wordCount,
        summary: summaryData?.summary || item.summary,
        summarySource: summaryData?.summarySource || item.summarySource,
        keyPoints: summaryData?.keyPoints || item.keyPoints,
        keywords: summaryData?.keywords || item.keywords,
        updatedAt: new Date().toISOString(),
      };

      await onUpdateItem(updated);
      onToast('Texto anexado e resumo gerado');
    } catch (err: any) {
      console.error(err);
      setAttachmentError(err.message || 'Erro ao anexar arquivo.');
      onToast('Erro no envio do anexo.');
    } finally {
      setIsUploading(false);
      setIsExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = async () => {
    if (!item.attachment) return;
    if (!confirm(`Remover anexo "${item.attachment.name}"?`)) return;

    try {
      await deleteItemAttachment(item.attachment.storagePath);
      await deleteItemFulltext(item.userId, item.id);
      const updated: ReferenceItem = {
        ...item,
        attachment: undefined,
        updatedAt: new Date().toISOString(),
      };
      await onUpdateItem(updated);
      onToast('Anexo removido');
    } catch {
      onToast('Erro ao remover anexo');
    }
  };

  const handleGenerateSummary = async () => {
    setIsGeneratingSummary(true);
    setSummaryError(null);
    try {
      const res = await requestSummary(item);
      const updated: ReferenceItem = {
        ...item,
        summary: res.summary,
        summarySource: res.summarySource,
        keyPoints: res.keyPoints,
        keywords: res.keywords,
        updatedAt: new Date().toISOString(),
      };
      await onUpdateItem(updated);
      onToast('Resumo gerado com sucesso');
    } catch (err: any) {
      console.error(err);
      setSummaryError(err.message || 'Erro ao gerar resumo');
      onToast(err.message || 'Erro ao gerar resumo');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  // Apontamentos logic
  const handleAddNote = () => {
    const newNote: NoteEntry = {
      id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      text: '',
      page: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updatedList = [newNote, ...notesList];
    setNotesList(updatedList);
    setActiveEditingNoteId(newNote.id);
  };

  const handleUpdateNote = async (noteId: string, text: string, page?: string) => {
    const updatedList = notesList.map((n) =>
      n.id === noteId ? { ...n, text, page: page || '', updatedAt: new Date().toISOString() } : n
    );
    setNotesList(updatedList);

    const updated: ReferenceItem = {
      ...item,
      notesList: updatedList,
      notes: undefined, // Cleared after migration
      updatedAt: new Date().toISOString(),
    };
    await onUpdateItem(updated);
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Excluir este apontamento?')) return;
    const updatedList = notesList.filter((n) => n.id !== noteId);
    setNotesList(updatedList);

    const updated: ReferenceItem = {
      ...item,
      notesList: updatedList,
      notes: undefined,
      updatedAt: new Date().toISOString(),
    };
    await onUpdateItem(updated);
    onToast('Apontamento excluído');
  };

  const handleCopyCitationWithPage = async (page?: string) => {
    const cit = formatCitationABNT(item, page);
    await copyABNTToClipboard(cit.direct, cit.direct);
    onToast(`Citação direta copiada (${page ? `p. ${page}` : ''})`);
  };

  const handleStatusChange = async (newStatus: ReferenceItem['status']) => {
    const updated: ReferenceItem = {
      ...item,
      status: newStatus,
      updatedAt: new Date().toISOString(),
    };
    await onUpdateItem(updated);
    onToast(`Status: ${newStatus === 'to_read' ? 'Para ler' : newStatus === 'reading' ? 'Lendo' : 'Lido'}`);
  };

  const handleToggleFavorite = async () => {
    const updated: ReferenceItem = {
      ...item,
      isFavorite: !item.isFavorite,
      updatedAt: new Date().toISOString(),
    };
    await onUpdateItem(updated);
  };

  const handleCopyOption = async (option: 'full' | 'indirect' | 'direct' | 'inText') => {
    setShowCopyMenu(false);
    const ref = formatReferenceABNT(item);
    const cit = formatCitationABNT(item);

    let html = '';
    let plain = '';

    switch (option) {
      case 'full':
        html = ref.html;
        plain = ref.plain;
        break;
      case 'indirect':
        html = cit.indirect;
        plain = cit.indirect;
        break;
      case 'direct':
        html = cit.direct;
        plain = cit.direct;
        break;
      case 'inText':
        html = cit.inText;
        plain = cit.inText;
        break;
    }

    await copyABNTToClipboard(html, plain);
    onToast('Copiado');
  };

  const handleImportRelated = async (work: OpenAlexWork) => {
    const rawDoi = work.doi?.replace(/^https?:\/\/doi\.org\//, '') || '';
    if (rawDoi) {
      setAddedDois(prev => new Set(prev).add(rawDoi));
      onImportDoi(rawDoi);
      onToast('Texto importado via DOI');
    } else {
      onToast('DOI não disponível para este item.');
    }
  };

  const handleSaveEditForm = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateItem({
      ...editForm,
      updatedAt: new Date().toISOString(),
    });
    setActiveTab('content');
    onToast('Metadados atualizados');
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const fullABNT = formatReferenceABNT(item);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[1px] p-0 sm:p-4">
      <div 
        className="w-full sm:max-w-2xl bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow-md max-h-[92vh] flex flex-col overflow-hidden rounded-t-lg sm:rounded-none"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8DFD1] bg-[#FAF7F2]">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#57534E]">
              {TYPE_LABELS[item.type] || 'Documento'} • {item.year || 'sem ano'}
            </span>
            <button
              onClick={handleToggleFavorite}
              aria-label={item.isFavorite ? 'Remover dos favoritos' : 'Favoritar'}
              className="p-2 -m-1 text-[#78716C] hover:text-[#292524]"
            >
              <Star
                size={16}
                fill={item.isFavorite ? '#292524' : 'none'}
                className={item.isFavorite ? 'text-[#292524]' : 'text-[#A8A29E]'}
              />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab(activeTab === 'content' ? 'edit' : 'content')}
              className="ledger-btn px-2.5 py-1 text-xs font-mono"
            >
              {activeTab === 'content' ? 'Editar' : 'Visualizar'}
            </button>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="p-1 text-[#78716C] hover:text-[#292524]"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="overflow-y-auto flex-1 p-4 space-y-5">
          {activeTab === 'edit' ? (
            <form onSubmit={handleSaveEditForm} className="space-y-4 text-xs font-mono">
              <div>
                <label className="block text-[#78716C] mb-1 font-sans">Tipo de documento</label>
                <select
                  value={editForm.type}
                  onChange={(e) => setEditForm({ ...editForm, type: e.target.value as any })}
                  className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-mono text-xs"
                >
                  <option value="article">Artigo de periódico</option>
                  <option value="book">Livro</option>
                  <option value="chapter">Capítulo de livro</option>
                  <option value="thesis">Tese / Dissertação / TCC</option>
                  <option value="conference">Trabalho em evento</option>
                  <option value="webpage">Site / Página Web</option>
                </select>
              </div>

              <div>
                <label className="block text-[#78716C] mb-1 font-sans">Título *</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-sans text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-[#78716C] mb-1 font-sans">Subtítulo</label>
                <input
                  type="text"
                  value={editForm.subtitle || ''}
                  onChange={(e) => setEditForm({ ...editForm, subtitle: e.target.value })}
                  className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-sans text-xs"
                />
              </div>

              <div>
                <label className="block text-[#78716C] mb-1 font-sans">Autores (separados por ponto e vírgula)</label>
                <input
                  type="text"
                  value={editForm.authors || ''}
                  onChange={(e) => setEditForm({ ...editForm, authors: e.target.value })}
                  className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-sans text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#78716C] mb-1 font-sans">Ano</label>
                  <input
                    type="text"
                    value={editForm.year || ''}
                    onChange={(e) => setEditForm({ ...editForm, year: e.target.value })}
                    className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[#78716C] mb-1 font-sans">Local</label>
                  <input
                    type="text"
                    value={editForm.place || ''}
                    onChange={(e) => setEditForm({ ...editForm, place: e.target.value })}
                    className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-sans text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#78716C] mb-1 font-sans">Periódico / Veículo / Evento</label>
                  <input
                    type="text"
                    value={editForm.publication || ''}
                    onChange={(e) => setEditForm({ ...editForm, publication: e.target.value })}
                    className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-sans text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[#78716C] mb-1 font-sans">Editora</label>
                  <input
                    type="text"
                    value={editForm.publisher || ''}
                    onChange={(e) => setEditForm({ ...editForm, publisher: e.target.value })}
                    className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-sans text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[#78716C] mb-1 font-sans">Volume</label>
                  <input
                    type="text"
                    value={editForm.volume || ''}
                    onChange={(e) => setEditForm({ ...editForm, volume: e.target.value })}
                    className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[#78716C] mb-1 font-sans">Número</label>
                  <input
                    type="text"
                    value={editForm.number || ''}
                    onChange={(e) => setEditForm({ ...editForm, number: e.target.value })}
                    className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[#78716C] mb-1 font-sans">Páginas</label>
                  <input
                    type="text"
                    value={editForm.pages || ''}
                    onChange={(e) => setEditForm({ ...editForm, pages: e.target.value })}
                    className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#78716C] mb-1 font-sans">DOI</label>
                  <input
                    type="text"
                    value={editForm.doi || ''}
                    onChange={(e) => setEditForm({ ...editForm, doi: e.target.value })}
                    className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[#78716C] mb-1 font-sans">ISBN</label>
                  <input
                    type="text"
                    value={editForm.isbn || ''}
                    onChange={(e) => setEditForm({ ...editForm, isbn: e.target.value })}
                    className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#78716C] mb-1 font-sans">URL</label>
                <input
                  type="url"
                  value={editForm.url || ''}
                  onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                  className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[#78716C] mb-1 font-sans">Data de acesso</label>
                <input
                  type="text"
                  value={editForm.accessDate || ''}
                  onChange={(e) => setEditForm({ ...editForm, accessDate: e.target.value })}
                  className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-mono text-xs"
                  placeholder="ex: 30 set. 2026"
                />
              </div>

              <div>
                <label className="block text-[#78716C] mb-1 font-sans">Resumo original (Abstract)</label>
                <textarea
                  value={editForm.abstract || ''}
                  onChange={(e) => setEditForm({ ...editForm, abstract: e.target.value })}
                  rows={3}
                  className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-sans text-xs"
                />
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-[#E8DFD1]">
                <button
                  type="button"
                  onClick={() => onDeleteItem(item.id)}
                  className="px-3 py-1.5 text-xs text-[#991B1B] hover:bg-[#FEE2E2] border border-[#FCA5A5] flex items-center gap-1 font-mono"
                >
                  <Trash2 size={13} />
                  Excluir texto
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('content')}
                    className="ledger-btn px-3 py-1.5 text-xs font-mono"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="ledger-btn-primary px-4 py-1.5 text-xs font-mono"
                  >
                    Salvar alterações
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <>
              {/* 1. Metadados */}
              <section className="space-y-2">
                <h1 className="font-sans font-bold text-lg text-[#292524] leading-snug">
                  {item.title}
                  {item.subtitle && <span className="font-normal text-[#57534E]">: {item.subtitle}</span>}
                </h1>

                {item.authors && (
                  <p className="font-sans text-sm text-[#44403C] font-medium">
                    {item.authors}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs font-mono text-[#78716C]">
                  {item.publication && (
                    <span className="italic text-[#292524]">{item.publication}</span>
                  )}
                  {item.publisher && (
                    <span>Editora: {item.publisher}</span>
                  )}
                  {item.year && <span>{item.year}</span>}
                  {item.volume && <span>v. {item.volume}</span>}
                  {item.number && <span>n. {item.number}</span>}
                  {item.pages && <span>p. {item.pages}</span>}
                  {item.pageCount && <span>{item.pageCount} págs.</span>}
                </div>

                {item.doi && (
                  <div className="pt-1">
                    <a
                      href={item.doi.startsWith('http') ? item.doi : `https://doi.org/${item.doi}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-mono text-[#292524] hover:underline"
                    >
                      <span>DOI: {item.doi.replace(/^https?:\/\/doi\.org\//, '')}</span>
                      <ExternalLink size={12} strokeWidth={1.75} />
                    </a>
                  </div>
                )}

                {item.url && !item.doi && (
                  <div className="pt-1">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-mono text-[#292524] hover:underline truncate max-w-full"
                    >
                      <span className="truncate">{item.url}</span>
                      <ExternalLink size={12} strokeWidth={1.75} />
                    </a>
                  </div>
                )}

                {/* Status Switcher & Tags */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#F0E9DF]">
                  <div className="flex items-center gap-1">
                    {(['to_read', 'reading', 'read'] as const).map((st) => (
                      <button
                        key={st}
                        onClick={() => handleStatusChange(st)}
                        className={`px-2 py-0.5 text-[11px] font-mono border ${
                          item.status === st
                            ? 'bg-[#292524] text-[#FAF7F2] border-[#292524] font-bold'
                            : 'bg-[#FAF7F2] text-[#78716C] border-[#E8DFD1]'
                        }`}
                      >
                        {st === 'to_read' ? 'Para ler' : st === 'reading' ? 'Lendo' : 'Lido'}
                      </button>
                    ))}
                  </div>

                  {item.tags && item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.tags.map((t) => (
                        <span key={t} className="folder-chip">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {/* SEÇÃO: ANEXO DO TEXTO */}
              <section className="p-3.5 bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow space-y-2.5">
                <div className="flex items-center justify-between border-b border-[#F0E9DF] pb-2">
                  <div className="flex items-center gap-1.5">
                    <Paperclip size={15} strokeWidth={1.8} className="text-[#292524]" />
                    <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[#292524]">
                      Anexo do texto
                    </h2>
                  </div>
                  {item.attachment && (
                    <span className="font-mono text-[11px] text-[#78716C]">
                      {formatFileSize(item.attachment.size)}
                    </span>
                  )}
                </div>

                {attachmentError && (
                  <p className="text-xs text-[#991B1B] font-mono">{attachmentError}</p>
                )}

                {isUploading ? (
                  <div className="space-y-1.5 py-2 font-mono text-xs text-[#57534E]">
                    <div className="flex justify-between text-[11px]">
                      <span>Enviando arquivo...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full h-2 bg-[#E8DFD1] overflow-hidden">
                      <div
                        className="h-full bg-[#292524] transition-all duration-150"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                ) : isExtracting ? (
                  <div className="flex items-center gap-2 py-2 font-mono text-xs text-[#57534E]">
                    <Loader2 size={14} className="animate-spin text-[#292524]" />
                    <span>Extraindo texto e transcrevendo conteúdo...</span>
                  </div>
                ) : item.attachment ? (
                  <div className="p-2.5 bg-[#FAF7F2] border border-[#E8DFD1] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
                    <div className="flex items-center gap-2 truncate">
                      <FileText size={16} strokeWidth={1.8} className="shrink-0 text-[#292524]" />
                      <span className="truncate font-semibold text-[#292524]">
                        {item.attachment.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const path = item.attachment?.storagePath;
                          if (!path) return;
                          openAttachment(path).catch(() => onToast('Não foi possível abrir o anexo'));
                        }}
                        className="ledger-btn px-2.5 py-1 text-xs font-mono bg-[#FFFDF9]"
                      >
                        Abrir
                      </button>
                      <label className="ledger-btn px-2.5 py-1 text-xs font-mono bg-[#FFFDF9] cursor-pointer">
                        <span>Substituir</span>
                        <input
                          type="file"
                          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                      <button
                        onClick={handleRemoveAttachment}
                        className="p-1 text-[#991B1B] hover:bg-[#FEE2E2]"
                        title="Remover anexo"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-[#FAF7F2] border border-dashed border-[#C5BBAA] flex items-center justify-between gap-2">
                    <span className="font-sans text-xs text-[#78716C]">
                      Nenhum arquivo anexado (PDF, DOCX ou TXT até 20 MB).
                    </span>
                    <label className="ledger-btn-primary px-3 py-1.5 text-xs font-mono flex items-center gap-1.5 cursor-pointer shrink-0">
                      <Upload size={13} />
                      <span>Anexar arquivo</span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}
              </section>

              {/* 2. Botão "Copiar ABNT" em destaque com aviso de dados faltantes */}
              <section className="relative">
                {missingABNTFields.length > 0 && (
                  <div className="mb-2 p-2 bg-[#FFF8E7] border border-[#F0D597] text-[11px] font-sans text-[#7A5B00] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <AlertCircle size={14} className="shrink-0 text-[#B58900]" />
                      <span>Faltam dados para a ABNT: <strong>{missingABNTFields.join(', ')}</strong></span>
                    </div>
                    <button
                      onClick={() => setActiveTab('edit')}
                      className="underline font-semibold font-mono text-[10px] hover:text-[#292524] shrink-0"
                    >
                      Completar
                    </button>
                  </div>
                )}

                <div className="p-3 bg-[#FAF7F2] border border-[#E8DFD1] ledger-shadow">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-mono font-bold text-[#57534E] uppercase tracking-wider">
                      Referência ABNT NBR 6023:2018
                    </span>
                    <div className="relative">
                      <button
                        onClick={() => setShowCopyMenu(!showCopyMenu)}
                        className="ledger-btn-primary px-3 py-2 text-xs font-mono flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <Copy size={13} strokeWidth={2} />
                        <span>Copiar ABNT</span>
                        <ChevronDown size={13} />
                      </button>

                      {showCopyMenu && (
                        <div className="absolute right-0 top-full mt-1 w-56 bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow z-20 text-xs font-mono py-1">
                          <button
                            onClick={() => handleCopyOption('full')}
                            className="w-full text-left px-3 py-1.5 hover:bg-[#FAF7F2] flex items-center justify-between"
                          >
                            <span>Referência completa</span>
                            <span className="text-[10px] text-[#78716C]">Word/Docs</span>
                          </button>
                          <button
                            onClick={() => handleCopyOption('indirect')}
                            className="w-full text-left px-3 py-1.5 hover:bg-[#FAF7F2]"
                          >
                            <span>Citação indireta</span>
                          </button>
                          <button
                            onClick={() => handleCopyOption('direct')}
                            className="w-full text-left px-3 py-1.5 hover:bg-[#FAF7F2]"
                          >
                            <span>Citação direta</span>
                          </button>
                          <button
                            onClick={() => handleCopyOption('inText')}
                            className="w-full text-left px-3 py-1.5 hover:bg-[#FAF7F2]"
                          >
                            <span>Autor no texto</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    className="font-mono text-xs text-[#292524] leading-relaxed bg-[#FFFDF9] p-2.5 border border-[#E8DFD1] select-all"
                    dangerouslySetInnerHTML={{ __html: fullABNT.html }}
                  />
                </div>
              </section>

              {/* 3. Seção "Resumo": baseado em texto integral ou abstract */}
              <section className="p-3.5 bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow space-y-3">
                <div className="flex items-center justify-between border-b border-[#F0E9DF] pb-2">
                  <div className="flex items-center gap-1.5">
                    <Sparkles size={15} strokeWidth={1.8} className="text-[#292524]" />
                    <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[#292524]">
                      Resumo da obra
                    </h2>
                  </div>

                  {(item.attachment || item.abstract) && (
                    <button
                      onClick={handleGenerateSummary}
                      disabled={isGeneratingSummary}
                      className="ledger-btn px-2.5 py-1 text-xs font-mono flex items-center gap-1 bg-[#FAF7F2]"
                    >
                      {isGeneratingSummary ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          <span>Gerando...</span>
                        </>
                      ) : (
                        <span>{item.summary ? 'Gerar novamente' : 'Gerar resumo'}</span>
                      )}
                    </button>
                  )}
                </div>

                {summaryError && (
                  <p className="text-xs text-[#991B1B] font-mono">{summaryError}</p>
                )}

                {item.summary ? (
                  <div className="space-y-3 text-xs leading-relaxed font-sans text-[#292524]">
                    {item.summarySource === 'abstract' && (
                      <div className="p-2 bg-[#FBF1C7] border border-[#E8D9A0] font-mono text-[11px] text-[#57534E]">
                        Baseado no resumo original — anexe o texto para um resumo completo
                      </div>
                    )}

                    <p className="whitespace-pre-line text-[#292524]">{item.summary}</p>

                    {item.keyPoints && item.keyPoints.length > 0 && (
                      <div className="pt-2 border-t border-[#F0E9DF]">
                        <span className="font-mono font-bold text-[11px] text-[#57534E] uppercase tracking-wider block mb-1">
                          Pontos-chave:
                        </span>
                        <ul className="list-disc pl-4 space-y-1 text-[#44403C]">
                          {item.keyPoints.map((point, idx) => (
                            <li key={idx}>{point}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {item.keywords && item.keywords.length > 0 && (
                      <div className="pt-2 border-t border-[#F0E9DF] flex flex-wrap items-center gap-1.5">
                        <span className="font-mono font-bold text-[11px] text-[#57534E] uppercase tracking-wider">
                          Palavras-chave:
                        </span>
                        {item.keywords.map((kw, idx) => (
                          <span key={idx} className="font-mono text-[11px] bg-[#FAF7F2] border border-[#E8DFD1] px-1.5 py-0.5 text-[#57534E]">
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Metadata footer about source */}
                    <div className="pt-2 border-t border-[#F0E9DF] font-mono text-[11px] text-[#78716C]">
                      {item.summarySource === 'fulltext'
                        ? `Baseado no texto anexado · ${item.pageCount ? `${item.pageCount} págs.` : `${item.wordCount || ''} palavras`}`
                        : 'Baseado no abstract original'}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 text-center bg-[#FAF7F2] border border-[#E8DFD1] space-y-2">
                    <p className="text-xs font-sans text-[#78716C]">
                      Anexe o texto para gerar o resumo completo.
                    </p>
                    <label className="ledger-btn px-3 py-1.5 text-xs font-mono inline-flex items-center gap-1.5 bg-[#FFFDF9] cursor-pointer">
                      <Paperclip size={13} />
                      <span>Anexar arquivo agora</span>
                      <input
                        type="file"
                        accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}
              </section>

              {/* 4. Seção "Textos relacionados" (OpenAlex real works) */}
              <section className="p-3.5 bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow space-y-3">
                <div className="flex items-center justify-between border-b border-[#F0E9DF] pb-2">
                  <div className="flex items-center gap-1.5">
                    <BookOpen size={15} strokeWidth={1.8} className="text-[#292524]" />
                    <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[#292524]">
                      Textos relacionados
                    </h2>
                  </div>
                  <button
                    onClick={loadRelatedWorks}
                    disabled={isLoadingRelated}
                    className="text-xs font-mono text-[#78716C] hover:text-[#292524] px-2 py-1 -mr-2 shrink-0"
                  >
                    {isLoadingRelated ? 'Buscando...' : 'Atualizar'}
                  </button>
                </div>

                {isLoadingRelated ? (
                  <div className="flex items-center justify-center py-6 gap-2 text-xs font-mono text-[#78716C]">
                    <Loader2 size={16} className="animate-spin text-[#292524]" />
                    <span>Localizando artigos correlatos no OpenAlex...</span>
                  </div>
                ) : relatedError ? (
                  <p className="text-xs text-[#78716C] font-mono">{relatedError}</p>
                ) : relatedWorks.length === 0 ? (
                  <p className="text-xs text-[#78716C] italic font-sans">
                    Nenhum artigo correlato encontrado.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {relatedWorks.map((work) => {
                      const cleanDoi = work.doi?.replace(/^https?:\/\/doi\.org\//, '');
                      const authorsStr = work.authorships?.map(a => a.author?.display_name).filter(Boolean).slice(0, 3).join(', ');
                      const isAdded = Boolean(cleanDoi && addedDois.has(cleanDoi));

                      return (
                        <div
                          key={work.id}
                          className="p-2.5 bg-[#FAF7F2] border border-[#E8DFD1] text-xs space-y-1.5"
                        >
                          <h4 className="font-sans font-semibold text-xs text-[#292524] leading-snug">
                            {work.title}
                          </h4>

                          <div className="flex flex-wrap items-center gap-x-2 text-[11px] font-mono text-[#78716C]">
                            {authorsStr && <span>{authorsStr}</span>}
                            {work.publication_year && <span>({work.publication_year})</span>}
                            {work.primary_location?.source?.display_name && (
                              <span className="italic">{work.primary_location.source.display_name}</span>
                            )}
                            {typeof work.cited_by_count === 'number' && (
                              <span className="font-bold text-[#292524]">{work.cited_by_count} citações</span>
                            )}
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t border-[#E8DFD1]/60">
                            {cleanDoi ? (
                              <a
                                href={`https://doi.org/${cleanDoi}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-[10px] text-[#57534E] hover:underline flex items-center gap-1"
                              >
                                <span>DOI: {cleanDoi}</span>
                                <ExternalLink size={10} />
                              </a>
                            ) : (
                              <span className="font-mono text-[10px] text-[#A8A29E]">Sem DOI direto</span>
                            )}

                            {cleanDoi && (
                              <button
                                onClick={() => handleImportRelated(work)}
                                disabled={isAdded}
                                className={`ledger-btn px-2 py-0.5 text-[11px] font-mono flex items-center gap-1 ${
                                  isAdded
                                    ? 'bg-[#292524] text-[#FAF7F2]'
                                    : 'bg-[#FFFDF9] text-[#292524]'
                                }`}
                              >
                                {isAdded ? (
                                  <>
                                    <Check size={11} />
                                    <span>Adicionado</span>
                                  </>
                                ) : (
                                  <>
                                    <Plus size={11} />
                                    <span>Adicionar</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* 5. PARTE 3: APONTAMENTOS (Post-its) */}
              <section className="p-3.5 bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow space-y-3">
                <div className="flex items-center justify-between border-b border-[#F0E9DF] pb-2">
                  <div className="flex items-center gap-1.5">
                    <StickyNote size={15} strokeWidth={1.8} className="text-[#292524]" />
                    <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[#292524]">
                      Apontamentos ({notesList.length})
                    </h2>
                  </div>
                  <button
                    onClick={handleAddNote}
                    className="ledger-btn px-2.5 py-1 text-xs font-mono flex items-center gap-1 bg-[#FAF7F2]"
                  >
                    <Plus size={12} />
                    <span>Apontamento</span>
                  </button>
                </div>

                {notesList.length === 0 ? (
                  <p className="text-xs text-[#78716C] italic font-sans py-2">
                    Nenhum apontamento criado. Toque em "+ Apontamento" para registrar notas de leitura ou citações.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {notesList.map((note, idx) => {
                      const isEven = idx % 2 === 0;
                      const rotationClass = isEven ? '-rotate-0.5' : 'rotate-0.5';

                      return (
                        <div
                          key={note.id}
                          className={`p-3 bg-[#FBF1C7] border border-[#E8D9A0] ledger-shadow transition-transform ${rotationClass} hover:rotate-0 flex flex-col justify-between space-y-2`}
                        >
                          {/* Note text / editor */}
                          <textarea
                            value={note.text}
                            onChange={(e) => {
                              const newText = e.target.value;
                              setNotesList((prev) =>
                                prev.map((n) => (n.id === note.id ? { ...n, text: newText } : n))
                              );
                            }}
                            onBlur={(e) => handleUpdateNote(note.id, e.target.value, note.page)}
                            placeholder="Escreva seu apontamento ou fichamento..."
                            rows={3}
                            className="w-full bg-transparent border-none p-0 text-xs font-sans text-[#292524] focus:outline-none resize-none leading-relaxed"
                          />

                          {/* Footer with page, copy citation and delete */}
                          <div className="pt-2 border-t border-[#E8D9A0]/70 flex items-center justify-between text-[11px] font-mono text-[#57534E]">
                            <div className="flex items-center gap-1">
                              <span>p.</span>
                              <input
                                type="text"
                                value={note.page || ''}
                                onChange={(e) => {
                                  const newPage = e.target.value;
                                  setNotesList((prev) =>
                                    prev.map((n) => (n.id === note.id ? { ...n, page: newPage } : n))
                                  );
                                }}
                                onBlur={(e) => handleUpdateNote(note.id, note.text, e.target.value)}
                                placeholder="34"
                                className="w-10 bg-[#FAF7F2] border border-[#E8D9A0] px-1 py-0.5 text-center text-[10px]"
                              />
                            </div>

                            <div className="flex items-center gap-1.5">
                              {note.page && (
                                <button
                                  type="button"
                                  onClick={() => handleCopyCitationWithPage(note.page)}
                                  title="Copiar citação direta com esta página"
                                  className="ledger-btn px-1.5 py-0.5 text-[10px] bg-[#FFFDF9]"
                                >
                                  Citação
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteNote(note.id)}
                                aria-label="Excluir apontamento"
                                className="text-[#991B1B] hover:text-[#DC2626] p-0.5"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
