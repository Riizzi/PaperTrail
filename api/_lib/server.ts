import { GoogleGenAI, Type, ThinkingLevel, type GenerateContentParameters } from '@google/genai';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export { Type, ThinkingLevel };

// Modelo do Gemini usado em todas as rotas
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Registro das etapas de uma requisição (aparece na tela de revisão para diagnóstico) */
export type Trace = string[];

// Modelos alternativos descobertos na própria API (cache por instância)
let fallbackModels: string[] | null = null;
async function getFallbackModels(primary: string): Promise<string[]> {
  if (fallbackModels) return fallbackModels;
  const env = (process.env.GEMINI_FALLBACK_MODELS || '').split(',').map((m) => m.trim()).filter(Boolean);
  const found: string[] = [];
  try {
    const pager = await ai.models.list({ config: { pageSize: 100 } });
    for await (const m of pager) {
      const name = (m.name || '').replace(/^models\//, '');
      if (!/gemini/i.test(name) || !/flash/i.test(name)) continue;
      if (/(image|tts|audio|live|embedding|exp|preview|thinking)/i.test(name)) continue;
      if (m.supportedActions && !m.supportedActions.includes('generateContent')) continue;
      found.push(name);
    }
  } catch {
    // sem lista: usa só os da variável de ambiente
  }
  // versões mais novas primeiro; "lite" depois do flash normal de mesma versão
  found.sort((a, b) => {
    const va = parseFloat(a.match(/(\d+(?:\.\d+)?)/)?.[1] || '0');
    const vb = parseFloat(b.match(/(\d+(?:\.\d+)?)/)?.[1] || '0');
    return vb - va || Number(/lite/.test(a)) - Number(/lite/.test(b));
  });
  fallbackModels = [...new Set([...env, ...found])].filter((m) => m !== primary).slice(0, 3);
  return fallbackModels;
}

const isTransient = (msg: string) => /503|UNAVAILABLE|overloaded|429|RESOURCE_EXHAUSTED|quota|500|INTERNAL/i.test(msg);
const isModelGone = (msg: string) => /404|NOT_FOUND|no longer available|not supported for/i.test(msg);

/**
 * Chamada ao Gemini pensada para não falhar:
 * - raciocínio reduzido (mais rápido); se o modelo recusar, repete sem o ajuste
 * - se a chamada com ferramentas (abrir URL / busca) for recusada, tenta só com a leitura de URL
 * - sobrecarga ou cota: espera e tenta de novo; depois troca para outro modelo Flash disponível
 * - prazo total para nunca estourar o limite da função na Vercel (120 s)
 */
export async function generate(
  params: GenerateContentParameters,
  level: ThinkingLevel = ThinkingLevel.LOW,
  opts: { deadlineMs?: number; trace?: Trace } = {}
) {
  const trace = opts.trace;
  const deadline = Date.now() + (opts.deadlineMs ?? 90_000);
  const models = [params.model, ...(await getFallbackModels(params.model).catch(() => []))];
  let lastErr: any = null;

  for (const model of models) {
    const waits = model === params.model ? [1500, 4000] : [2000];
    for (let attempt = 0; attempt <= waits.length; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < 4000) {
        trace?.push('IA: prazo esgotado');
        throw lastErr || new Error('DEADLINE: a IA demorou demais para responder.');
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remaining);
      try {
        const out = await generateOnce({ ...params, model, config: { ...(params.config || {}), abortSignal: controller.signal } }, level);
        trace?.push(`IA ok (${model})`);
        return out;
      } catch (err: any) {
        lastErr = controller.signal.aborted ? new Error('DEADLINE: a IA demorou demais para responder.') : err;
        const msg = String(lastErr?.message || '');
        trace?.push(`IA erro (${model}): ${msg.replace(/\s+/g, ' ').slice(0, 120)}`);
        if (controller.signal.aborted) throw lastErr;
        if (isModelGone(msg)) break; // próximo modelo
        if (!isTransient(msg)) throw lastErr;
        if (attempt < waits.length && Date.now() + waits[attempt] < deadline) await sleep(waits[attempt]);
        else break; // próximo modelo
      } finally {
        clearTimeout(timer);
      }
    }
  }
  throw lastErr || new Error('IA indisponível.');
}

async function generateOnce(params: GenerateContentParameters, level: ThinkingLevel) {
  const withThinking = { ...params, config: { ...(params.config || {}), thinkingConfig: { thinkingLevel: level } } };
  try {
    return await ai.models.generateContent(withThinking);
  } catch (err: any) {
    const msg = String(err?.message || '');
    if (/thinking/i.test(msg) && /(invalid|not supported|unsupported|unknown|not enabled)/i.test(msg)) {
      return await ai.models.generateContent(params);
    }
    const tools = (params.config as any)?.tools;
    if (tools?.length > 1 && /tool|search|url_context|urlContext/i.test(msg) && /(not supported|unsupported|invalid|only one|combin)/i.test(msg)) {
      return await ai.models.generateContent({ ...params, config: { ...(params.config || {}), tools: [tools[0]] } });
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
