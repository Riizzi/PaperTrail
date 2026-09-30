import React, { useState } from 'react';
import type { ReferenceItem, Collection, DocumentType } from '../types';
import {
  X,
  FileCode,
  Book,
  Globe,
  Upload,
  Edit3,
  Loader2,
  ArrowLeft,
  Check,
} from 'lucide-react';
import { fetchFromCrossRef } from '../services/crossref';
import { fetchFromOpenLibrary } from '../services/openlibrary';
import { requestMetadataFromUrl, requestMetadataFromPdf, requestExtractText, requestSummary } from '../services/api';
import { formatMonthAbbr } from '../services/abnt';
import { saveItemFulltext } from '../services/firebase';
import { uploadItemAttachment, deleteItemAttachments, MAX_ATTACHMENT_SIZE } from '../services/attachments';

interface AddModalProps {
  userId: string;
  collections: Collection[];
  prefilledDoi?: string;
  onClose: () => void;
  onSave: (item: ReferenceItem) => Promise<void>;
  onToast: (msg: string) => void;
}

type AddMethod = 'doi' | 'isbn' | 'url' | 'pdf' | 'manual';

export const AddModal: React.FC<AddModalProps> = ({
  userId,
  collections,
  prefilledDoi,
  onClose,
  onSave,
  onToast,
}) => {
  const [method, setMethod] = useState<AddMethod>(prefilledDoi ? 'doi' : 'doi');
  const [step, setStep] = useState<'input' | 'review'>(prefilledDoi ? 'input' : 'input');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Input states
  const [doiInput, setDoiInput] = useState(prefilledDoi || '');
  const [isbnInput, setIsbnInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  // ID definido na abertura para o PDF já ir para a pasta certa do anexo
  const [itemId] = useState(() => `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const [pdfStoragePath, setPdfStoragePath] = useState<string | null>(null);
  const [pdfUploadedFile, setPdfUploadedFile] = useState<File | null>(null);

  // Review & form state
  const [formData, setFormData] = useState<Partial<ReferenceItem>>({
    type: 'article',
    status: 'to_read',
    isFavorite: false,
    tags: [],
    collectionIds: [],
  });
  const [tagInput, setTagInput] = useState('');

  // Handle Fetching Metadata
  const handleFetchMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      let extracted: Partial<ReferenceItem> = {};

      if (method === 'doi') {
        if (!doiInput.trim()) throw new Error('Digite o DOI.');
        extracted = await fetchFromCrossRef(doiInput.trim());
      } else if (method === 'isbn') {
        if (!isbnInput.trim()) throw new Error('Digite o ISBN.');
        extracted = await fetchFromOpenLibrary(isbnInput.trim());
      } else if (method === 'url') {
        if (!urlInput.trim()) throw new Error('Digite ou cole a URL.');
        extracted = await requestMetadataFromUrl(urlInput.trim());
      } else if (method === 'pdf') {
        if (!pdfFile) throw new Error('Selecione um arquivo PDF.');
        if (pdfFile.size > MAX_ATTACHMENT_SIZE) throw new Error('Arquivo excede o limite de 20 MB.');
        let path = pdfStoragePath;
        if (!path || pdfUploadedFile !== pdfFile) {
          if (path) await deleteItemAttachments(itemId);
          path = (await uploadItemAttachment(itemId, pdfFile)).storagePath;
          setPdfStoragePath(path);
          setPdfUploadedFile(pdfFile);
        }
        extracted = await requestMetadataFromPdf(path);
      } else if (method === 'manual') {
        extracted = {
          type: 'article',
          title: '',
        };
      }

      // If URL is present, record access date at moment of addition
      const effectiveUrl = extracted.url || (method === 'url' ? urlInput.trim() : undefined);
      const accessDate = effectiveUrl ? (extracted.accessDate || formatMonthAbbr()) : undefined;

      setFormData((prev) => ({
        ...prev,
        ...extracted,
        url: effectiveUrl,
        accessDate,
        abstract: extracted.abstract || prev.abstract,
        title: extracted.title || prev.title || '',
        type: extracted.type || prev.type || 'article',
      }));

      setStep('review');
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Erro ao obter metadados.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title?.trim()) {
      onToast('O título é obrigatório.');
      return;
    }

    setIsSaving(true);

    let attachmentInfo = undefined;
    let pageCount = undefined;
    let wordCount = undefined;
    let autoSummary = formData.summary;
    let summarySource = formData.summarySource;
    let keyPoints = formData.keyPoints || [];
    let keywords = formData.keywords || [];

    // If added via PDF, automatically upload and attach file
    if (method === 'pdf' && pdfFile) {
      try {
        onToast('Indexando o PDF...');
        const storagePath =
          pdfStoragePath && pdfUploadedFile === pdfFile
            ? pdfStoragePath
            : (await uploadItemAttachment(itemId, pdfFile)).storagePath;
        attachmentInfo = {
          name: pdfFile.name,
          size: pdfFile.size,
          mimeType: pdfFile.type || 'application/pdf',
          storagePath,
          uploadedAt: new Date().toISOString(),
        };

        // Extrai o texto completo e guarda no Firestore
        const extractRes = await requestExtractText(storagePath);
        pageCount = extractRes.pageCount;
        wordCount = extractRes.wordCount;
        await saveItemFulltext(userId, itemId, extractRes.text, { pageCount, wordCount });

        // Auto-generate summary
        try {
          const sumRes = await requestSummary({ id: itemId, ...formData }, extractRes.text);
          autoSummary = sumRes.summary;
          summarySource = sumRes.summarySource;
          keyPoints = sumRes.keyPoints;
          keywords = sumRes.keywords;
        } catch {
          // Fallback if summary fails
        }
      } catch (attachErr) {
        console.warn('PDF auto-attachment notice:', attachErr);
      }
    } else if (formData.abstract && !autoSummary) {
      // If no attachment but abstract found, generate summary based on abstract
      try {
        const sumRes = await requestSummary({ id: itemId, ...formData });
        autoSummary = sumRes.summary;
        summarySource = sumRes.summarySource;
        keyPoints = sumRes.keyPoints;
        keywords = sumRes.keywords;
      } catch {
        // Fallback
      }
    }

    const newItem: ReferenceItem = {
      id: itemId,
      userId,
      type: formData.type || 'article',
      title: formData.title.trim(),
      subtitle: formData.subtitle?.trim() || undefined,
      authors: formData.authors?.trim() || undefined,
      year: formData.year?.trim() || undefined,
      publication: formData.publication?.trim() || undefined,
      publisher: formData.publisher?.trim() || undefined,
      place: formData.place?.trim() || undefined,
      volume: formData.volume?.trim() || undefined,
      number: formData.number?.trim() || undefined,
      pages: formData.pages?.trim() || undefined,
      edition: formData.edition?.trim() || undefined,
      doi: formData.doi?.trim() || undefined,
      isbn: formData.isbn?.trim() || undefined,
      url: formData.url?.trim() || undefined,
      accessDate: formData.accessDate || (formData.url ? formatMonthAbbr() : undefined),
      institution: formData.institution?.trim() || undefined,
      degree: formData.degree?.trim() || undefined,
      bookTitle: formData.bookTitle?.trim() || undefined,
      bookOrganizer: formData.bookOrganizer?.trim() || undefined,
      status: formData.status || 'to_read',
      isFavorite: formData.isFavorite || false,
      tags: formData.tags || [],
      collectionIds: formData.collectionIds || [],
      abstract: formData.abstract?.trim() || undefined,
      summary: autoSummary,
      summarySource,
      pageCount,
      wordCount,
      keyPoints,
      keywords,
      attachment: attachmentInfo,
      notesList: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await onSave(newItem);
      onToast('Texto salvo na biblioteca');
      onClose();
    } catch {
      onToast('Erro ao salvar na biblioteca');
    } finally {
      setIsSaving(false);
    }
  };

  // Fechar sem salvar: remove o PDF que já tinha sido enviado
  const handleCancel = () => {
    if (pdfStoragePath) deleteItemAttachments(itemId);
    onClose();
  };

  const methodTabs = [
    { id: 'doi' as AddMethod, label: 'Por DOI', icon: FileCode },
    { id: 'isbn' as AddMethod, label: 'Por ISBN', icon: Book },
    { id: 'url' as AddMethod, label: 'Por URL', icon: Globe },
    { id: 'pdf' as AddMethod, label: 'Por PDF', icon: Upload },
    { id: 'manual' as AddMethod, label: 'Manual', icon: Edit3 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[1px] p-0 sm:p-4">
      <div 
        className="w-full sm:max-w-xl bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow-md max-h-[92vh] flex flex-col overflow-hidden rounded-t-lg sm:rounded-none"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8DFD1] bg-[#FAF7F2]">
          <div className="flex items-center gap-2">
            {step === 'review' && (
              <button
                type="button"
                onClick={() => setStep('input')}
                aria-label="Voltar"
                className="p-1 -ml-1 text-[#78716C] hover:text-[#292524]"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[#292524]">
              {step === 'input' ? 'Adicionar texto' : 'Revisão dos metadados'}
            </h2>
          </div>
          <button
            onClick={handleCancel}
            aria-label="Fechar"
            className="p-1 text-[#78716C] hover:text-[#292524]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Step 1: Choose Method & Input */}
        {step === 'input' ? (
          <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
            {/* Folder tab buttons for methods */}
            <div className="flex flex-wrap gap-1 border-b border-[#E8DFD1] pb-2">
              {methodTabs.map((m) => {
                const Icon = m.icon;
                const isActive = method === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setMethod(m.id);
                      setErrorMessage(null);
                    }}
                    className={`ledger-btn px-2.5 py-1.5 text-xs font-mono flex items-center gap-1.5 ${
                      isActive ? 'bg-[#292524] text-[#FAF7F2] font-semibold' : 'bg-[#FAF7F2] text-[#57534E]'
                    }`}
                  >
                    <Icon size={13} />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>

            {errorMessage && (
              <div className="p-2.5 bg-[#FFF5F5] border border-[#FCA5A5] text-[#991B1B] font-mono text-xs">
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleFetchMetadata} className="space-y-4 pt-2">
              {method === 'doi' && (
                <div className="space-y-1.5">
                  <label className="block text-[#57534E] font-medium font-sans">
                    DOI do documento
                  </label>
                  <input
                    type="text"
                    value={doiInput}
                    onChange={(e) => setDoiInput(e.target.value)}
                    placeholder="ex: 10.1016/j.cell.2023.01.002 ou link"
                    className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2.5 font-mono text-xs focus:outline-none focus:border-[#292524]"
                    autoFocus
                  />
                  <p className="text-[11px] text-[#78716C] font-sans">
                    Consulta automática à base pública do CrossRef.
                  </p>
                </div>
              )}

              {method === 'isbn' && (
                <div className="space-y-1.5">
                  <label className="block text-[#57534E] font-medium font-sans">
                    ISBN do livro
                  </label>
                  <input
                    type="text"
                    value={isbnInput}
                    onChange={(e) => setIsbnInput(e.target.value)}
                    placeholder="ex: 9788535902778 ou 8535902775"
                    className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2.5 font-mono text-xs focus:outline-none focus:border-[#292524]"
                    autoFocus
                  />
                  <p className="text-[11px] text-[#78716C] font-sans">
                    Consulta automática ao acervo do Open Library.
                  </p>
                </div>
              )}

              {method === 'url' && (
                <div className="space-y-1.5">
                  <label className="block text-[#57534E] font-medium font-sans">
                    URL da página ou artigo
                  </label>
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2.5 font-mono text-xs focus:outline-none focus:border-[#292524]"
                    autoFocus
                  />
                  <p className="text-[11px] text-[#78716C] font-sans">
                    O Gemini analisará a página e extrairá os metadados bibliográficos.
                  </p>
                </div>
              )}

              {method === 'pdf' && (
                <div className="space-y-2">
                  <label className="block text-[#57534E] font-medium font-sans">
                    Arquivo PDF do artigo ou trabalho
                  </label>
                  <div className="border border-dashed border-[#C5BBAA] p-6 bg-[#FAF7F2] text-center hover:bg-[#F2ECE1] cursor-pointer">
                    <input
                      type="file"
                      accept="application/pdf"
                      id="pdf-upload"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setPdfFile(e.target.files[0]);
                        }
                      }}
                      className="hidden"
                    />
                    <label htmlFor="pdf-upload" className="cursor-pointer block">
                      <Upload size={24} className="mx-auto mb-2 text-[#78716C]" />
                      <span className="font-mono text-xs text-[#292524] font-medium block">
                        {pdfFile ? pdfFile.name : 'Selecionar arquivo PDF'}
                      </span>
                      <span className="text-[11px] text-[#78716C] font-sans block mt-1">
                        O PDF será extraído e anexado automaticamente ao texto.
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {method === 'manual' && (
                <div className="p-3 bg-[#FAF7F2] border border-[#E8DFD1] text-xs font-sans text-[#57534E]">
                  Preencha os dados do documento na tela de revisão a seguir.
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="ledger-btn-primary px-4 py-2 text-xs font-mono flex items-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Processando metadados...</span>
                    </>
                  ) : (
                    <span>Avançar para revisão</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* Step 2: Mandatory Review Screen */
          <form onSubmit={handleSaveItem} className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
            <div className="p-2.5 bg-[#FAF7F2] border border-[#E8DFD1] text-[11px] font-sans text-[#57534E]">
              Revise e corrija os campos antes de confirmar o salvamento na biblioteca.
            </div>

            <div>
              <label className="block text-[#57534E] mb-1 font-mono uppercase text-[11px] font-bold">
                Tipo de documento
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as DocumentType })}
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
              <label className="block text-[#57534E] mb-1 font-sans font-semibold">
                Título *
              </label>
              <input
                type="text"
                value={formData.title || ''}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-sans text-xs"
                placeholder="Título principal"
                required
              />
            </div>

            <div>
              <label className="block text-[#57534E] mb-1 font-sans">
                Subtítulo
              </label>
              <input
                type="text"
                value={formData.subtitle || ''}
                onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-sans text-xs"
                placeholder="Subtítulo complementar"
              />
            </div>

            <div>
              <label className="block text-[#57534E] mb-1 font-sans">
                Autores
              </label>
              <input
                type="text"
                value={formData.authors || ''}
                onChange={(e) => setFormData({ ...formData, authors: e.target.value })}
                className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-sans text-xs"
                placeholder="SILVA, João Pedro; SANTOS, Maria"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[#57534E] mb-1 font-sans">Ano</label>
                <input
                  type="text"
                  value={formData.year || ''}
                  onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                  className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-mono text-xs"
                  placeholder="2024"
                />
              </div>
              <div>
                <label className="block text-[#57534E] mb-1 font-sans">Local</label>
                <input
                  type="text"
                  value={formData.place || ''}
                  onChange={(e) => setFormData({ ...formData, place: e.target.value })}
                  className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-sans text-xs"
                  placeholder="São Paulo"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[#57534E] mb-1 font-sans">
                  {formData.type === 'book' || formData.type === 'chapter' ? 'Editora' : 'Periódico / Anais'}
                </label>
                <input
                  type="text"
                  value={formData.publication || formData.publisher || ''}
                  onChange={(e) => {
                    if (formData.type === 'book') {
                      setFormData({ ...formData, publisher: e.target.value });
                    } else {
                      setFormData({ ...formData, publication: e.target.value });
                    }
                  }}
                  className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-sans text-xs"
                />
              </div>

              <div>
                <label className="block text-[#57534E] mb-1 font-sans">DOI</label>
                <input
                  type="text"
                  value={formData.doi || ''}
                  onChange={(e) => setFormData({ ...formData, doi: e.target.value })}
                  className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-mono text-xs"
                  placeholder="10.xxxx/..."
                />
              </div>
            </div>

            {formData.type === 'article' && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[#57534E] mb-1 font-sans">Volume</label>
                  <input
                    type="text"
                    value={formData.volume || ''}
                    onChange={(e) => setFormData({ ...formData, volume: e.target.value })}
                    className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[#57534E] mb-1 font-sans">Número</label>
                  <input
                    type="text"
                    value={formData.number || ''}
                    onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                    className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[#57534E] mb-1 font-sans">Páginas</label>
                  <input
                    type="text"
                    value={formData.pages || ''}
                    onChange={(e) => setFormData({ ...formData, pages: e.target.value })}
                    className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-mono text-xs"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[#57534E] mb-1 font-sans">Resumo original (Abstract)</label>
              <textarea
                value={formData.abstract || ''}
                onChange={(e) => setFormData({ ...formData, abstract: e.target.value })}
                rows={3}
                placeholder="Resumo extraído da obra..."
                className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-sans text-xs"
              />
            </div>

            {/* Status & Tags */}
            <div className="pt-2 border-t border-[#E8DFD1] space-y-3">
              <div>
                <label className="block text-[#57534E] mb-1 font-sans">Status de leitura</label>
                <div className="flex gap-2">
                  {(['to_read', 'reading', 'read'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setFormData({ ...formData, status: st })}
                      className={`ledger-btn px-2.5 py-1 text-xs font-mono ${
                        formData.status === st ? 'bg-[#292524] text-[#FAF7F2] font-semibold' : 'bg-[#FAF7F2]'
                      }`}
                    >
                      {st === 'to_read' ? 'Para ler' : st === 'reading' ? 'Lendo' : 'Lido'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-[#57534E] mb-1 font-sans">Tags</label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {formData.tags?.map((t) => (
                    <span key={t} className="folder-chip">
                      #{t}
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, tags: formData.tags?.filter(x => x !== t) })}
                        className="ml-1 text-[#78716C] hover:text-[#292524]"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Digite uma tag e pressione Enter"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const val = tagInput.trim().replace(/^#/, '');
                      if (val && !formData.tags?.includes(val)) {
                        setFormData({ ...formData, tags: [...(formData.tags || []), val] });
                        setTagInput('');
                      }
                    }
                  }}
                  className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-mono text-xs"
                />
              </div>

              {/* Coleções */}
              {collections.length > 0 && (
                <div>
                  <label className="block text-[#57534E] mb-1 font-sans">Adicionar às coleções</label>
                  <div className="space-y-1 max-h-28 overflow-y-auto border border-[#E8DFD1] p-2 bg-[#FAF7F2]">
                    {collections.map((col) => {
                      const selected = formData.collectionIds?.includes(col.id);
                      return (
                        <label key={col.id} className="flex items-center gap-2 cursor-pointer font-sans text-xs">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(e) => {
                              const curr = formData.collectionIds || [];
                              if (e.target.checked) {
                                setFormData({ ...formData, collectionIds: [...curr, col.id] });
                              } else {
                                setFormData({ ...formData, collectionIds: curr.filter(id => id !== col.id) });
                              }
                            }}
                          />
                          <span>{col.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-[#E8DFD1]">
              <button
                type="button"
                onClick={() => setStep('input')}
                disabled={isSaving}
                className="ledger-btn px-3 py-1.5 text-xs font-mono"
              >
                Voltar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="ledger-btn-primary px-4 py-1.5 text-xs font-mono flex items-center gap-1.5"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    <span>Salvar na biblioteca</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
