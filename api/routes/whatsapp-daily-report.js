require('dotenv').config();
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.CW_DATABASE_URL || process.env.DATABASE_URL });

const CAR_WASHES = [
  { name: 'Усатово' },
  { name: 'Корсунцы' },
  { name: 'Левитана' },
];

function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function fetchRevenue(washName, dateFrom, dateTo) {
  const port = process.env.PORT || 5001;
  const resp = await fetch(`http://localhost:${port}/api/scrape-carwash`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ washIndex: 'all', washName, dateFrom, dateTo, authToken: 'internal' }),
  });
  const json = await resp.json();
  return (json.results || []).find(r => r.washName === washName) || json.results?.[0];
}

function parseNum(s) {
  return parseFloat((s || '0').replace(/[^\d.,\-]/g, '').replace(',', '.')) || 0;
}

function findCashlessIdx(headers) {
  const candidates = ['за безготівку', 'безготівк', 'безнал', 'картка', 'cashless'];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase().trim();
    if (candidates.some(c => h.includes(c))) return i;
  }
  return -1;
}

async function sendTelegramTo(chatId, message) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN not configured');
  const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' }),
  });
  if (!resp.ok) throw new Error(`Telegram error [${resp.status}]`);
  return await resp.json();
}

async function getRecipientsFromDB(recipientId) {
  if (recipientId) {
    const r = await pool.query("SELECT name, telegram_chat_id FROM public.notification_recipients WHERE id=$1", [recipientId]);
    return r.rows.filter(row => row.telegram_chat_id);
  }
  const r = await pool.query(
    "SELECT DISTINCT nr.name, nr.telegram_chat_id FROM public.notification_schedules ns JOIN public.notification_recipients nr ON ns.recipient_id=nr.id WHERE ns.active=true AND nr.telegram_chat_id IS NOT NULL"
  );
  return r.rows;
}

router.post('/whatsapp-daily-report', async (req, res) => {
  try {
    const { recipientId } = req.body;
    const now = new Date();
    const todayStr = fmt(now);
    const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
    const daysPassed = now.getDate();
    const monthName = now.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });

    let todayTotalAll = 0;
    let monthTotalAll = 0;
    const lines = [`🚗 *Ежедневный отчёт по выручке*`, `📅 ${now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`, ''];

    for (const wash of CAR_WASHES) {
      let todayTotal = 0, todayCashless = 0, monthTotal = 0;
      try {
        const todayReport = await fetchRevenue(wash.name, todayStr, todayStr);
        todayTotal = parseNum(todayReport?.totalRow?.[1] || '0');
        const cashlessIdx = findCashlessIdx(todayReport?.headers || []);
        todayCashless = cashlessIdx >= 0 ? parseNum(todayReport?.totalRow?.[cashlessIdx] || '0') : 0;
      } catch(e) { console.error(`Today fetch error for ${wash.name}:`, e.message); }

      try {
        const monthReport = await fetchRevenue(wash.name, monthStart, todayStr);
        monthTotal = parseNum(monthReport?.totalRow?.[1] || '0');
      } catch(e) { console.error(`Month fetch error for ${wash.name}:`, e.message); }

      todayTotalAll += todayTotal;
      monthTotalAll += monthTotal;
      const todayCashlessPct = todayTotal > 0 ? Math.round(todayCashless / todayTotal * 100) : 0;
      lines.push(`*${wash.name}*`);
      lines.push(`  За сегодня: ${todayTotal.toLocaleString('ru-RU')} грн (безнал: ${todayCashless.toLocaleString('ru-RU')} грн, ${todayCashlessPct}%)`);
      lines.push(`  С начала месяца: ${monthTotal.toLocaleString('ru-RU')} грн`);
    }

    lines.push('', `*📊 ИТОГО ВСЕ МОЙКИ*`);
    lines.push(`  За сегодня: ${todayTotalAll.toLocaleString('ru-RU')} грн`);
    lines.push(`  С начала ${monthName}: ${monthTotalAll.toLocaleString('ru-RU')} грн`);
    if (daysPassed > 0) {
      const projected = Math.round(monthTotalAll / daysPassed * daysInMonth);
      lines.push(`  Прогноз на месяц: ~${projected.toLocaleString('ru-RU')} грн (${daysPassed}/${daysInMonth} дней)`);
    }

    const message = lines.join('\n');

    let dbRecipients = [];
    try { dbRecipients = await getRecipientsFromDB(recipientId); } catch(e) { console.error('DB recipients error:', e.message); }

    let sentCount = 0;
    if (dbRecipients.length > 0) {
      for (const r of dbRecipients) {
        try { await sendTelegramTo(r.telegram_chat_id, message); sentCount++; } catch(e) { console.error(`Failed to send to ${r.name}:`, e.message); }
      }
    } else {
      const chatId = process.env.TELEGRAM_CHAT_ID;
      if (chatId) { await sendTelegramTo(chatId, message); sentCount = 1; }
    }

    res.json({ success: true, message: `Report sent to ${sentCount} recipients`, preview: message });
  } catch (error) {
    console.error('[whatsapp-daily-report] error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
