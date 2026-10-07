import { requireUser, sendJson, generate, aiErrorMessage, GEMINI_MODEL, Type, isOwnPath, downloadAttachment } from './_lib/server.js';
import { findDoi, crossrefLookup, metaFromHtml, readPdf, mergeMeta, type Meta } from './_lib/metadata.js';

/**
 * Metadados de PDF ou URL.
 * Ordem: DOI -> CrossRef, metatags acadêmicas, leitura direta do PDF. A IA só entra
 * quando esses caminhos não acham o título, e se ela falhar o app devolve o que
 * conseguiu para a pessoa completar na revisão (nunca trava o cadastro).
 */

const INSTRUCTIONS = `Você é um bibliotecário acadêmico especialista em catalogação e normas ABNT.
Extraia os metadados bibliográficos da fonte fornecida.
Não invente dados. Se algo não constar, retorne string vazia.`;

const metadataSchema = {
  type: Type.OBJECT,
  properties: {
    type: { type: Type.STRING, enum: ['article', 'book', 'chapter', 'thesis', 'conference', 'webpage'] },
    title: { type: Type.STRING, description: 'Título principal sem subtítulo' },
    subtitle: { type: Type.STRING },
    authors: { type: Type.STRING, description: 'Nomes completos dos autores separados por ponto e vírgula (ex.: João Pedro da Silva; Maria Clara Santos)' },
    year: { type: Type.STRING, description: 'Ano com 4 dígitos' },
    publication: { type: Type.STRING, description: 'Periódico ou evento' },
    publisher: { type: Type.STRING },
    place: { type: Type.STRING, description: 'Cidade de publicação' },
    volume: { type: Type.STRING },
    number: { type: Type.STRING },
    pages: { type: Type.STRING, description: 'Faixa de páginas' },
    edition: { type: Type.STRING },
    doi: { type: Type.STRING },
    isbn: { type: Type.STRING },
    institution: { type: Type.STRING, description: 'Instituição (teses)' },
    degree: { type: Type.STRING, description: 'Grau acadêmico (teses)' },
    bookTitle: { type: Type.STRING },
    bookOrganizer: { type: Type.STRING },
    abstract: { type: Type.STRING, description: 'Resumo original, se constar' },
  },
  required: ['type', 'title'],
};

async function askAi(contents: any[]): Promise<Meta> {
  // Prazo curto: se a IA demorar, o app segue com a leitura direta
  const response = await generate(
    {
      model: GEMINI_MODEL,
      contents,
      config: { responseMimeType: 'application/json', responseSchema: metadataSchema },
    },
    undefined,
    { deadlineMs: 20_000 }
  );
  return JSON.parse(response.text?.trim() || '{}');
}

function isPrivateUrl(url: string): boolean {
  return !/^https?:\/\//i.test(url) || /^https?:\/\/(localhost|127\.|10\.|192\.168\.|169\.254\.|\[?::1)/i.test(url);
}

export default async function handler(req: any, res: any) {
  const uid = await requireUser(req, res);
  if (!uid) return;

  const { mode, url, storagePath } = req.body || {};

  try {
    if (mode === 'pdf') {
      if (!isOwnPath(uid, storagePath)) return sendJson(res, 403, { error: 'Acesso negado ao arquivo.' });

      const buffer = await downloadAttachment(storagePath);
      const { firstPagesText, guess } = await readPdf(buffer).catch(() => ({ firstPagesText: '', guess: {} as Meta }));

      // 1. DOI no texto -> CrossRef
      const doi = findDoi(firstPagesText);
      if (doi) {
        const cr = await crossrefLookup(doi);
        if (cr?.title) {
          return sendJson(res, 200, { ...mergeMeta(cr, { abstract: guess.abstract }), source: 'doi' });
        }
      }

      // 2. Leitura direta achou o título: não precisa de IA
      if (guess.title) {
        return sendJson(res, 200, {
          ...guess,
          doi: doi || '',
          source: 'pdf',
          notice: 'Dados lidos direto do PDF. Confira autores, periódico e páginas antes de salvar.',
        });
      }

      // 3. IA com o texto das primeiras páginas (ou o PDF, se for escaneado), com prazo curto
      try {
        const contents =
          firstPagesText.length >= 300
            ? [{ text: `${INSTRUCTIONS}\n\nTexto das primeiras páginas do PDF:\n${firstPagesText}` }]
            : [{ inlineData: { mimeType: 'application/pdf', data: buffer.toString('base64') } }, { text: INSTRUCTIONS }];
        const ai = await askAi(contents);
        return sendJson(res, 200, { ...mergeMeta(ai, { ...guess, doi: doi || '' }), source: 'ai' });
      } catch (aiErr) {
        console.warn('IA indisponível para metadados, usando leitura direta:', (aiErr as Error)?.message);
      }

      // 4. Sem IA: devolve o que foi lido para completar na revisão
      return sendJson(res, 200, {
        ...guess,
        doi: doi || '',
        source: 'pdf',
        notice: 'Dados lidos direto do PDF. Confira e complete os campos.',
      });
    }

    if (mode === 'url') {
      const target = String(url || '').trim();
      if (isPrivateUrl(target)) return sendJson(res, 400, { error: 'URL inválida.' });

      // DOI na própria URL
      const doiInUrl = findDoi(decodeURIComponent(target));
      if (doiInUrl) {
        const cr = await crossrefLookup(doiInUrl);
        if (cr?.title) return sendJson(res, 200, { ...cr, source: 'doi' });
      }

      let html = '';
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const r = await fetch(target, {
          headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'Mozilla/5.0 (compatible; PaperTrail/1.0)' },
          signal: controller.signal,
        });
        clearTimeout(timer);
        html = await r.text();
      } catch {
        // página não acessível
      }

      const tags = html ? metaFromHtml(html, target) : ({ url: target, type: 'webpage' } as Meta);

      // DOI nas metatags -> CrossRef
      if (tags.doi) {
        const cr = await crossrefLookup(tags.doi);
        if (cr?.title) return sendJson(res, 200, { ...mergeMeta(cr, { abstract: tags.abstract }), url: target, source: 'doi' });
      }

      // Página acadêmica com metatags completas: não precisa de IA
      const { hasCitationTags, ...tagMeta } = tags;
      if (hasCitationTags) return sendJson(res, 200, { ...tagMeta, source: 'tags' });

      // IA como reforço
      if (html) {
        try {
          const bodyText = html
            .replace(/<script\b[\s\S]*?<\/script>/gi, '')
            .replace(/<style\b[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .slice(0, 6000);
          const ai = await askAi([{ text: `${INSTRUCTIONS}\n\nURL: ${target}\nTítulo da página: ${tagMeta.title}\nConteúdo:\n${bodyText}` }]);
          return sendJson(res, 200, { ...mergeMeta(ai, tagMeta), url: target, source: 'ai' });
        } catch (aiErr) {
          console.warn('IA indisponível para metadados da URL:', (aiErr as Error)?.message);
        }
      }

      return sendJson(res, 200, {
        ...tagMeta,
        source: 'tags',
        notice: html ? 'Dados lidos direto da página. Confira e complete os campos.' : 'Não foi possível abrir a página. Preencha os dados manualmente.',
      });
    }

    return sendJson(res, 400, { error: 'Nenhum conteúdo fornecido para extração.' });
  } catch (err: any) {
    console.error('Error in /api/extract-metadata:', err);
    return sendJson(res, 500, { error: aiErrorMessage(err, 'Erro ao extrair metadados.') });
  }
}
