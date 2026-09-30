import { auth, getItemFulltext } from './firebase';
import type { ReferenceItem } from '../types';

export async function getAuthHeader(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  try {
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

export interface SummaryResult {
  summary: string;
  keyPoints: string[];
  keywords: string[];
  summarySource: 'fulltext' | 'abstract';
}

const MAX_SUMMARY_CHARS = 500_000;

export async function requestSummary(item: Partial<ReferenceItem>, fulltext?: string): Promise<SummaryResult> {
  // Sem texto informado: usa o texto completo já extraído do anexo (se houver)
  let text = fulltext;
  if (!text && item.attachment && item.id && item.userId) {
    text = await getItemFulltext(item.userId, item.id);
  }
  const authHeader = await getAuthHeader();
  const res = await fetch('/api/summarize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({
      fulltext: text ? text.slice(0, MAX_SUMMARY_CHARS) : undefined,
      abstract: item.abstract,
      title: item.title,
      subtitle: item.subtitle,
      authors: item.authors,
      year: item.year,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Erro ao gerar resumo (${res.status})`);
  }

  return await res.json();
}

export async function requestExtractText(storagePath: string): Promise<{
  success: boolean;
  text: string;
  pageCount: number;
  wordCount: number;
  charCount: number;
}> {
  const authHeader = await getAuthHeader();
  const res = await fetch('/api/extract-text', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({
      storagePath,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Erro ao extrair texto do anexo (${res.status})`);
  }

  return await res.json();
}

export async function requestSearchTerms(item: Partial<ReferenceItem>): Promise<string[]> {
  const authHeader = await getAuthHeader();
  const res = await fetch('/api/search-terms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({
      title: item.title,
      summary: item.summary,
      keywords: item.keywords,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Erro ao gerar termos de busca (${res.status})`);
  }

  const data = await res.json();
  return data.searchTerms || [];
}

export async function requestMetadataFromUrl(url: string): Promise<Partial<ReferenceItem>> {
  const authHeader = await getAuthHeader();
  const res = await fetch('/api/extract-metadata', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({
      mode: 'url',
      url,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Erro ao extrair metadados da URL (${res.status})`);
  }

  return await res.json();
}

export async function requestMetadataFromPdf(storagePath: string): Promise<Partial<ReferenceItem>> {
  const authHeader = await getAuthHeader();
  const res = await fetch('/api/extract-metadata', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({
      mode: 'pdf',
      storagePath,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Erro ao extrair metadados do PDF (${res.status})`);
  }

  return await res.json();
}
