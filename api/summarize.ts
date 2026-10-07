import { requireUser, generate, aiErrorMessage, GEMINI_MODEL, Type } from './_lib/server.js';

const MAX_CHARS = 200_000; // ~50 mil tokens: cobre artigos inteiros e mantém a resposta rápida

export default async function handler(req: any, res: any) {
  const uid = await requireUser(req, res, { countQuota: true });
  if (!uid) return;

  try {
    const { fulltext, abstract, title, subtitle, authors, year } = req.body || {};

    let sourceText: string = typeof fulltext === 'string' ? fulltext : '';
    let summarySource: 'fulltext' | 'abstract' = 'fulltext';

    if (sourceText && sourceText.trim().length > 100) {
      summarySource = 'fulltext';
    } else if (abstract && abstract.trim().length > 20) {
      sourceText = abstract.trim();
      summarySource = 'abstract';
    } else {
      // Neither fulltext nor abstract available
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Anexe o texto para gerar o resumo' }));
      return;
    }

    // Limit long full text to ~500,000 characters
    const truncatedText = sourceText.slice(0, MAX_CHARS);

    const prompt = `Você é um analista acadêmico rigoroso.
Analise o conteúdo documental abaixo e elabore a síntese em português do Brasil:

Obra: ${title || ''} ${subtitle ? ': ' + subtitle : ''}
Autores: ${authors || ''}
Ano: ${year || ''}
Origem do texto de entrada: ${summarySource === 'fulltext' ? 'Texto integral da obra anexada' : 'Resumo original (abstract)'}

Conteúdo a sintetizar:
${truncatedText}

Diretrizes estritas:
1. "summary": Um parágrafo analítico coeso com exatamente entre 5 e 8 linhas de extensão, detalhando o problema de pesquisa, metodologia e conclusões comprovadas, fundamentando-se EXCLUSIVAMENTE nas informações contidas no texto acima (sem suposições externas).
2. "keyPoints": Lista de 3 a 5 pontos-chave essenciais.
3. "keywords": Lista de 3 a 6 palavras-chave representativas.`;

    const summarySchema = {
      type: Type.OBJECT,
      properties: {
        summary: {
          type: Type.STRING,
          description: 'Resumo com 5 a 8 linhas de extensão baseado unicamente no texto fornecido.',
        },
        keyPoints: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'De 3 a 5 pontos-chave essenciais.',
        },
        keywords: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'De 3 a 6 palavras-chave conceituais.',
        },
      },
      required: ['summary', 'keyPoints', 'keywords'],
    };

    const response = await generate({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: summarySchema,
      },
    });

    const rawText = response.text?.trim() || '{}';
    const data = JSON.parse(rawText);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        ...data,
        summarySource,
      })
    );
  } catch (err: any) {
    console.error('Error in /api/summarize:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: aiErrorMessage(err, 'Erro ao gerar resumo acadêmico') }));
  }
}
