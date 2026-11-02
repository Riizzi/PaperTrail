/**
 * fetch de JSON para APIs públicas (Crossref, OpenLibrary, Google Books, OpenAlex):
 * prazo por tentativa e uma nova tentativa em falha de rede, 429 ou 5xx.
 */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchJson<T = any>(
  url: string,
  opts: { timeoutMs?: number; retries?: number; headers?: Record<string, string> } = {}
): Promise<T> {
  const { timeoutMs = 10_000, retries = 1, headers } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: controller.signal });
      if (res.ok) return (await res.json()) as T;
      lastErr = new HttpError(res.status, `HTTP ${res.status}`);
      if (res.status !== 429 && res.status < 500) throw lastErr;
    } catch (err) {
      if (err instanceof HttpError && err.status !== 429 && err.status < 500) throw err;
      lastErr = controller.signal.aborted ? new HttpError(0, 'Tempo esgotado') : err;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await sleep(800 * (attempt + 1));
  }
  throw lastErr instanceof Error ? lastErr : new Error('Falha de conexão');
}

/** Tira tags (JATS/HTML) e entidades comuns de títulos e resumos */
export function stripMarkup(s?: string): string {
  if (!s) return '';
  return s
    .replace(/<jats:title>[^<]*<\/jats:title>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "2", "2nd ed.", "2ª edição" → "2. ed." (ABNT); primeira edição não se indica */
export function abntEdition(raw?: string | number): string | undefined {
  const n = Number(String(raw ?? '').match(/\d+/)?.[0]);
  return n >= 2 && n < 100 ? `${n}. ed` : undefined;
}
