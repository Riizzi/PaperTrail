import {
  requireUser,
  sendJson,
  generate,
  aiErrorMessage,
  GEMINI_MODEL,
  Type,
  isOwnPath,
  downloadAttachment,
  getSupabaseAdmin,
  ATTACHMENTS_BUCKET,
  type Trace,
} from './_lib/server.js';
import {
  findDoi,
  crossrefLookup,
  metaFromHtml,
  readPdf,
  mergeMeta,
  cleanUrl,
  isBotChallenge,
  wordpressLookup,
  stripTags,
  type Meta,
} from './_lib/metadata.js';

/**
 * Metadados de PDF ou URL, com o objetivo de vir TUDO preenchido.
 *
 * 1. DOI -> CrossRef: base oficial; se já trouxer título, autores e ano, é a resposta.
 * 2. Gemini lê o conteúdo (texto do PDF, texto da página ou a própria URL quando o site
 *    bloqueia robôs) e preenche todos os campos. O que foi lido sem IA vai junto como pista.
 * 3. Se a IA falhar, o app devolve o que conseguiu ler, com aviso para completar.
 */

const INSTRUCTIONS = `Você é um bibliotecário acadêmico especialista em catalogação e na norma ABNT NBR 6023:2018.
Extraia TODOS os metadados bibliográficos da fonte e preencha o máximo de campos possível.

Regras:
- authors: todos os autores na ordem, nomes completos, separados por ponto e vírgula. Se não houver autor pessoa (notícia, post institucional, relatório), use a instituição responsável (ex.: SciELO; Fundação Getulio Vargas).
- year: ano de publicação com 4 dígitos. Procure em datas de publicação, rodapés, cabeçalhos, "©", "recebido/aceito", URL.
- publication: periódico, evento, série (ex.: "Working Papers EBAPE") ou nome do site/blog.
- publisher: editora ou instituição que publica. place: cidade de publicação, se constar.
- type: article (periódico), book, chapter, thesis (tese, dissertação, TCC), conference (anais/evento), webpage (site, blog, notícia, working paper sem periódico também pode ser webpage).
- volume, number, pages, edition, isbn, doi, institution, degree quando existirem.
- abstract: o resumo original da obra, se houver.
- Não invente: deixe vazio só o que realmente não aparece na fonte.`;

const metadataSchema = {
  type: Type.OBJECT,
  properties: {
    type: { type: Type.STRING, enum: ['article', 'book', 'chapter', 'thesis', 'conference', 'webpage'] },
    title: { type: Type.STRING, description: 'Título principal sem subtítulo' },
    subtitle: { type: Type.STRING },
    authors: { type: Type.STRING, description: 'Autores separados por ponto e vírgula' },
    year: { type: Type.STRING },
    publication: { type: Type.STRING },
    publisher: { type: Type.STRING },
    place: { type: Type.STRING },
    volume: { type: Type.STRING },
    number: { type: Type.STRING },
    pages: { type: Type.STRING },
    edition: { type: Type.STRING },
    doi: { type: Type.STRING },
    isbn: { type: Type.STRING },
    institution: { type: Type.STRING },
    degree: { type: Type.STRING },
    bookTitle: { type: Type.STRING },
    bookOrganizer: { type: Type.STRING },
    abstract: { type: Type.STRING },
  },
  required: ['type', 'title', 'authors', 'year'],
};

const FIELD_LIST = Object.keys(metadataSchema.properties).join(', ');

function hintsText(hints: Meta): string {
  const lines = Object.entries(hints)
    .filter(([k, v]) => typeof v === 'string' && v && !['abstract', 'contentText', 'url'].includes(k))
    .map(([k, v]) => `- ${k}: ${v}`);
  return lines.length ? `\n\nPistas lidas automaticamente (podem estar incompletas ou erradas; confira na fonte):\n${lines.join('\n')}` : '';
}

/** IA lendo um texto que já temos */
async function aiFromText(sourceLabel: string, text: string, hints: Meta, trace: Trace): Promise<Meta> {
  const response = await generate(
    {
      model: GEMINI_MODEL,
      contents: [{ text: `${INSTRUCTIONS}${hintsText(hints)}\n\n${sourceLabel}:\n${text}` }],
      config: { responseMimeType: 'application/json', responseSchema: metadataSchema },
    },
    undefined,
    { deadlineMs: 80_000, trace }
  );
  return JSON.parse(response.text?.trim() || '{}');
}

/** IA lendo o PDF diretamente (escaneado, sem camada de texto) */
async function aiFromPdf(buffer: Buffer, hints: Meta, trace: Trace): Promise<Meta> {
  const response = await generate(
    {
      model: GEMINI_MODEL,
      contents: [
        { inlineData: { mimeType: 'application/pdf', data: buffer.toString('base64') } },
        { text: `${INSTRUCTIONS}${hintsText(hints)}` },
      ],
      config: { responseMimeType: 'application/json', responseSchema: metadataSchema },
    },
    undefined,
    { deadlineMs: 80_000, trace }
  );
  return JSON.parse(response.text?.trim() || '{}');
}

/** IA abrindo a URL pelos servidores do Google (para sites que bloqueiam o nosso acesso) */
async function aiFromUrl(url: string, hints: Meta, trace: Trace): Promise<Meta> {
  const response = await generate(
    {
      model: GEMINI_MODEL,
      contents: [
        {
          text: `${INSTRUCTIONS}${hintsText(hints)}\n\nAbra e leia esta página: ${url}\nSe não conseguir abrir, pesquise pelo endereço.\nResponda SOMENTE com um objeto JSON com os campos: ${FIELD_LIST}.`,
        },
      ],
      config: { tools: [{ urlContext: {} }, { googleSearch: {} }] },
    },
    undefined,
    { deadlineMs: 80_000, trace }
  );
  const raw = response.text || '';
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error('Resposta da IA sem dados.');
  return JSON.parse(json);
}

function clean(meta: Meta): Meta {
  const out: Meta = {};
  for (const [k, v] of Object.entries(meta || {})) {
    if (typeof v === 'string') {
      const t = v.trim();
      if (t && !/^(n\/?a|null|undefined|desconhecido|não (informado|consta))$/i.test(t)) out[k] = t;
    } else if (v !== undefined && v !== null) {
      out[k] = v;
    }
  }
  if (typeof out.authors === 'string') out.authors = out.authors.replace(/\s*,\s*e\s+|\s+e\s+(?=[A-ZÀ-Ý])/g, '; ');
  if (out.year) out.year = String(out.year).match(/\d{4}/)?.[0] || '';
  return out;
}

const isComplete = (m: Meta | null | undefined) => Boolean(m?.title && m?.authors && m?.year);

const missingNotice = (m: Meta) => {
  const missing = [!m.title && 'título', !m.authors && 'autores', !m.year && 'ano'].filter(Boolean);
  return missing.length ? `Não foi possível identificar: ${missing.join(', ')}. Complete na revisão.` : undefined;
};

/** PDF já baixado */
async function analyzePdf(buffer: Buffer, trace: Trace): Promise<Meta> {
  const { firstPagesText, guess } = await readPdf(buffer).catch(() => ({ firstPagesText: '', guess: {} as Meta }));

  trace.push(`PDF: ${firstPagesText.length} caracteres lidos${guess.title ? ', título encontrado' : ''}`);
  const doi = findDoi(firstPagesText);
  const cr = doi ? await crossrefLookup(doi) : null;
  if (doi) trace.push(`DOI ${doi}: ${cr ? (isComplete(cr) ? 'CrossRef completo' : 'CrossRef parcial') : 'não encontrado no CrossRef'}`);
  if (cr && isComplete(cr)) {
    return { ...mergeMeta(clean(cr), { abstract: guess.abstract }), source: 'doi' };
  }

  const hints = clean(mergeMeta(cr || {}, { ...guess, doi: doi || '' }));
  try {
    const ai = clean(
      firstPagesText.length >= 300
        ? await aiFromText('Texto das primeiras páginas do PDF', firstPagesText, hints, trace)
        : await aiFromPdf(buffer, hints, trace)
    );
    // Dados do CrossRef (quando houver) valem mais que a IA; a IA completa o resto
    const merged = cr ? mergeMeta(clean(cr), mergeMeta(ai, hints)) : mergeMeta(ai, hints);
    return { ...merged, source: 'ai', notice: missingNotice(merged) };
  } catch (err) {
    console.warn('IA indisponível (PDF):', (err as Error)?.message);
    return { ...hints, source: 'pdf', notice: `A IA não respondeu agora (${aiErrorMessage(err, 'erro')}). Confira e complete os campos.` };
  }
}

function isPrivateUrl(url: string): boolean {
  return !/^https?:\/\//i.test(url) || /^https?:\/\/(localhost|127\.|10\.|192\.168\.|169\.254\.|\[?::1)/i.test(url);
}

async function fetchTarget(target: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch(target, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'User-Agent': 'Mozilla/5.0 (compatible; PaperTrail/1.0; +https://github.com/Riizzi/PaperTrail)',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    const bytes = Buffer.from(await r.arrayBuffer());
    return { status: r.status, contentType: r.headers.get('content-type') || '', finalUrl: r.url || target, bytes };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req: any, res: any) {
  const uid = await requireUser(req, res, { countQuota: true });
  if (!uid) return;

  const { mode, url, storagePath, itemId } = req.body || {};
  const trace: Trace = [];
  // Toda resposta leva o registro das etapas (mostrado na revisão)
  const reply = (status: number, data: Meta) => sendJson(res, status, { ...data, trace });

  try {
    if (mode === 'pdf') {
      if (!isOwnPath(uid, storagePath)) return sendJson(res, 403, { error: 'Acesso negado ao arquivo.' });
      const buffer = await downloadAttachment(storagePath);
      return reply(200, await analyzePdf(buffer, trace));
    }

    if (mode !== 'url') return sendJson(res, 400, { error: 'Nenhum conteúdo fornecido para extração.' });

    const target = cleanUrl(String(url || '').trim());
    if (isPrivateUrl(target)) return sendJson(res, 400, { error: 'URL inválida.' });

    // DOI na própria URL
    const doiInUrl = findDoi(decodeURIComponent(target));
    if (doiInUrl) {
      const cr = await crossrefLookup(doiInUrl);
      trace.push(`DOI na URL: ${cr ? 'CrossRef ok' : 'não encontrado'}`);
      if (cr && isComplete(cr)) return reply(200, { ...clean(cr), url: target, source: 'doi' });
    }

    let page: Awaited<ReturnType<typeof fetchTarget>> | null = null;
    try {
      page = await fetchTarget(target);
      trace.push(`Página: HTTP ${page.status} ${page.contentType.split(';')[0]}`);
    } catch (e) {
      trace.push(`Página inacessível: ${(e as Error)?.message || 'erro'}`);
    }

    // Link direto para PDF: lê como PDF e guarda como anexo
    if (page && (/application\/pdf/i.test(page.contentType) || page.bytes.subarray(0, 5).toString() === '%PDF-')) {
      const meta = await analyzePdf(page.bytes, trace);
      let attachment: Meta | undefined;
      if (typeof itemId === 'string' && /^[\w-]{1,128}$/.test(itemId) && page.bytes.length <= 20 * 1024 * 1024) {
        try {
          const rawName = decodeURIComponent(new URL(page.finalUrl).pathname.split('/').pop() || 'documento.pdf');
          const safe = rawName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'documento';
          const path = `users/${uid}/items/${itemId}/${Date.now()}_${safe.toLowerCase().endsWith('.pdf') ? safe : safe + '.pdf'}`;
          const { error } = await getSupabaseAdmin().storage.from(ATTACHMENTS_BUCKET).upload(path, page.bytes, { contentType: 'application/pdf' });
          if (!error) attachment = { storagePath: path, name: rawName, size: page.bytes.length, mimeType: 'application/pdf' };
        } catch (e) {
          console.warn('Não foi possível guardar o PDF do link:', e);
        }
      }
      return reply(200, { ...meta, url: target, attachment });
    }

    const html = page ? page.bytes.toString('utf-8') : '';
    const blocked = !page || isBotChallenge(page.status, html) || page.status >= 400;
    if (blocked && page) trace.push('Site bloqueou a leitura automática');
    const tags: Meta = !blocked ? metaFromHtml(html, target) : { url: target, type: 'webpage' };
    const { hasCitationTags, ...tagMeta } = tags;

    // DOI nas metatags -> CrossRef
    if (tagMeta.doi) {
      const cr = await crossrefLookup(tagMeta.doi);
      if (cr && isComplete(cr)) {
        return reply(200, { ...mergeMeta(clean(cr), { abstract: tagMeta.abstract }), url: target, source: 'doi' });
      }
    }

    // Página de periódico com metatags completas
    if (hasCitationTags && isComplete(tagMeta)) return reply(200, { ...clean(tagMeta), source: 'tags' });

    // Conteúdo para a IA: texto da página, ou API do WordPress, ou a URL aberta pelo Google
    const wp = blocked ? await wordpressLookup(target) : null;
    if (blocked) trace.push(wp ? 'WordPress: post encontrado' : 'WordPress: indisponível');
    const { contentText: wpText, ...wpMeta } = wp || ({} as Meta);
    const hints = clean(mergeMeta(tagMeta, wpMeta));

    try {
      let ai: Meta;
      if (!blocked && html) {
        const bodyText = html
          .replace(/<script\b[\s\S]*?<\/script>/gi, '')
          .replace(/<style\b[\s\S]*?<\/style>/gi, '')
          .replace(/<(nav|footer|header|aside)\b[\s\S]*?<\/\1>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .slice(0, 15000);
        ai = await aiFromText(`Página ${target}`, bodyText, hints, trace);
      } else if (wpText) {
        ai = await aiFromText(`Post ${target} (título: ${wpMeta.title || ''})`, stripTags(wpText), hints, trace);
      } else {
        ai = await aiFromUrl(target, hints, trace);
      }
      const aiClean = clean(ai);
      const merged = hasCitationTags ? mergeMeta(clean(tagMeta), aiClean) : mergeMeta(aiClean, hints);
      return reply(200, { ...merged, url: target, source: 'ai', notice: missingNotice(merged) });
    } catch (err) {
      console.warn('IA indisponível (URL):', (err as Error)?.message);
      return reply(200, {
        ...hints,
        type: hints.type || 'webpage',
        url: target,
        source: 'tags',
        notice: blocked
          ? 'O site bloqueou a leitura e a IA não respondeu agora. Tente de novo em instantes ou preencha na revisão.'
          : `A IA não respondeu agora (${aiErrorMessage(err, 'erro')}). Confira e complete os campos.`,
      });
    }
  } catch (err: any) {
    console.error('Error in /api/extract-metadata:', err);
    return sendJson(res, 500, { error: aiErrorMessage(err, 'Erro ao extrair metadados.') });
  }
}
