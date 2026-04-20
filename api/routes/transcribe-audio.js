require("dotenv").config();
const express = require("express");
const router = express.Router();

router.post("/transcribe-audio", async (req, res) => {
  try {
    const { audioBase64, mimeType } = req.body;
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Пожалуйста, транскрибируй этот аудиозапись дословно. Если речь на русском — транскрибируй на русском. Если на испанском — на испанском. Выдай только текст транскрипции без комментариев.",
              },
              {
                type: "input_audio",
                input_audio: {
                  data: audioBase64,
                  format: mimeType?.includes("webm") ? "webm" : "wav",
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      throw new Error(`AI error: ${response.status} ${t}`);
    }

    const data = await response.json();
    const transcription = data.choices?.[0]?.message?.content || "";

    return res.json({ transcription });
  } catch (e) {
    console.error("[transcribe-audio] error:", e);
    return res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
  }
});

module.exports = router;
