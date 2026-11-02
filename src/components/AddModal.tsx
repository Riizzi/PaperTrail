import React, { useState, useEffect, useRef } from 'react';
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
  ClipboardPaste,
} from 'lucide-react';
import { fetchFromCrossRef } from '../services/crossref';
import { fetchFromOpenLibrary } from '../services/openlibrary';
import { requestMetadataFromUrl, requestMetadataFromPdf, requestExtractText, requestSummary } from '../services/api';
import { formatMonthAbbr } from '../services/abnt';
import { saveItemFulltext } from '../services/firebase';
import { uploadItemAttachment, deleteItemAttachments, MAX_ATTACHMENT_SIZE } from '../services/attachments';
import { detectInput, PDF_FILE_RE } from '../services/detect';

export type AddMethod = 'auto' | 'doi' | 'isbn' | 'url' | 'pdf' | 'manual';

/** Entrada que já chega pronta (colada ou arrastada na tela): a busca começa sozinha */
export interface AddInitial {
  method: Exclude<AddMethod, 'auto' | 'manual'>;
  value?: string;
  file?: File;
}

interface AddModalProps {
  userId: string;
  collections: Collection[];
  prefilledDoi?: string;
  initial?: AddInitial;
  onClose: () => void;
  onSave: (item: ReferenceItem) => Promise<void>;
  onToast: (msg: string) => void;
}


export const AddModal: React.FC<AddModalProps> = ({
  userId,
  collections,
  prefilledDoi,
  initial,
  onClose,
  onSave,
  onToast,
}) => {
  const [method, setMethod] = useState<AddMethod>(initial?.method || (prefilledDoi ? 'doi' : 'auto'));
  const [step, setStep] = useState<'input' | 'review'>(prefilledDoi ? 'input' : 'input');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Input states
  const [autoInput, setAutoInput] = useState('');
  const [doiInput, setDoiInput] = useState(prefilledDoi || (initial?.method === 'doi' ? initial.value || '' : ''));
  const [isbnInput, setIsbnInput] = useState(initial?.method === 'isbn' ? initial.value || '' : '');
  const [urlInput, setUrlInput] = useState(initial?.method === 'url' ? initial.value || '' : '');
  const [pdfFile, setPdfFile] = useState<File | null>(initial?.file || null);
  const [isDragging, setIsDragging] = useState(false);
  const detected = method === 'auto' ? detectInput(autoInput) : null;
  // ID definido na abertura para o PDF já ir para a pasta certa do anexo
  const [itemId] = useState(() => `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const [pdfStoragePath, setPdfStoragePath] = useState<string | null>(null);
  const [pdfUploadedFile, setPdfUploadedFile] = useState<File | null>(null);
  // PDF baixado de um link (o servidor já guardou como anexo)
  const [lookupInfo, setLookupInfo] = useState<{ notice?: string; source?: string; trace?: string[] } | null>(null);
  const [linkAttachment, setLinkAttachment] = useState<{ storagePath: string; name: string; size: number; mimeType: string } | null>(null);

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
  const handleFetchMetadata = async (e?: React.FormEvent, override?: AddInitial) => {
    e?.preventDefault();
    let m: AddMethod = override?.method || method;
    let doiVal = override?.method === 'doi' ? override.value || '' : doiInput;
    let isbnVal = override?.method === 'isbn' ? override.value || '' : isbnInput;
    let urlVal = override?.method === 'url' ? override.value || '' : urlInput;
    const pdfFile_ = override?.method === 'pdf' ? override.file || null : pdfFile;

    // Campo único: descobre se é DOI, ISBN, arXiv ou link e segue pelo método certo
    if (m === 'auto') {
      const d = detectInput(autoInput);
      if (!d) {
        setErrorMessage('Não reconheci DOI, ISBN ou link. Confira o texto ou escolha um método abaixo.');
        return;
      }
      m = d.method;
      if (d.method === 'doi') doiVal = d.value;
      if (d.method === 'isbn') isbnVal = d.value;
      if (d.method === 'url') urlVal = d.value;
    }
    if (m !== method) setMethod(m);
    if (m === 'doi') setDoiInput(doiVal);
    if (m === 'isbn') setIsbnInput(isbnVal);
    if (m === 'url') setUrlInput(urlVal);
    if (m === 'pdf' && pdfFile_ !== pdfFile) setPdfFile(pdfFile_);

    setIsLoading(true);
    setErrorMessage(null);

    try {
      let extracted: Partial<ReferenceItem> = {};

      if (m === 'doi') {
        if (!doiVal.trim()) throw new Error('Digite o DOI.');
        extracted = await fetchFromCrossRef(doiVal.trim());
      } else if (m === 'isbn') {
        if (!isbnVal.trim()) throw new Error('Digite o ISBN.');
        extracted = await fetchFromOpenLibrary(isbnVal.trim());
      } else if (m === 'url') {
        if (!urlVal.trim()) throw new Error('Digite ou cole a URL.');
        if (linkAttachment) {
          await deleteItemAttachments(itemId);
          setLinkAttachment(null);
          setPdfStoragePath(null);
        }
        extracted = await requestMetadataFromUrl(urlVal.trim(), itemId);
        const att = (extracted as any).attachment;
        delete (extracted as any).attachment;
        if (att?.storagePath) {
          setLinkAttachment(att);
          setPdfStoragePath(att.storagePath);
          onToast('PDF do link baixado e anexado');
        }
      } else if (m === 'pdf') {
        if (!pdfFile_) throw new Error('Selecione um arquivo PDF.');
        if (pdfFile_.size > MAX_ATTACHMENT_SIZE) throw new Error('Arquivo excede o limite de 20 MB.');
        let path = pdfStoragePath;
        if (!path || pdfUploadedFile !== pdfFile_) {
          if (path) await deleteItemAttachments(itemId);
          path = (await uploadItemAttachment(itemId, pdfFile_)).storagePath;
          setPdfStoragePath(path);
          setPdfUploadedFile(pdfFile_);
        }
        extracted = await requestMetadataFromPdf(path);
      } else if (m === 'manual') {
        extracted = {
          type: 'article',
          title: '',
        };
      }

      const notice = (extracted as any).notice;
      setLookupInfo({ notice, source: (extracted as any).source, trace: (extracted as any).trace });
      delete (extracted as any).notice;
      delete (extracted as any).source;
      delete (extracted as any).trace;

      // If URL is present, record access date at moment of addition
      const effectiveUrl = extracted.url || (m === 'url' ? urlVal.trim() : undefined);
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

  // Entrada colada/arrastada na tela: começa a busca ao abrir (uma vez só, mesmo no StrictMode)
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || !initial || (!initial.value && !initial.file)) return;
    autoStarted.current = true;
    handleFetchMetadata(undefined, initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickDroppedFile = (file: File | undefined) => {
    if (!file) return;
    if (!PDF_FILE_RE.test(file.name)) {
      setErrorMessage('Solte um arquivo PDF.');
      return;
    }
    setPdfFile(file);
    handleFetchMetadata(undefined, { method: 'pdf', file });
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

    // PDF enviado (método PDF) ou baixado de um link: anexa, extrai o texto e gera o resumo
    const pdfSource =
      method === 'pdf' && pdfFile ? 'file' : method === 'url' && linkAttachment ? 'link' : null;
    if (pdfSource) {
      try {
        onToast('Indexando o PDF...');
        if (pdfSource === 'file' && pdfFile) {
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
        } else if (linkAttachment) {
          attachmentInfo = { ...linkAttachment, uploadedAt: new Date().toISOString() };
        }
        const storagePath = attachmentInfo!.storagePath;

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
    { id: 'auto' as AddMethod, label: 'Colar', icon: ClipboardPaste },
    { id: 'doi' as AddMethod, label: 'Por DOI', icon: FileCode },
    { id: 'isbn' as AddMethod, label: 'Por ISBN', icon: Book },
    { id: 'url' as AddMethod, label: 'Por URL', icon: Globe },
    { id: 'pdf' as AddMethod, label: 'Por PDF', icon: Upload },
    { id: 'manual' as AddMethod, label: 'Manual', icon: Edit3 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/40 backdrop-blur-[1px] p-0 sm:p-4">
      <div 
        role="dialog"
        aria-label="Adicionar texto"
        className="w-full sm:max-w-xl bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow-md h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', paddingTop: 'env(safe-area-inset-top, 0px)' }}
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
              {method === 'auto' && (
                <div
                  className="space-y-1.5"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(false);
                    pickDroppedFile(e.dataTransfer.files?.[0]);
                  }}
                >
                  <label htmlFor="auto-input" className="block text-[#57534E] font-medium font-sans">
                    DOI, ISBN, link ou arXiv
                  </label>
                  <textarea
                    id="auto-input"
                    value={autoInput}
                    onChange={(e) => setAutoInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleFetchMetadata();
                      }
                    }}
                    rows={2}
                    placeholder="Cole aqui. Também dá para soltar um PDF."
                    className={`w-full bg-[#FAF7F2] border p-2.5 font-mono text-xs resize-none focus:outline-none focus:border-[#292524] ${
                      isDragging ? 'border-[#292524] border-dashed bg-[#F2ECE1]' : 'border-[#E8DFD1]'
                    }`}
                    autoFocus
                  />
                  <p className="text-[11px] font-mono min-h-4" aria-live="polite">
                    {autoInput.trim() ? (
                      detected ? (
                        <span className="text-[#292524]">
                          Detectado: {detected.method === 'doi' ? 'DOI' : detected.method === 'isbn' ? 'ISBN' : /arxiv\.org/.test(detected.value) ? 'arXiv' : 'link'}{' '}
                          <span className="text-[#78716C]">{detected.value}</span>
                        </span>
                      ) : (
                        <span className="text-[#A8A29E]">Ainda não reconhecido</span>
                      )
                    ) : (
                      <span className="text-[#A8A29E]">Enter para buscar</span>
                    )}
                  </p>
                  <label className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[#57534E] hover:text-[#292524] cursor-pointer underline underline-offset-2">
                    <Upload size={12} />
                    ou escolher um PDF
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => pickDroppedFile(e.target.files?.[0])}
                    />
                  </label>
                </div>
              )}

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
                    Páginas de artigos, blogs e links diretos para PDF (o arquivo é anexado). A IA preenche os dados; confira na revisão.
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
                      <span>{method === "pdf" || method === "url" ? "Lendo e preenchendo (até 1 min)..." : "Buscando dados..."}</span>
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
            <div className="p-2.5 bg-[#FAF7F2] border border-[#E8DFD1] text-[11px] font-sans text-[#57534E] space-y-1">
              <p>Revise e corrija os campos antes de confirmar o salvamento na biblioteca.</p>
              {lookupInfo?.source && (
                <p className="font-mono text-[10px] text-[#78716C]">
                  Fonte dos dados:{' '}
                  {({ doi: 'CrossRef (DOI)', ai: 'IA (Gemini)', tags: 'dados da página', pdf: 'leitura do PDF', wordpress: 'API do site', blocked: 'site bloqueado' } as Record<string, string>)[lookupInfo.source] || lookupInfo.source}
                </p>
              )}
            </div>
            {lookupInfo?.notice && (
              <div className="p-2.5 bg-[#FEF3C7] border border-[#E8D9A0] text-[11px] font-sans text-[#78350F]">
                {lookupInfo.notice}
              </div>
            )}
            {lookupInfo?.trace && lookupInfo.trace.length > 0 && (
              <details className="text-[10px] font-mono text-[#78716C]">
                <summary className="cursor-pointer select-none">Detalhes da leitura</summary>
                <ol className="mt-1 space-y-0.5 list-decimal pl-4 break-words">
                  {lookupInfo.trace.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ol>
              </details>
            )}

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
