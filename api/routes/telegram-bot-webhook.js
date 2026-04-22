require('dotenv').config();
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.CW_DATABASE_URL || process.env.DATABASE_URL });
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

function detectWash(groupTitle, text) {
  const combined = (groupTitle + ' ' + text).toLowerCase();
  if (combined.includes('усатов')) return 'Усатово';
  if (combined.includes('корсунц') || combined.includes('красносилка') || combined.includes('krasnosilka')) return 'Корсунцы';
  if (combined.includes('левитан')) return 'Левитана';
  return 'Общее';
}

async function downloadTelegramFile(fileId) {
  try {
    const fileResp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
    const fileData = await fileResp.json();
    if (!fileData.ok) return null;
    const filePath = fileData.result.file_path;
    const imgResp = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`);
    const buffer = await imgResp.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mimeType = filePath.endsWith('.jpg') || filePath.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
    return `data:${mimeType};base64,${base64}`;
  } catch {
    return null;
  }
}

async function saveToJournal(entry) {
  await pool.query(
    "INSERT INTO public.work_journal_entries (message, wash_name, author, telegram_user, telegram_group, telegram_message_id, source, tags, image) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [entry.message, entry.wash_name, entry.author, entry.telegram_user, entry.telegram_group, entry.telegram_message_id, entry.source, entry.tags || null, entry.image || null]
  );
}

// GET — setWebhook or getWebhookInfo
router.get('/telegram-bot-webhook', async (req, res) => {
  const { action } = req.query;
  if (action === 'setWebhook') {
    const webhookUrl = `${req.protocol}://${req.get('host')}/api/telegram-bot-webhook`;
    const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}&allowed_updates=["message","edited_message","channel_post"]`);
    return res.json(await resp.json());
  }
  if (action === 'getWebhookInfo') {
    const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
    return res.json(await resp.json());
  }
  res.send('Telegram Bot Webhook endpoint');
});

router.post('/telegram-bot-webhook', async (req, res) => {
  res.send('ok'); // respond 200 immediately

  try {
    const update = req.body;
    const msg = update.message || update.edited_message;
    if (!msg) return;

    const chatId = msg.chat?.id;
    const chatType = msg.chat?.type;
    const groupTitle = msg.chat?.title || '';
    const messageId = msg.message_id;
    const from = msg.from;
    const authorName = from?.username ? `@${from.username}` : `${from?.first_name || ''} ${from?.last_name || ''}`.trim();
    const text = msg.text || msg.caption || '';

    if (chatType === 'private') {
      if (text && BOT_TOKEN) {
        const port = process.env.PORT || 5001;
        const aiResp = await fetch(`http://localhost:${port}/api/ai-assistant`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: text, authToken: 'internal', lang: 'ru', history: [] }),
        }).catch(() => null);
        const aiData = aiResp ? await aiResp.json().catch(() => null) : null;
        const replyText = aiData?.answer || 'AI-ассистент недоступний.';
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: replyText, parse_mode: 'Markdown' }),
        }).catch(() => {});
      }
      return;
    }

    const washName = detectWash(groupTitle, text);
    const hasPhoto = !!(msg.photo && msg.photo.length > 0);
    if (!text && !hasPhoto) return;

    let imageBase64 = null;
    if (hasPhoto) {
      const largestPhoto = msg.photo[msg.photo.length - 1];
      imageBase64 = await downloadTelegramFile(largestPhoto.file_id);
    }

    const tags = [];
    const lower = text.toLowerCase();
    if (lower.includes('генератор')) tags.push('генератор');
    if (lower.includes('свет') || lower.includes('світло')) tags.push('електрика');
    if (lower.includes('топлив') || lower.includes('пальне') || lower.includes('залив')) tags.push('паливо');
    if (lower.includes('ремонт') || lower.includes('поломк')) tags.push('ремонт');
    if (hasPhoto) tags.push('фото');

    await saveToJournal({
      message: text || `📷 Фото від ${authorName}`,
      wash_name: washName,
      author: authorName,
      telegram_user: authorName,
      telegram_group: groupTitle,
      telegram_message_id: messageId,
      source: 'telegram',
      tags: tags.length > 0 ? tags : null,
      image: imageBase64,
    });
  } catch (error) {
    console.error('[telegram-bot-webhook] error:', error.message);
  }
});

module.exports = router;
