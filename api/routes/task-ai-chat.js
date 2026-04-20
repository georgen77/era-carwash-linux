require("dotenv").config();
const express = require("express");
const router = express.Router();

router.post("/task-ai-chat", async (req, res) => {
  try {
    const { messages, taskTitle, taskDescription } = req.body;
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `Ты умный помощник для управления задачами. Помогаешь организовать и решить конкретную задачу.\nТекущая задача: "${taskTitle}"\nОписание: "${taskDescription}"\n\nТы помогаешь:\n- Писать официальные письма в службы и организации на русском, испанском или английском языке\n- Находить телефоны организаций в Валенсии, Испании\n- Давать пошаговые инструкции по решению бюрократических вопросов в Испании\n\nФорматируй ответы с эмоджи. Будь конкретным и практичным. Отвечай на русском если вопрос на русском.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages: [{ role: "system", content: systemPrompt }, ...messages], stream: true }),
    });

    if (!response.ok) {
      if (response.status === 429) return res.status(429).json({ error: "Лимит запросов превышен, попробуйте позже." });
      if (response.status === 402) return res.status(402).json({ error: "Недостаточно средств на счёте." });
      throw new Error(`AI gateway error: ${response.status}`);
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    response.body.pipe(res);
  } catch (e) {
    console.error("[task-ai-chat]", e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
