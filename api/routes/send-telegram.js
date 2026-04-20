require("dotenv").config();
const express = require("express");
const router = express.Router();

router.post("/send-telegram", async (req, res) => {
  try {
    const { chat_id, text, bot_token } = req.body;
    if (!chat_id || !text) return res.status(400).json({ error: "chat_id and text required" });
    const token = bot_token || process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return res.status(500).json({ error: "No Telegram bot token configured" });
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id, text, parse_mode: "Markdown" }),
    });
    const data = await response.json();
    if (!data.ok) return res.status(400).json({ error: data.description || "Telegram API error" });
    res.json({ success: true, message_id: data.result?.message_id });
  } catch (error) {
    console.error("[send-telegram] error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
