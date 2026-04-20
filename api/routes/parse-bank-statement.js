require("dotenv").config();
const express = require("express");
const router = express.Router();

const PROMPT = `Ты эксперт по анализу банковских выписок. Найди ВСЕ входящие платежи от Airbnb, Holidu, Booking.com и других платформ аренды.\nВерни ТОЛЬКО валидный JSON массив без markdown:\n[\n  {\n    "date": "YYYY-MM-DD",\n    "amount": 1234.56,\n    "source": "Airbnb",\n    "description": "описание",\n    "reference": "референс или null",\n    "apartment_hint": "апартамент или null"\n  }\n]\nЕсли платежей нет — верни [].`;

router.post("/parse-bank-statement", async (req, res) => {
  try {
    const lovableApiKey = process.env.LOVABLE_API_KEY;
    if (!lovableApiKey) throw new Error("LOVABLE_API_KEY not configured");
    const { imageBase64 } = req.body;
    if (!imageBase64) throw new Error("No file provided");

    const isPdf = imageBase64.startsWith("data:application/pdf") || imageBase64.startsWith("data:application/x-pdf");
    const base64Data = isPdf ? imageBase64.replace(/^data:[^;]+;base64,/, "") : null;

    const messages = [{
      role: "user",
      content: [
        { type: "text", text: PROMPT },
        { type: "image_url", image_url: { url: isPdf ? `data:application/pdf;base64,${base64Data}` : imageBase64 } },
      ],
    }];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-2.5-flash", messages, max_tokens: 4000, temperature: 0 }),
    });
    if (!response.ok) throw new Error(`AI API error: ${response.status}`);

    const aiData = await response.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "[]";
    let transactions = [];
    try {
      const cleaned = rawContent.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const start = cleaned.indexOf("["), end = cleaned.lastIndexOf("]");
      transactions = start !== -1 && end !== -1 ? JSON.parse(cleaned.substring(start, end + 1)) : JSON.parse(cleaned);
      if (!Array.isArray(transactions)) transactions = [];
    } catch (e) { transactions = []; }

    res.json({ success: true, transactions });
  } catch (e) {
    console.error("[parse-bank-statement]", e.message);
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
