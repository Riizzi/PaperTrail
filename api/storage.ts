import { requireUser, sendJson, isOwnPath, getSupabaseAdmin, ATTACHMENTS_BUCKET } from './_lib/server.js';

/**
 * Operações de anexo no Supabase Storage, sempre restritas a users/{uid}/.
 * - upload-url:   { itemId, fileName }  -> { path, token }  (o navegador envia o arquivo direto ao Supabase)
 * - download-url: { path }              -> { url }         (link temporário para abrir o arquivo)
 * - delete:       { path }              -> apaga um arquivo
 * - delete-item:  { itemId }            -> apaga todos os arquivos de um texto
 * - delete-all:   {}                    -> apaga todos os arquivos do usuário (excluir conta)
 */
export default async function handler(req: any, res: any) {
  try {
    await run(req, res);
  } catch (err: any) {
    console.error('Unhandled error in /api/storage:', err);
    if (!res.headersSent) sendJson(res, 500, { error: err?.message || 'Erro inesperado no servidor.' });
  }
}

async function run(req: any, res: any) {
  const uid = await requireUser(req, res);
  if (!uid) return;

  const { action, itemId, fileName, path } = req.body || {};

  try {
    const bucket = getSupabaseAdmin().storage.from(ATTACHMENTS_BUCKET);

    if (action === 'upload-url') {
      if (typeof itemId !== 'string' || !/^[\w-]{1,128}$/.test(itemId)) {
        return sendJson(res, 400, { error: 'Texto inválido.' });
      }
      const safeName = String(fileName || 'arquivo')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(-120);
      const objectPath = `users/${uid}/items/${itemId}/${Date.now()}_${safeName}`;
      const { data, error } = await bucket.createSignedUploadUrl(objectPath);
      if (error || !data) throw error || new Error('Falha ao preparar envio.');
      return sendJson(res, 200, { path: objectPath, token: data.token });
    }

    if (action === 'download-url') {
      if (!isOwnPath(uid, path)) return sendJson(res, 403, { error: 'Acesso negado.' });
      const { data, error } = await bucket.createSignedUrl(path, 60 * 60);
      if (error || !data) throw error || new Error('Arquivo não encontrado.');
      return sendJson(res, 200, { url: data.signedUrl });
    }

    if (action === 'delete') {
      if (!isOwnPath(uid, path)) return sendJson(res, 403, { error: 'Acesso negado.' });
      await bucket.remove([path]);
      return sendJson(res, 200, { ok: true });
    }

    if (action === 'delete-item' || action === 'delete-all') {
      if (action === 'delete-item' && (typeof itemId !== 'string' || !/^[\w-]{1,128}$/.test(itemId))) {
        return sendJson(res, 400, { error: 'Texto inválido.' });
      }
      const itemFolders =
        action === 'delete-item'
          ? [itemId as string]
          : ((await bucket.list(`users/${uid}/items`, { limit: 1000 })).data || []).map((f) => f.name);

      for (const folder of itemFolders) {
        const prefix = `users/${uid}/items/${folder}`;
        const { data: files } = await bucket.list(prefix, { limit: 1000 });
        const paths = (files || []).map((f) => `${prefix}/${f.name}`);
        if (paths.length) await bucket.remove(paths);
      }
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 400, { error: 'Ação inválida.' });
  } catch (err: any) {
    console.error('Error in /api/storage:', action, err);
    const msg = err?.message || err?.error || (typeof err === 'string' ? err : '') || 'Erro no armazenamento de anexos.';
    return sendJson(res, 500, { error: String(msg) });
  }
}
