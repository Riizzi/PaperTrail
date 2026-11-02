import { getAuthHeader } from './api';
import { auth } from './firebase';

/**
 * Anexos guardados no Vercel Blob (store privado).
 * O navegador envia o arquivo direto ao Blob; /api/storage confere o login e o caminho
 * antes de liberar o envio. Para abrir, o servidor gera um link temporário assinado.
 */

export const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024; // 20 MB

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
};

async function storageApi<T = any>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/storage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let data: any = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    // resposta que não é JSON (ex.: falha da própria Vercel)
  }
  if (!res.ok) {
    const detail = data.error || raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
    throw new Error(`Erro no armazenamento (${res.status})${detail ? `: ${detail}` : ''}`);
  }
  return data as T;
}

export function safeFileName(name: string): string {
  return (
    String(name || 'arquivo')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(-120) || 'arquivo'
  );
}

export async function uploadItemAttachment(
  itemId: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ storagePath: string }> {
  if (file.size > MAX_ATTACHMENT_SIZE) {
    throw new Error('Arquivo excede o limite de 20 MB.');
  }
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Faça login para enviar arquivos.');

  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const contentType = MIME_BY_EXT[ext] || file.type;
  if (!Object.values(MIME_BY_EXT).includes(contentType)) {
    throw new Error('Formato não aceito. Use PDF, DOCX ou TXT.');
  }

  const path = `users/${uid}/items/${itemId}/${Date.now()}_${safeFileName(file.name)}`;
  try {
    const { upload } = await import('@vercel/blob/client');
    await upload(path, file, {
      access: 'private',
      handleUploadUrl: '/api/storage',
      headers: await getAuthHeader(),
      contentType,
      multipart: file.size > 5 * 1024 * 1024,
      onUploadProgress: ({ percentage }) => onProgress?.(Math.round(percentage)),
    });
  } catch (err: any) {
    throw new Error(`Falha no envio do arquivo${err?.message ? `: ${err.message}` : '.'}`);
  }

  onProgress?.(100);
  return { storagePath: path };
}

/** Link temporário (1 h) para abrir o anexo */
export async function getAttachmentUrl(storagePath: string): Promise<string> {
  const { url } = await storageApi<{ url: string }>({ action: 'download-url', path: storagePath });
  return url;
}

/**
 * Abre o anexo numa nova aba. A aba é aberta antes da chamada assíncrona
 * para o Safari do iPhone não bloquear como pop-up.
 */
export async function openAttachment(storagePath: string): Promise<void> {
  const win = window.open('', '_blank');
  try {
    const url = await getAttachmentUrl(storagePath);
    if (win) win.location.href = url;
    else window.location.href = url;
  } catch (err) {
    win?.close();
    throw err;
  }
}

export async function deleteItemAttachment(storagePath: string): Promise<void> {
  try {
    await storageApi({ action: 'delete', path: storagePath });
  } catch (err) {
    console.warn('Falha ao remover anexo:', err);
  }
}

export async function deleteItemAttachments(itemId: string): Promise<void> {
  try {
    await storageApi({ action: 'delete-item', itemId });
  } catch (err) {
    console.warn('Falha ao remover anexos do texto:', err);
  }
}

export async function deleteAllAttachments(): Promise<void> {
  await storageApi({ action: 'delete-all' });
}
