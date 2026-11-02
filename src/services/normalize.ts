import type { ReferenceItem } from '../types';

/**
 * Acabamento dos metadados que chegam de qualquer fonte (CrossRef, SciELO, página, IA, ISBN)
 * antes da tela de revisão: nomes em CAIXA ALTA, subtítulo grudado no título, rótulo "Resumo".
 */

// Partículas que ficam em minúsculas no meio do nome (ABNT mantém "de", "da", "dos"...)
const PARTICLES = new Set(['da', 'das', 'de', 'del', 'della', 'der', 'di', 'do', 'dos', 'du', 'e', 'van', 'von', 'y', 'la', 'le']);
const ROMAN = /^(I{1,3}|IV|V|VI{0,3}|IX|X)$/;

const isAllCaps = (s: string) => {
  const letters = s.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '');
  return letters.length > 1 && letters === letters.toUpperCase();
};

function capWord(w: string, index: number): string {
  const lower = w.toLowerCase();
  if (index > 0 && PARTICLES.has(lower)) return lower;
  if (ROMAN.test(w) || /^[A-Z]\.?$/.test(w)) return w; // "II", iniciais "C."
  // Nomes compostos com hífen ou apóstrofo: "Jean-Paul", "D'Ávila"
  return lower.replace(/(^|[-'’])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** "CARVALHO, RICARDO C. DOS SANTOS E" -> "Carvalho, Ricardo C. dos Santos e" (só mexe no que está todo em maiúsculas) */
export function fixNameCase(name: string): string {
  // Sigla sozinha (IBGE, OECD) fica como está
  if (!isAllCaps(name) || !/[,\s]/.test(name.trim())) return name;
  return name
    .split(',')
    .map((part) =>
      part
        .trim()
        .split(/\s+/)
        .map((w, i) => capWord(w, i))
        .join(' ')
    )
    .join(', ');
}

export function fixAuthors(authors: string): string {
  return authors
    .split(';')
    .map((a) => fixNameCase(a.trim()))
    .filter(Boolean)
    .join('; ');
}

/** Título todo em maiúsculas vira frase normal, mantendo siglas com números (COVID-19) */
export function fixTitleCase(title: string): string {
  if (!isAllCaps(title) || title.length < 8) return title;
  const lower = title
    .split(/\s+/)
    .map((w) => (/\d/.test(w) && /[A-Z]/.test(w) ? w : w.toLowerCase()))
    .join(' ');
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** "Título: subtítulo" -> título e subtítulo separados (ABNT destaca só o título) */
export function splitSubtitle(title: string): { title: string; subtitle?: string } {
  const m = title.match(/^(.{3,}?)\s*:\s+(.{2,})$/);
  if (!m) return { title };
  // "Parte 1: ..." / "Vol. 2: ..." ou hora "10:30" não são subtítulo
  if (/\b(parte|part|vol\.?|volume|cap\.?|capítulo|chapter)\s*\d+$/i.test(m[1])) return { title };
  return { title: m[1].trim(), subtitle: m[2].trim() };
}

export function cleanAbstract(text: string): string {
  return text
    .replace(/^\s*(resumo|abstract|resumen|résumé|summary)\b\s*[:.\-–—]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeMetadata(meta: Partial<ReferenceItem>): Partial<ReferenceItem> {
  const out: Partial<ReferenceItem> = { ...meta };
  for (const key of ['authors', 'bookOrganizer'] as const) {
    const v = out[key];
    if (typeof v === 'string' && v) (out as any)[key] = fixAuthors(v);
  }
  if (typeof out.title === 'string' && out.title) {
    let title = fixTitleCase(out.title.replace(/\s+/g, ' ').trim()).replace(/\.$/, '');
    if (!out.subtitle) {
      const split = splitSubtitle(title);
      title = split.title;
      if (split.subtitle) out.subtitle = split.subtitle;
    }
    out.title = title;
  }
  if (typeof out.subtitle === 'string' && out.subtitle) out.subtitle = fixTitleCase(out.subtitle.trim()).replace(/\.$/, '');
  if (typeof out.abstract === 'string' && out.abstract) out.abstract = cleanAbstract(out.abstract);
  return out;
}
