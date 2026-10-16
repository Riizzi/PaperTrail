/**
 * Link CL4P-RZ: envia um resumo dos dados deste app para o hub pessoal CL4P-RZ.
 *
 * - O vínculo é um código "cl4p1.<base64url>" com o endereço do servidor e a chave pessoal.
 *   Chega pela URL (?cl4p=...), por deep link (esquema://cl4p?code=...) ou colado nos ajustes.
 * - publicar() agenda o envio (3 s de espera para juntar alterações) e só manda se algo mudou.
 * - Sem vínculo, nada é enviado. Sem internet, tenta de novo quando a conexão voltar.
 * Contrato: POST {servidor}/api/ingest  { app, schema: 1, generatedAt, data }
 */

export type Cl4pApp = 'retrofin' | 'routinetracker' | 'smartpantry' | 'wishwatch' | 'papertrail' | 'rotmg';

export interface Cl4pVinculo {
  u: string;
  k: string;
}

export interface Cl4pStatus {
  vinculado: boolean;
  servidor: string | null;
  ultimoEnvio: string | null;
  erro: string | null;
  enviando: boolean;
}

const CHAVE = 'cl4p.link.v1';
const CHAVE_STATUS = 'cl4p.link.status.v1';
const ESPERA_MS = 3000;

function lerJson<T>(k: string): T | null {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

function gravarJson(k: string, v: unknown) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* armazenamento indisponível */
  }
}

export function decodificarCodigo(codigo: string): Cl4pVinculo | null {
  const m = (codigo || '').trim().match(/^cl4p1\.([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    const json = decodeURIComponent(Array.from(bin, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
    const o = JSON.parse(json);
    if (typeof o.u !== 'string' || typeof o.k !== 'string' || !/^https?:\/\//.test(o.u) || !o.k) return null;
    return { u: o.u.replace(/\/+$/, ''), k: o.k };
  } catch {
    return null;
  }
}

let vinculo: Cl4pVinculo | null = lerJson<Cl4pVinculo>(CHAVE);
let status: Omit<Cl4pStatus, 'vinculado' | 'servidor' | 'enviando'> = lerJson(CHAVE_STATUS) ?? { ultimoEnvio: null, erro: null };
let enviando = false;
const ouvintes = new Set<() => void>();
let pendente: { app: Cl4pApp; montar: () => unknown } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let ultimoHash: string | null = null;

function avisar() {
  gravarJson(CHAVE_STATUS, status);
  ouvintes.forEach((f) => f());
}

export function cl4pStatus(): Cl4pStatus {
  let servidor: string | null = null;
  try {
    servidor = vinculo ? new URL(vinculo.u).host : null;
  } catch {
    servidor = vinculo?.u ?? null;
  }
  return { vinculado: Boolean(vinculo), servidor, enviando, ...status };
}

export function cl4pOuvir(f: () => void): () => void {
  ouvintes.add(f);
  return () => void ouvintes.delete(f);
}

/** Aplica um código de vínculo. Retorna false se o código for inválido. */
export function cl4pVincular(codigo: string): boolean {
  const v = decodificarCodigo(codigo);
  if (!v) return false;
  vinculo = v;
  gravarJson(CHAVE, v);
  ultimoHash = null;
  status = { ...status, erro: null };
  avisar();
  if (pendente) agendar(0);
  return true;
}

export function cl4pDesvincular() {
  vinculo = null;
  gravarJson(CHAVE, null);
  status = { ultimoEnvio: null, erro: null };
  avisar();
}

/** Lê ?cl4p=<código> da URL atual, vincula e limpa a barra de endereço. */
export function cl4pCapturarDaUrl(): boolean {
  try {
    const u = new URL(window.location.href);
    const cod = u.searchParams.get('cl4p');
    if (!cod) return false;
    u.searchParams.delete('cl4p');
    history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    return cl4pVincular(cod);
  } catch {
    return false;
  }
}

/** Para deep links nativos: esquema://cl4p?code=<código>. Retorna true se a URL era de vínculo. */
export function cl4pCapturarDeepLink(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.hostname !== 'cl4p' && !u.pathname.replace(/^\/+/, '').startsWith('cl4p')) return false;
    const cod = u.searchParams.get('code');
    return cod ? cl4pVincular(cod) : true;
  } catch {
    return false;
  }
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${h}`;
}

function agendar(ms = ESPERA_MS) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void enviarAgora(), ms);
}

/**
 * Agenda o envio do resumo. `montar` é chamado só na hora do envio (pode ser caro).
 * Chame sempre que os dados mudarem; envios repetidos com o mesmo conteúdo são ignorados.
 */
export function cl4pPublicar(app: Cl4pApp, montar: () => unknown) {
  pendente = { app, montar };
  if (vinculo) agendar();
}

/** Força um envio imediato (botão "Enviar agora"). */
export async function cl4pEnviarAgora(): Promise<Cl4pStatus> {
  ultimoHash = null;
  await enviarAgora();
  return cl4pStatus();
}

async function enviarAgora() {
  timer = null;
  if (!vinculo || !pendente || enviando) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  let corpo: string;
  try {
    const data = pendente.montar();
    const dataJson = JSON.stringify(data);
    const h = hash(dataJson);
    if (h === ultimoHash) return;
    corpo = `{"app":${JSON.stringify(pendente.app)},"schema":1,"generatedAt":${JSON.stringify(new Date().toISOString())},"data":${dataJson}}`;
    ultimoHash = h;
  } catch (e) {
    status = { ...status, erro: `Falha ao montar o resumo: ${(e as Error).message}` };
    avisar();
    return;
  }
  enviando = true;
  avisar();
  try {
    const r = await fetch(`${vinculo.u}/api/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vinculo.k}` },
      body: corpo,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
    status = { ultimoEnvio: new Date().toISOString(), erro: null };
  } catch (e) {
    ultimoHash = null;
    status = { ...status, erro: (e as Error).message === 'Failed to fetch' ? 'Sem conexão com o CL4P-RZ.' : (e as Error).message };
  } finally {
    enviando = false;
    avisar();
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (vinculo && pendente) agendar(1000);
  });
}
