import { getAuthHeader } from './api';

/**
 * Anexos guardados no Supabase Storage (bucket privado "attachments").
 * O servidor (/api/storage) confere o login e gera um token de envio de uso único;
 * o arquivo vai direto do navegador para o Supabase, sem passar pela Vercel.
 */

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const BUCKET = 'attachments';

export const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024; // 20 MB

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

export async function uploadItemAttachment(
  itemId: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ storagePath: string }> {
  if (file.size > MAX_ATTACHMENT_SIZE) {
    throw new Error('Arquivo excede o limite de 20 MB.');
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Armazenamento de anexos não configurado.');
  }

  const { path, token } = await storageApi<{ path: string; token: string }>({
    action: 'upload-url',
    itemId,
    fileName: file.name,
  });

  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const url = `${SUPABASE_URL}/storage/v1/object/upload/sign/${BUCKET}/${encodedPath}?token=${encodeURIComponent(token)}`;

  const form = new FormData();
  form.append('cacheControl', '3600');
  form.append('', file);

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
    // Chaves novas (sb_publishable_...) não são JWT e vão só no header apikey
    if (!SUPABASE_ANON_KEY.startsWith('sb_')) {
      xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_ANON_KEY}`);
    }
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Falha no envio do arquivo (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error('Falha de conexão ao enviar o arquivo.'));
    xhr.send(form);
  });

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
