import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Robust JSON extraction — strips markdown fences, finds JSON boundaries, cleans control chars
function extractJsonFromResponse(response: string): any {
  let cleaned = response
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  const jsonStart = cleaned.search(/[\{\[]/);
  if (jsonStart === -1) throw new Error('No JSON found in AI response');

  const firstChar = cleaned[jsonStart];
  const closeChar = firstChar === '{' ? '}' : ']';
  const jsonEnd = cleaned.lastIndexOf(closeChar);
  if (jsonEnd === -1) throw new Error('Malformed JSON in AI response');

  cleaned = cleaned.substring(jsonStart, jsonEnd + 1);

  try {
    return JSON.parse(cleaned);
  } catch {
    // Fix common issues: trailing commas, control characters
    const fixed = cleaned
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')
      .replace(/[\x00-\x1F\x7F]/g, ' ');
    return JSON.parse(fixed);
  }
}

async function extractTextFromPdf(pdfBase64: string): Promise<string> {
  try {
    // Strip the data URL prefix (handle various mime type formats)
    let base64Data = pdfBase64
      .replace(/^data:[^;]+;base64,/, '')
      .replace(/\s/g, ''); // Remove any whitespace/newlines

    const binaryStr = atob(base64Data);

    // Extract text from PDF BT...ET blocks
    const textMatches = binaryStr.match(/\(([^)]{1,500})\)\s*Tj/g) || [];
    const textTj = textMatches.map(m => m.replace(/^\(/, '').replace(/\)\s*Tj$/, '')).join(' ');

    const tjMatches = binaryStr.match(/\[([^\]]{1,2000})\]\s*TJ/g) || [];
    const textTJ = tjMatches.map(m => {
      return (m.match(/\(([^)]+)\)/g) || []).map(s => s.slice(1, -1)).join('');
    }).join(' ');

    let extractedText = (textTj + ' ' + textTJ).trim();

    extractedText = extractedText
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\')
      .replace(/[^\x20-\x7E\n\t\u00A0-\uFFFF]/g, ' ')
      .replace(/\s{3,}/g, '  ')
      .trim();

    return extractedText || '';
  } catch (e) {
    console.warn('PDF text extraction failed:', e);
    return '';
  }
}

const ANALYZE_PROMPT = `Ты эксперт по анализу чеков и банковских документов. СТРОГО извлеки данные из документа.

КРИТИЧЕСКИ ВАЖНО: Верни ТОЛЬКО сырой JSON без каких-либо markdown-блоков, без \`\`\`json, без пояснений, только JSON.

Формат ответа:
{"raw_text":"весь текст из документа","amount":число_или_null,"date":"YYYY-MM-DD или null","store_name":"название или null","store_address":"адрес или null","store_phone":"телефон или null","store_website":"сайт или null","store_google_maps":"https://maps.google.com/?q=... или null","category":"Продукты|Кафе/Ресторан|Аптека|Одежда|Транспорт|Хозтовары|Расходники для гостей|Другое или null","description":"2-5 слов на русском или null","items":[],"notes":null}

Правила:
- amount: только число (например 12.50), без символов валюты
- date: формат YYYY-MM-DD
- Если поле не определяется — ставь null
- НЕ добавляй никакого текста кроме JSON`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { imageBase64, transactionId, mode } = body;

    if (!imageBase64) {
      throw new Error('No file provided');
    }

    // Only detect PDF by the MIME type prefix — never scan the base64 body,
    // because random base64 characters can coincidentally contain "pdf".
    const isPdf = imageBase64.startsWith('data:application/pdf') ||
                  imageBase64.startsWith('data:application/x-pdf');

    const isAnalyzeMode = mode === 'analyze';

    let messages: any[];

    if (isPdf) {
      const pdfText = await extractTextFromPdf(imageBase64);
      const textContent = pdfText?.trim() || 'Текст из PDF не удалось извлечь автоматически — попробуй описать содержимое.';

      if (isAnalyzeMode) {
        messages = [{
          role: 'user',
          content: `${ANALYZE_PROMPT}\n\nТекст документа:\n${textContent}`,
        }];
      } else {
        messages = [{
          role: 'user',
          content: `Вот текст из PDF документа/чека. Выведи его структурированно:\n\n${textContent}`,
        }];
      }
    } else {
      // Image: use vision
      const prompt = isAnalyzeMode
        ? `${ANALYZE_PROMPT}\n\nПроанализируй изображение чека/квитанции.`
        : `Распознай весь текст с этого чека/квитанции. Выведи только текст без пояснений, сохраняя структуру строк.`;

      messages = [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageBase64 } },
          { type: 'text', text: prompt },
        ],
      }];
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
        max_tokens: 4000,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI API error: ${response.status} — ${errText}`);
    }

    const aiData = await response.json();
    const rawContent = aiData.choices?.[0]?.message?.content || '';

    if (isAnalyzeMode) {
      let parsed: any = {};
      let parseSuccess = false;
      
      console.log('Raw AI response (first 300 chars):', rawContent.substring(0, 300));
      
      try {
        parsed = extractJsonFromResponse(rawContent);
        parseSuccess = true;
        console.log('Parsed successfully:', JSON.stringify(parsed).substring(0, 300));
      } catch (e) {
        console.warn('Failed to parse AI JSON:', e, '\nRaw:', rawContent.substring(0, 500));
        // Fallback: try to at least extract raw_text
        parsed = { raw_text: rawContent };
        parseSuccess = false;
      }

      // If parse failed or all key fields are null/undefined, return error so client shows proper message
      const hasUsefulData = parseSuccess && (
        parsed.amount != null || 
        parsed.date != null || 
        parsed.store_name != null || 
        parsed.description != null
      );

      // Save receipt_text to DB if transactionId provided
      const receiptText = parsed.raw_text || rawContent;
      if (transactionId && receiptText) {
        const table = body.tableName === 'main_transactions' ? 'main_transactions' : 'emma_transactions';
        await supabase
          .from(table)
          .update({ receipt_text: receiptText })
          .eq('id', transactionId);
      }

      return new Response(JSON.stringify({ 
        success: true, 
        data: parsed, 
        text: receiptText,
        hasUsefulData,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      const receiptText = rawContent;

      if (transactionId && receiptText) {
        await supabase
          .from('emma_transactions')
          .update({ receipt_text: receiptText })
          .eq('id', transactionId);
      }

      return new Response(JSON.stringify({ success: true, text: receiptText }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('ocr-receipt error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
