/**
 * Migração única: copia os anexos do Supabase Storage (bucket "attachments") para o Vercel Blob,
 * no MESMO caminho (users/{uid}/items/{id}/arquivo). Como o caminho não muda, os textos no
 * Firestore continuam apontando para o arquivo certo.
 *
 * Uso (o Supabase precisa estar ativo):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... BLOB_READ_WRITE_TOKEN=... node scripts/migrate-supabase-to-blob.mjs
 * ou com as variáveis no .env.local:
 *   node --env-file=.env.local scripts/migrate-supabase-to-blob.mjs
 *
 * Pode rodar mais de uma vez: arquivos que já existem no Blob são pulados.
 */
import { put, head } from '@vercel/blob';

const BASE = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BUCKET = 'attachments';

if (!BASE || !KEY || !process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('Defina SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e BLOB_READ_WRITE_TOKEN.');
  process.exit(1);
}

const headers = { apikey: KEY, ...(KEY.startsWith('sb_') ? {} : { Authorization: `Bearer ${KEY}` }) };

async function listFolder(prefix) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${BASE}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 1000, offset }),
    });
    if (!res.ok) throw new Error(`Falha ao listar "${prefix}": ${res.status} ${await res.text()}`);
    const page = await res.json();
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

async function* walk(prefix) {
  for (const entry of await listFolder(prefix)) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id === null) yield* walk(path); // pasta
    else yield { path, contentType: entry.metadata?.mimetype || 'application/octet-stream' };
  }
}

let copied = 0;
let skipped = 0;
let failed = 0;

for await (const { path, contentType } of walk('users')) {
  try {
    const exists = await head(path).then(() => true, () => false);
    if (exists) {
      skipped++;
      continue;
    }
    const res = await fetch(`${BASE}/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`, { headers });
    if (!res.ok) throw new Error(`download ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    await put(path, bytes, { access: 'private', contentType, addRandomSuffix: false });
    copied++;
    console.log(`ok  ${path} (${(bytes.length / 1024).toFixed(0)} KB)`);
  } catch (err) {
    failed++;
    console.error(`ERRO ${path}: ${err.message}`);
  }
}

console.log(`\nCopiados: ${copied} · Já existiam: ${skipped} · Falhas: ${failed}`);
process.exit(failed ? 1 : 0);
