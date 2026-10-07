import { requireUser, sendJson, isOwnPath, downloadAttachment, generate, aiErrorMessage, GEMINI_MODEL } from './_lib/server.js';
import { extractText } from 'unpdf';
import mammoth from 'mammoth';

// Limite de texto devolvido (respostas da Vercel têm teto de ~4,5 MB)
const MAX_RETURN_CHARS = 1_500_000;

export default async function handler(req: any, res: any) {
  const uid = await requireUser(req, res);
  if (!uid) return;

  const { storagePath } = req.body || {};
  if (!isOwnPath(uid, storagePath)) {
    return sendJson(res, 403, { error: 'Acesso negado ao arquivo especificado.' });
  }

  try {
    const fileBuffer = await downloadAttachment(storagePath);
    const lowerPath = storagePath.toLowerCase();

    let extractedText = '';
    let pageCount = 1;

    if (lowerPath.endsWith('.pdf')) {
      try {
        const pdfData = await extractText(new Uint8Array(fileBuffer));
        extractedText = (Array.isArray(pdfData.text) ? pdfData.text.join('\n\n') : String(pdfData.text || '')).trim();
        pageCount = pdfData.totalPages || 1;
      } catch (pdfErr) {
        console.warn('unpdf failed, will attempt fallback:', pdfErr);
      }

      // If PDF has no text layer (scanned PDF), transcribe using Gemini
      if (!extractedText || extractedText.length < 50) {
        try {
          const response = await generate({
            model: GEMINI_MODEL,
            contents: [
              {
                inlineData: {
                  mimeType: 'application/pdf',
                  data: fileBuffer.toString('base64'),
                },
              },
              {
                text: 'Transcreva todo o texto legível deste documento acadêmico escaneado mantendo a ordem das seções.',
              },
            ],
          });
          extractedText = response.text?.trim() || '';
        } catch (ocrErr) {
          console.error('OCR transcription failed:', ocrErr);
        }
      }
    } else if (lowerPath.endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      extractedText = result.value.trim();
      // Estimate page count for docx (approx 500 words per page)
      const wordCountApprox = extractedText.split(/\s+/).filter(Boolean).length;
      pageCount = Math.max(1, Math.round(wordCountApprox / 500));
    } else {
      // Plain text or other format
      extractedText = fileBuffer.toString('utf-8').trim();
      const wordCountApprox = extractedText.split(/\s+/).filter(Boolean).length;
      pageCount = Math.max(1, Math.round(wordCountApprox / 500));
    }

    const words = extractedText.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const charCount = extractedText.length;

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: true,
        text: extractedText.slice(0, MAX_RETURN_CHARS),
        truncated: extractedText.length > MAX_RETURN_CHARS,
        pageCount,
        wordCount,
        charCount,
      })
    );
  } catch (err: any) {
    console.error('Error in /api/extract-text:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: aiErrorMessage(err, 'Erro ao extrair texto do anexo.') }));
  }
}
