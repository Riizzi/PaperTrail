import { extractText } from 'unpdf';
import { requireUser, generate, aiErrorMessage, GEMINI_MODEL, Type, isOwnPath, downloadAttachment } from './_lib/server.js';

export default async function handler(req: any, res: any) {
  const uid = await requireUser(req, res, { countQuota: true });
  if (!uid) return;

  try {
    const { mode, url, storagePath, text } = req.body || {};

    let contents: any[] = [];
    const instructions = `Você é um bibliotecário acadêmico especialista em catalogação documental e normas ABNT.
Extraia os metadados bibliográficos completos da fonte fornecida.
Não invente dados. Se não constar, retorne string vazia.
Tipos de documento válidos: article, book, chapter, thesis, conference, webpage.`;

    if (mode === 'pdf' && storagePath) {
      if (!isOwnPath(uid, storagePath)) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Acesso negado ao arquivo.' }));
        return;
      }
      const pdfBuffer = await downloadAttachment(storagePath);

      // Mais rápido: lê o texto das primeiras páginas (capa, resumo, dados da publicação)
      let firstPages = '';
      try {
        const pdf = await extractText(new Uint8Array(pdfBuffer));
        const pages = Array.isArray(pdf.text) ? pdf.text : [String(pdf.text || '')];
        firstPages = pages.slice(0, 3).join('\n\n').trim().slice(0, 20000);
      } catch (e) {
        console.warn('unpdf (metadados) falhou:', e);
      }

      if (firstPages.length >= 300) {
        contents = [{ text: `${instructions}\n\nTexto das primeiras páginas do PDF:\n${firstPages}` }];
      } else {
      // PDF escaneado: envia o arquivo para o Gemini ler
      const pdfBase64 = pdfBuffer.toString('base64');
      contents = [
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: pdfBase64,
          },
        },
        { text: instructions },
      ];
      }
    } else if (mode === 'url' && url) {
      if (!/^https?:\/\//i.test(String(url)) || /^https?:\/\/(localhost|127\.|10\.|192\.168\.|169\.254\.|\[?::1)/i.test(String(url))) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'URL inválida.' }));
        return;
      }
      let pageText = '';
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const fetchRes = await fetch(url, {
          headers: { 'Accept': 'text/html,application/xhtml+xml' },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const html = await fetchRes.text();
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const metaTags: string[] = [];
        const metaRegex = /<meta[^>]+(?:name|property)=["']([^"']+)["'][^>]+content=["']([^"']+)["']/gi;
        let m;
        while ((m = metaRegex.exec(html)) !== null) {
          metaTags.push(`${m[1]}: ${m[2]}`);
        }
        pageText = `Título da página: ${titleMatch ? titleMatch[1] : ''}\nMeta tags:\n${metaTags.slice(0, 30).join('\n')}\nConteúdo:\n${html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '').replace(/<[^>]+>/g, ' ').slice(0, 5000)}`;
      } catch (e: any) {
        pageText = `URL: ${url} (Não foi possível baixar o HTML diretamente: ${e.message})`;
      }

      contents = [
        {
          text: `${instructions}\n\nURL da página: ${url}\n\nConteúdo extraído:\n${pageText}`,
        },
      ];
    } else if (text) {
      contents = [
        {
          text: `${instructions}\n\nTexto fornecido:\n${text}`,
        },
      ];
    } else {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Nenhum conteúdo fornecido para extração.' }));
      return;
    }

    const metadataSchema = {
      type: Type.OBJECT,
      properties: {
        type: {
          type: Type.STRING,
          enum: ['article', 'book', 'chapter', 'thesis', 'conference', 'webpage'],
          description: 'Tipo de documento bibliográfico',
        },
        title: { type: Type.STRING, description: 'Título principal sem subtítulo' },
        subtitle: { type: Type.STRING, description: 'Subtítulo da obra, se houver' },
        authors: { type: Type.STRING, description: 'Nomes completos dos autores, na ordem em que aparecem, separados por ponto e vírgula (ex.: João Pedro da Silva; Maria Clara Santos)' },
        year: { type: Type.STRING, description: 'Ano de publicação com 4 dígitos' },
        publication: { type: Type.STRING, description: 'Nome do periódico ou evento' },
        publisher: { type: Type.STRING, description: 'Editora' },
        place: { type: Type.STRING, description: 'Local ou cidade de publicação' },
        volume: { type: Type.STRING, description: 'Volume' },
        number: { type: Type.STRING, description: 'Número ou fascículo' },
        pages: { type: Type.STRING, description: 'Faixa de páginas' },
        edition: { type: Type.STRING, description: 'Edição' },
        doi: { type: Type.STRING, description: 'DOI' },
        isbn: { type: Type.STRING, description: 'ISBN' },
        institution: { type: Type.STRING, description: 'Instituição (para teses)' },
        degree: { type: Type.STRING, description: 'Grau acadêmico' },
        bookTitle: { type: Type.STRING, description: 'Título do livro coletivo' },
        bookOrganizer: { type: Type.STRING, description: 'Organizador' },
        url: { type: Type.STRING, description: 'URL' },
        abstract: { type: Type.STRING, description: 'Resumo original ou abstract se disponível no texto' },
      },
      required: ['type', 'title'],
    };

    const response = await generate({
      model: GEMINI_MODEL,
      contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: metadataSchema,
      },
    });

    const raw = response.text?.trim() || '{}';
    const data = JSON.parse(raw);

    if (url && !data.url) {
      data.url = url;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  } catch (err: any) {
    console.error('Error in /api/extract-metadata:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: aiErrorMessage(err, 'Erro ao extrair metadados.') }));
  }
}
