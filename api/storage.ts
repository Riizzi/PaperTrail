import { handleUpload } from '@vercel/blob/client';
import {
  requireUser,
  sendJson,
  isOwnPath,
  signedAttachmentUrl,
  deleteAttachment,
  deleteAttachmentPrefix,
  MAX_ATTACHMENT_BYTES,
  ATTACHMENT_TYPES,
} from './_lib/server.js';

/**
 * Anexos no Vercel Blob (store privado), sempre restritos a users/{uid}/.
 * - pedido do SDK (type: blob.generate-client-token): libera o envio direto do navegador
 *   para um caminho em users/{uid}/items/{itemId}/
 * - download-url: { path }   -> { url }  (link temporário para abrir o arquivo)
 * - delete:       { path }   -> apaga um arquivo
 * - delete-item:  { itemId } -> apaga todos os arquivos de um texto
 * - delete-all:   {}         -> apaga todos os arquivos do usuário (excluir conta)
 */
export default async function handler(req: any, res: any) {
  try {
    await run(req, res);
  } catch (err: any) {
    console.error('Unhandled error in /api/storage:', err);
    if (!res.headersSent) sendJson(res, 500, { error: err?.message || 'Erro inesperado no servidor.' });
  }
}

const validItemId = (id: unknown): id is string => typeof id === 'string' && /^[\w-]{1,128}$/.test(id);

async function run(req: any, res: any) {
  const uid = await requireUser(req, res);
  if (!uid) return;

  const body = req.body || {};

  try {
    if (body.type === 'blob.generate-client-token') {
      const result = await handleUpload({
        body,
        request: req,
        onBeforeGenerateToken: async (pathname) => {
          const parts = pathname.split('/');
          if (!isOwnPath(uid, pathname) || parts.length !== 5 || parts[2] !== 'items' || !validItemId(parts[3])) {
            throw new Error('Caminho de envio inválido.');
          }
          return {
            allowedContentTypes: ATTACHMENT_TYPES,
            maximumSizeInBytes: MAX_ATTACHMENT_BYTES,
            addRandomSuffix: false,
            allowOverwrite: false,
          };
        },
      });
      return sendJson(res, 200, result);
    }

    const { action, itemId, path } = body;

    if (action === 'download-url') {
      if (!isOwnPath(uid, path)) return sendJson(res, 403, { error: 'Acesso negado.' });
      return sendJson(res, 200, { url: await signedAttachmentUrl(path) });
    }

    if (action === 'delete') {
      if (!isOwnPath(uid, path)) return sendJson(res, 403, { error: 'Acesso negado.' });
      await deleteAttachment(path);
      return sendJson(res, 200, { ok: true });
    }

    if (action === 'delete-item') {
      if (!validItemId(itemId)) return sendJson(res, 400, { error: 'Texto inválido.' });
      await deleteAttachmentPrefix(`users/${uid}/items/${itemId}/`);
      return sendJson(res, 200, { ok: true });
    }

    if (action === 'delete-all') {
      await deleteAttachmentPrefix(`users/${uid}/`);
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 400, { error: 'Ação inválida.' });
  } catch (err: any) {
    console.error('Error in /api/storage:', body.action || body.type, err);
    const msg = err?.message || (typeof err === 'string' ? err : '') || 'Erro no armazenamento de anexos.';
    return sendJson(res, 500, { error: String(msg) });
  }
}
