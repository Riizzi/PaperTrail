import {
  requireUser,
  sendJson,
  generate,
  aiErrorMessage,
  GEMINI_MODEL,
  Type,
  isOwnPath,
  downloadAttachment,
  putAttachment,
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
  pageText,
  isAggregatorPublisher,
  type Meta,
} from './_lib/metadata.js';
import { isScieloUrl, scieloPid, scieloArticle, scieloJournal } from './_lib/scielo.js';

/**
 * Metadados de PDF ou URL, com o objetivo de vir TUDO preenchido.
 *
 * 1. Bases sem IA, juntas campo a campo: CrossRef (DOI), API do SciELO e metatags da página.
 *    Se já trouxerem título, autores e ano, é a resposta (e não gasta cota de IA).
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
- abstract: o resumo original da obra, se houver, sem o rótulo "Resumo"/"Abstract" no início.
- title: no idioma original da obra (não a tradução da página). Se houver subtítulo depois de ":", ponha-o em subtitle.
- Nomes de pessoas com maiúsculas normais ("Paula, Ana Paula Paes de"), mesmo que a fonte esteja em CAIXA ALTA.
- Páginas: em revistas com paginação eletrônica, use o identificador do artigo (ex.: e2025-0154).
- Ignore menus, listas de outros artigos e referências bibliográficas da página: descreva só a obra principal.
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
  if (isAggregatorPublisher(out.publisher)) delete out.publisher;
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

/**
 * Junta as fontes campo a campo. Ordem de confiança: CrossRef > SciELO > revista > metatags da página.
 * Editora e cidade vêm do SciELO/página, porque no CrossRef a "editora" do SciELO é a FapUNIFESP.
 */
function combine(src: { cr?: Meta | null; am?: Meta | null; journal?: Meta | null; tags?: Meta | null }, url: string): Meta {
  const cr = clean(src.cr || {});
  const am = clean(src.am || {});
  const journal = clean(src.journal || {});
  const tags = clean(src.tags || {});
  const out = mergeMeta(cr, mergeMeta(am, mergeMeta(journal, tags)));
  const pick = (...vals: Array<string | undefined>) => vals.find((v) => v) || '';
  out.publisher = pick(am.publisher, journal.publisher, tags.publisher, cr.publisher);
  out.place = pick(am.place, journal.place, cr.place, tags.place);
  out.publication = pick(cr.publication, am.publication, journal.publication, tags.publication);
  out.abstract = pick(am.abstract, cr.abstract, tags.abstract);
  out.url = url;
  return clean(out);
}

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** Metadados de um link. `savePdf` guarda o PDF quando o link aponta direto para um arquivo. */
export async function analyzeUrl(
  target: string,
  trace: Trace,
  savePdf?: (bytes: Buffer, finalUrl: string) => Promise<Meta | undefined>
): Promise<Meta> {
  const scielo = isScieloUrl(target);
  const pid = scielo ? scieloPid(target) : null;
  const pdfLink = /[?&](format=pdf|script=sci_pdf)\b|\.pdf($|\?)/i.test(target);

  // SciELO no formato antigo (?pid=): a API do SciELO responde mesmo quando o site recusa o acesso
  let am: Meta | null = null;
  if (pid) {
    am = await scieloArticle(pid, new URL(target).hostname);
    trace.push(`SciELO ${pid}: ${am ? 'dados pela API do SciELO' : 'não encontrado na API do SciELO'}`);
  }

  let doi = findDoi(safeDecode(target)) || am?.doi || '';
  let cr = doi ? await crossrefLookup(doi) : null;
  if (doi) trace.push(`DOI ${doi}: ${cr ? 'CrossRef ok' : 'não encontrado no CrossRef'}`);

  if (!pdfLink && (cr || am)) {
    const known = combine({ cr, am }, target);
    if (isComplete(known)) return { ...known, source: cr ? 'doi' : 'scielo' };
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
    const { source, notice, ...fromPdf } = await analyzePdf(page.bytes, trace);
    const journal = scielo && !am && fromPdf.issn ? await scieloJournal(fromPdf.issn) : null;
    if (journal) trace.push('SciELO: editora e cidade pela revista');
    const meta = am || journal ? { ...combine({ am, journal, tags: fromPdf }, target), source } : { ...fromPdf, source, notice };
    const attachment = savePdf ? await savePdf(page.bytes, page.finalUrl) : undefined;
    return { ...meta, url: target, attachment };
  }

  const html = page ? page.bytes.toString('utf-8') : '';
  const blocked = !page || isBotChallenge(page.status, html) || page.status >= 400;
  if (blocked && page) trace.push('Site recusou a leitura automática');
  const tags: Meta = !blocked ? metaFromHtml(html, target) : { url: target, type: 'webpage' };
  const { hasCitationTags, issn, ...tagMeta } = tags;

  // DOI nas metatags -> CrossRef
  if (!cr && tagMeta.doi && tagMeta.doi !== doi) {
    doi = tagMeta.doi;
    cr = await crossrefLookup(doi);
    trace.push(`DOI ${doi} (na página): ${cr ? 'CrossRef ok' : 'não encontrado no CrossRef'}`);
  }
  // SciELO no formato novo: editora e cidade pela revista (ISSN)
  const journalIssn = [issn, cr?.issn].filter((v) => typeof v === 'string' && v).join(',');
  const journal = scielo && !am && journalIssn ? await scieloJournal(journalIssn) : null;
  if (journal) trace.push('SciELO: editora e cidade pela revista');

  const trusted = Boolean(cr || am || hasCitationTags);
  const known = combine({ cr, am, journal, tags: tagMeta }, target);
  if (trusted && isComplete(known)) return { ...known, source: cr ? 'doi' : am ? 'scielo' : 'tags' };

  // Falta algo: a IA lê o texto da página, a API do WordPress ou a URL pelo Google
  const wp = blocked ? await wordpressLookup(target) : null;
  if (blocked) trace.push(wp ? 'WordPress: post encontrado' : 'WordPress: indisponível');
  const { contentText: wpText, ...wpMeta } = wp || ({} as Meta);
  const hints = clean(mergeMeta(known, wpMeta));

  try {
    let ai: Meta;
    if (!blocked && html) {
      ai = await aiFromText(`Página ${target}`, pageText(html), hints, trace);
    } else if (wpText) {
      ai = await aiFromText(`Post ${target} (título: ${wpMeta.title || ''})`, stripTags(wpText), hints, trace);
    } else {
      ai = await aiFromUrl(target, hints, trace);
    }
    const aiClean = clean(ai);
    // O que veio de base confiável vale mais; a IA completa o resto
    const merged = trusted ? mergeMeta(known, aiClean) : mergeMeta(aiClean, hints);
    return { ...merged, url: target, source: 'ai', notice: missingNotice(merged) };
  } catch (err) {
    console.warn('IA indisponível (URL):', (err as Error)?.message);
    return {
      ...hints,
      type: hints.type || 'webpage',
      url: target,
      source: 'tags',
      notice: blocked
        ? `O site recusou a leitura e a IA não respondeu (${aiErrorMessage(err, 'erro')}). Preencha na revisão.`
        : `A IA não respondeu agora (${aiErrorMessage(err, 'erro')}). Confira e complete os campos.`,
    };
  }
}

export default async function handler(req: any, res: any) {
  const uid = await requireUser(req, res, { countQuota: true });
  if (!uid) return;

  const { mode, url, storagePath, itemId } = req.body || {};
  const trace: Trace = [];
  // Toda resposta leva o registro das etapas (mostrado na revisão)
  // issn é só de uso interno
  const reply = (status: number, { issn: _issn, ...data }: Meta) => sendJson(res, status, { ...data, trace });

  try {
    if (mode === 'pdf') {
      if (!isOwnPath(uid, storagePath)) return sendJson(res, 403, { error: 'Acesso negado ao arquivo.' });
      const buffer = await downloadAttachment(storagePath);
      return reply(200, await analyzePdf(buffer, trace));
    }

    if (mode !== 'url') return sendJson(res, 400, { error: 'Nenhum conteúdo fornecido para extração.' });

    const target = cleanUrl(String(url || '').trim());
    if (isPrivateUrl(target)) return sendJson(res, 400, { error: 'URL inválida.' });

    const meta = await analyzeUrl(target, trace, async (bytes, finalUrl) => {
      if (typeof itemId !== 'string' || !/^[\w-]{1,128}$/.test(itemId) || bytes.length > 20 * 1024 * 1024) return undefined;
      try {
        const rawName = decodeURIComponent(new URL(finalUrl).pathname.split('/').filter(Boolean).pop() || 'documento.pdf');
        const safe = rawName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'documento';
        const path = `users/${uid}/items/${itemId}/${Date.now()}_${safe.toLowerCase().endsWith('.pdf') ? safe : safe + '.pdf'}`;
        await putAttachment(path, bytes, 'application/pdf');
        return { storagePath: path, name: rawName, size: bytes.length, mimeType: 'application/pdf' };
      } catch (e) {
        console.warn('Não foi possível guardar o PDF do link:', e);
        return undefined;
      }
    });
    return reply(200, meta);
  } catch (err: any) {
    console.error('Error in /api/extract-metadata:', err);
    return sendJson(res, 500, { error: aiErrorMessage(err, 'Erro ao extrair metadados.') });
  }
}
