import { requireUser, generate, aiErrorMessage, GEMINI_MODEL, Type } from './_lib/server.js';

export default async function handler(req: any, res: any) {
  const uid = await requireUser(req, res, { countQuota: true });
  if (!uid) return;

  try {
    const { title, summary, keywords } = req.body || {};

    const prompt = `A partir da seguinte obra acadêmica:
Título: ${title || ''}
Resumo: ${summary || ''}
Palavras-chave: ${(keywords || []).join(', ')}

Gere de 3 a 5 termos de busca acadêmica de alta precisão (em inglês e português) para localizar artigos correlatos no OpenAlex.
Evite termos genéricos como "artigo", "pesquisa" ou "estudo". Use termos temáticos e conceituais específicos.`;

    const searchTermsSchema = {
      type: Type.OBJECT,
      properties: {
        searchTerms: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Lista de 3 a 5 termos de busca acadêmica em português e inglês.',
        },
      },
      required: ['searchTerms'],
    };

    const response = await generate({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: searchTermsSchema,
      },
    });

    const rawText = response.text?.trim() || '{}';
    const data = JSON.parse(rawText);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  } catch (err: any) {
    console.error('Error in /api/search-terms:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: aiErrorMessage(err, 'Erro ao gerar termos de busca') }));
  }
}
