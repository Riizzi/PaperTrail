import { GoogleGenAI, Type } from '@google/genai';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export { Type };

// Modelo do Gemini usado em todas as rotas
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// Firebase Admin só verifica o token de login (não precisa de credenciais, só do projectId)
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
const adminApp = getApps().length === 0 ? initializeApp({ projectId }) : getApps()[0];
const adminAuth = getAuth(adminApp);

// Supabase Storage (anexos). A service role key fica só no servidor.
export const ATTACHMENTS_BUCKET = 'attachments';
let supabaseAdmin: SupabaseClient | null = null;
export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('Armazenamento de anexos não configurado no servidor.');
    }
    supabaseAdmin = createClient(url, key, { auth: { persistSession: false } });
  }
  return supabaseAdmin;
}

export function sendJson(res: any, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

// Limite diário por usuário (em memória, por instância do servidor)
const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT || 50);
const rateLimits = new Map<string, { count: number; date: string }>();

function consumeQuota(uid: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  const current = rateLimits.get(uid);
  if (!current || current.date !== today) {
    rateLimits.set(uid, { count: 1, date: today });
    return true;
  }
  if (current.count >= DAILY_LIMIT) return false;
  current.count += 1;
  return true;
}

/**
 * Verifica o login (ID token do Firebase). Com countQuota, também desconta do limite diário de IA.
 * Retorna o uid, ou responde com erro e retorna null.
 */
export async function requireUser(req: any, res: any, opts: { countQuota?: boolean } = {}): Promise<string | null> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Método não permitido' });
    return null;
  }

  const header: string | undefined = req.headers?.authorization || req.headers?.Authorization;
  if (!header || !header.startsWith('Bearer ')) {
    sendJson(res, 401, { error: 'Faça login para usar este recurso' });
    return null;
  }

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(header.slice(7));
    uid = decoded.uid;
  } catch {
    sendJson(res, 401, { error: 'Sessão expirada. Entre novamente.' });
    return null;
  }

  if (opts.countQuota && !consumeQuota(uid)) {
    sendJson(res, 429, { error: `Limite diário de ${DAILY_LIMIT} usos de IA atingido. Tente amanhã.` });
    return null;
  }

  return uid;
}

/** Garante que o caminho do arquivo pertence ao usuário logado */
export function isOwnPath(uid: string, path: unknown): path is string {
  return typeof path === 'string' && path.startsWith(`users/${uid}/`) && !path.includes('..');
}

export async function downloadAttachment(path: string): Promise<Buffer> {
  const { data, error } = await getSupabaseAdmin().storage.from(ATTACHMENTS_BUCKET).download(path);
  if (error || !data) {
    throw new Error('Arquivo não encontrado no armazenamento.');
  }
  return Buffer.from(await data.arrayBuffer());
}
