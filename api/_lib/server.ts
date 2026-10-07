import { GoogleGenAI, Type, ThinkingLevel, type GenerateContentParameters } from '@google/genai';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export { Type, ThinkingLevel };

// Modelo do Gemini usado em todas as rotas
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

/**
 * Chamada ao Gemini com raciocínio reduzido (respostas bem mais rápidas, importante no
 * limite de tempo das funções da Vercel). Se o modelo não aceitar o ajuste, repete sem ele.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Repete chamadas que falharam por sobrecarga momentânea (503/429), com espera crescente */
export async function generate(
  params: GenerateContentParameters,
  level: ThinkingLevel = ThinkingLevel.LOW,
  opts: { deadlineMs?: number } = {}
) {
  // Prazo total (inclui novas tentativas) para nunca estourar os 60 s da Vercel
  const deadline = Date.now() + (opts.deadlineMs ?? 45_000);
  const waits = [1500, 4000];
  for (let attempt = 0; ; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < 3000) throw new Error('DEADLINE: a IA demorou demais para responder.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    try {
      return await generateOnce({ ...params, config: { ...(params.config || {}), abortSignal: controller.signal } }, level);
    } catch (err: any) {
      if (controller.signal.aborted) throw new Error('DEADLINE: a IA demorou demais para responder.');
      const msg = String(err?.message || '');
      const transient = /503|UNAVAILABLE|overloaded|429|RESOURCE_EXHAUSTED/i.test(msg);
      if (!transient || attempt >= waits.length || Date.now() + waits[attempt] > deadline) throw err;
      await sleep(waits[attempt]);
    } finally {
      clearTimeout(timer);
    }
  }
}

async function generateOnce(params: GenerateContentParameters, level: ThinkingLevel) {
  try {
    return await ai.models.generateContent({
      ...params,
      config: { ...(params.config || {}), thinkingConfig: { thinkingLevel: level } },
    });
  } catch (err: any) {
    const msg = String(err?.message || '');
    if (/thinking/i.test(msg) && /(invalid|not supported|unsupported|unknown)/i.test(msg)) {
      return await ai.models.generateContent(params);
    }
    throw err;
  }
}

/** Mensagem de erro curta e em português para falhas do Gemini */
export function aiErrorMessage(err: any, fallback: string): string {
  const msg = String(err?.message || '');
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) return 'Limite de uso da IA atingido no momento. Tente de novo em alguns minutos.';
  if (/404|NOT_FOUND|no longer available/i.test(msg)) return 'Modelo de IA indisponível. Atualize a variável GEMINI_MODEL.';
  if (/API key|PERMISSION_DENIED|401|403/i.test(msg)) return 'Chave do Gemini inválida ou sem permissão.';
  if (/503|UNAVAILABLE|overloaded/i.test(msg)) return 'A IA está sobrecarregada agora. Tente de novo em instantes.';
  if (/DEADLINE/.test(msg)) return 'A IA demorou demais para responder. Tente de novo em instantes.';
  return msg && msg.length < 200 && !msg.startsWith('{') ? msg : fallback;
}

// Verificação do token de login do Firebase com as chaves públicas do Google (sem firebase-admin)
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || '';
const firebaseJwks = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

async function verifyFirebaseToken(token: string): Promise<string> {
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID não configurado');
  const { payload } = await jwtVerify(token, firebaseJwks, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    algorithms: ['RS256'],
  });
  if (!payload.sub) throw new Error('Token sem usuário');
  return payload.sub;
}

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
    uid = await verifyFirebaseToken(header.slice(7));
  } catch (err) {
    console.warn('Token inválido:', (err as Error)?.message);
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
