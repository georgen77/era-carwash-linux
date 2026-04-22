require('dotenv').config();
const express = require('express');
const router = express.Router();

// Carwash version: accepts { chatId, message, chatIds }
router.post('/cw-send-telegram', async (req, res) => {
  try {
    const { chatId, message, chatIds } = req.body;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return res.status(500).json({ success: false, error: 'TELEGRAM_BOT_TOKEN not configured' });
    const targets = chatIds || (chatId ? [chatId] : []);
    if (targets.length === 0) return res.status(400).json({ success: false, error: 'No chat IDs provided' });
    const results = [];
    for (const id of targets) {
      const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: id, text: message, parse_mode: 'Markdown' }),
      });
      const data = await resp.json();
      results.push({ chatId: id, ok: data.ok, error: data.description });
    }
    res.json({ success: true, results });
  } catch (error) {
    console.error('[cw-send-telegram] error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
