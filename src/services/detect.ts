/**
 * Descobre o que o usuário colou: DOI, ISBN, arXiv ou link.
 * Usado no campo único do "Adicionar" e ao colar/arrastar na tela.
 */

export type DetectedInput =
  | { method: 'doi'; value: string }
  | { method: 'isbn'; value: string }
  | { method: 'url'; value: string };

const DOI_RE = /\b(10\.\d{4,9}\/[^\s"'<>]+)/i;

function cleanDoi(raw: string): string {
  return decodeURIComponent(raw).replace(/[.,;:)\]}]+$/, '');
}

export function isValidIsbn(raw: string): boolean {
  const s = raw.replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{9}[\dX]$/.test(s)) {
    const sum = s.split('').reduce((acc, ch, i) => acc + (ch === 'X' ? 10 : Number(ch)) * (10 - i), 0);
    return sum % 11 === 0;
  }
  if (/^97[89]\d{10}$/.test(s)) {
    const sum = s.split('').reduce((acc, ch, i) => acc + Number(ch) * (i % 2 ? 3 : 1), 0);
    return sum % 10 === 0;
  }
  return false;
}

export function detectInput(text: string): DetectedInput | null {
  const t = text.trim();
  if (!t || t.length > 2000) return null;

  // arXiv: link ou identificador (2101.00001, arXiv:2101.00001v2)
  const arxivUrl = t.match(/arxiv\.org\/(?:abs|pdf)\/([\w.\/-]+?)(?:\.pdf)?(?:[?#].*)?$/i);
  if (arxivUrl) return { method: 'url', value: `https://arxiv.org/abs/${arxivUrl[1]}` };
  const arxivId = t.match(/^(?:arxiv:\s*)?(\d{4}\.\d{4,5}(?:v\d+)?)$/i);
  if (arxivId) return { method: 'url', value: `https://arxiv.org/abs/${arxivId[1]}` };

  const isUrl = /^(https?:\/\/|www\.)\S+$/i.test(t);
  if (isUrl) {
    const url = t.startsWith('www.') ? `https://${t}` : t;
    // Link do doi.org vira busca direta por DOI
    if (/^https?:\/\/(dx\.)?doi\.org\//i.test(url)) {
      const doi = url.match(DOI_RE);
      if (doi) return { method: 'doi', value: cleanDoi(doi[1]) };
    }
    return { method: 'url', value: url };
  }

  // DOI solto no texto ("doi:10.1000/xyz", "DOI 10.1000/xyz")
  const doi = t.match(DOI_RE);
  if (doi) return { method: 'doi', value: cleanDoi(doi[1]) };

  // ISBN (com ou sem hífens, com ou sem o prefixo "ISBN")
  const isbn = t.replace(/^isbn(?:-1[03])?:?\s*/i, '');
  if (isValidIsbn(isbn)) return { method: 'isbn', value: isbn.replace(/[\s-]/g, '') };

  return null;
}

export const PDF_FILE_RE = /\.pdf$/i;
