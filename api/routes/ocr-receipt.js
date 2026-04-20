require("dotenv").config();
const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");

const ANALYZE_PROMPT = `Ты эксперт по анализу чеков и банковских документов. СТРОГО извлеки данные из документа.\n\nКРИТИЧЕСКИ ВАЖНО: Верни ТОЛЬКО сырой JSON без markdown-блоков, без пояснений, только JSON.\n\nФормат: {"raw_text":"весь текст","amount":число_или_null,"date":"YYYY-MM-DD или null","store_name":"название или null","store_address":"адрес или null","store_phone":"телефон или null","store_website":"сайт или null","store_google_maps":"url или null","category":"Продукты|Кафе/Ресторан|Аптека|Одежда|Транспорт|Хозтовары|Расходники для гостей|Другое или null","description":"2-5 слов на русском или null","items":[],"notes":null}`;

function extractJsonFromResponse(response) {
  let cleaned = response.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const jsonStart = cleaned.search(/[\{\[]/);
  if (jsonStart === -1) throw new Error("No JSON found in AI response");
  const firstChar = cleaned[jsonStart];
  const closeChar = firstChar === "{" ? "}" : "]";
  const jsonEnd = cleaned.lastIndexOf(closeChar);
  if (jsonEnd === -1) throw new Error("Malformed JSON in AI response");
  cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
  try { return JSON.parse(cleaned); }
  catch {
    return JSON.parse(cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]").replace(/[\x00-\x1F\x7F]/g, " "));
  }
}

function extractTextFromPdf(pdfBase64) {
  try {
    const base64Data = pdfBase64.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
    const binaryStr = Buffer.from(base64Data, "base64").toString("binary");
    const textMatches = binaryStr.match(/\(([^)]{1,500})\)\s*Tj/g) || [];
    const textTj = textMatches.map(m => m.replace(/^\(/, "").replace(/\)\s*Tj$/, "")).join(" ");
    let extractedText = textTj.replace(/\\n/g, "\n").replace(/\\r/g, "\n").replace(/\\t/g, "\t")
      .replace(/[^\x20-\x7E\n\t\u00A0-\uFFFF]/g, " ").replace(/\s{3,}/g, "  ").trim();
    return extractedText || "";
  } catch (e) {
    console.warn("[ocr-receipt] PDF text extraction failed:", e.message);
    return "";
  }
}

router.post("/ocr-receipt", async (req, res) => {
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const lovableApiKey = process.env.LOVABLE_API_KEY;
    const { imageBase64, transactionId, mode, tableName } = req.body;
    if (!imageBase64) throw new Error("No file provided");

    const isPdf = imageBase64.startsWith("data:application/pdf") || imageBase64.startsWith("data:application/x-pdf");
    const isAnalyzeMode = mode === "analyze";

    let messages;
    if (isPdf) {
      const pdfText = extractTextFromPdf(imageBase64);
      const textContent = pdfText?.trim() || "Текст из PDF не удалось извлечь.";
      messages = [{ role: "user", content: isAnalyzeMode ? `${ANALYZE_PROMPT}\n\nТекст документа:\n${textContent}` : `Вот текст из PDF. Выведи структурированно:\n\n${textContent}` }];
    } else {
      const prompt = isAnalyzeMode
        ? `${ANALYZE_PROMPT}\n\nПроанализируй изображение чека/квитанции.`
        : `Распознай весь текст с этого чека/квитанции. Выведи только текст без пояснений, сохраняя структуру строк.`;
      messages = [{ role: "user", content: [{ type: "image_url", image_url: { url: imageBase64 } }, { type: "text", text: prompt }] }];
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-2.5-flash", messages, max_tokens: 4000, temperature: 0 }),
    });
    if (!response.ok) throw new Error(`AI API error: ${response.status}`);

    const aiData = await response.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "";

    if (isAnalyzeMode) {
      let parsed = {}, parseSuccess = false;
      try { parsed = extractJsonFromResponse(rawContent); parseSuccess = true; }
      catch (e) { parsed = { raw_text: rawContent }; }

      const hasUsefulData = parseSuccess && (parsed.amount != null || parsed.date != null || parsed.store_name != null || parsed.description != null);
      const receiptText = parsed.raw_text || rawContent;

      if (transactionId && receiptText) {
        const table = tableName === "main_transactions" ? "main_transactions" : "emma_transactions";
        await supabase.from(table).update({ receipt_text: receiptText }).eq("id", transactionId);
      }

      res.json({ success: true, data: parsed, text: receiptText, hasUsefulData });
    } else {
      const receiptText = rawContent;
      if (transactionId && receiptText) {
        await supabase.from("emma_transactions").update({ receipt_text: receiptText }).eq("id", transactionId);
      }
      res.json({ success: true, text: receiptText });
    }
  } catch (error) {
    console.error("[ocr-receipt] error:", error.message);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
