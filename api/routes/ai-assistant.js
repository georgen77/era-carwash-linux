require('dotenv').config();
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.CW_DATABASE_URL || process.env.DATABASE_URL });

const CAR_WASHES = [
  { name: 'Усатово',  baseUrl: 'https://sim5.gteh.com.ua', login: process.env.WASH_USATOVO_LOGIN  || 'odessa8',      password: process.env.WASH_USATOVO_PASS  || 'odessa828122020' },
  { name: 'Корсунцы', baseUrl: 'https://sim4.gteh.com.ua', login: process.env.WASH_KORSUNTSY_LOGIN || 'krasnosilka',  password: process.env.WASH_KORSUNTSY_PASS || 'krasnosilka221119' },
  { name: 'Левитана', baseUrl: 'https://sim5.gteh.com.ua', login: process.env.WASH_LEVITANA_LOGIN  || 'odesa11',      password: process.env.WASH_LEVITANA_PASS  || 'dimakalinin' },
];

const LANG_NAMES = { uk: 'Ukrainian', ru: 'Russian', en: 'English' };

async function callGemini(messages, model = 'gemini-2.5-flash', temperature = 0.3) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents, generationConfig: { temperature } }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${err}`);
  }
  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function fetchFullSummary(washName, dateFrom, dateTo) {
  const port = process.env.PORT || 5001;
  const resp = await fetch(`http://localhost:${port}/api/scrape-carwash`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportType: 'fullSummary', washName, dateFrom, dateTo, authToken: 'internal' }),
  });
  const json = await resp.json();
  if (!json.success || !json.results?.[0]) return { headers: [], rows: [], totalRow: [] };
  return json.results[0];
}

function parseDateOffset(query) {
  const today = new Date();
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  if (/вчора|вчер|yesterday/i.test(query)) {
    const d = new Date(today); d.setDate(d.getDate() - 1);
    return { from: fmt(d), to: fmt(d) };
  }
  return { from: fmt(today), to: fmt(today) };
}

router.post('/ai-assistant', async (req, res) => {
  try {
    const body = req.body;
    const { query, authToken, dateFrom, dateTo, history, lang, systemOverride, jsonMode } = body;
    const responseLang = LANG_NAMES[lang] || 'Ukrainian';

    // Smart voice parsing mode
    if (systemOverride && jsonMode) {
      const answer = await callGemini([
        { role: 'user', content: `${systemOverride}\n\nUser input: ${query}` }
      ], 'gemini-2.5-flash', 0.1);
      return res.json({ success: true, answer });
    }

    const today = new Date();
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const todayStr = fmt(today);
    const currentFrom = dateFrom || todayStr;
    const currentTo = dateTo || todayStr;

    // Task creation detection
    const taskKeywords = /запиши\s+задачу|відміть\s+задачу|відзнач\s+задачу|отметь\s+задачу|запиши\s+завдання|додай\s+задачу|создай\s+задачу|create\s+task/i;
    const isTaskCreation = taskKeywords.test(query || '');

    if (isTaskCreation) {
      const washMap = { 'усатово': 'Усатово', 'усатов': 'Усатово', 'корсунц': 'Корсунцы', 'левитан': 'Левитана' };
      let taskWash = 'Общее';
      const qLow = (query || '').toLowerCase();
      for (const [key, val] of Object.entries(washMap)) {
        if (qLow.includes(key)) { taskWash = val; break; }
      }
      const taskTitle = (query || '')
        .replace(/^(запиши|відміть|відзнач|отметь|додай|создай|поставь)\s+(задачу|завдання|task)\s*/i, '')
        .replace(/\s*(на|по|для)\s+(усатово|усатов|корсунц|левитан)\s*/i, '')
        .trim();

      if (taskTitle) {
        const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + 7);
        await pool.query(
          "INSERT INTO public.tasks (title, wash_name, status, priority, due_date, created_by) VALUES ($1,$2,'todo','normal',$3,$4) ON CONFLICT DO NOTHING",
          [taskTitle, taskWash, dueDate.toISOString().split('T')[0], body.username || 'ai']
        );
        return res.json({ success: true, answer: `✅ Задача создана!\n\n**${taskTitle}**\nОбъект: ${taskWash}\nЗадача добавлена в журнал.`, intent: { metric: 'create_task' }, taskCreated: { title: taskTitle, wash_name: taskWash } });
      }
    }

    // Parse intent via Gemini
    const systemPrompt = `You are a data assistant for a car wash business. Parse natural language queries about revenue.
Car washes: "Усатово", "Корсунцы", "Левитана". Today: ${todayStr}. Period: ${currentFrom} to ${currentTo}.
For "безнал", "картки" — metric "cashless". For "виручка", "оборот" — metric "total".
For terminal state, collections — metric "technical". For forecast — metric "forecast".
For expenses — metric "expenses". For power outages, fuel — metric "journal_analysis".
Respond ONLY with valid JSON:
{"washName":"...","metric":"cashless|total|both|technical|forecast|expenses|journal_analysis","dateFrom":"YYYY-MM-DD","dateTo":"YYYY-MM-DD","journalTopics":["power","fuel"]}`;

    const historyMessages = Array.isArray(history) ? history.slice(-6) : [];
    let intent;
    try {
      const raw = await callGemini([
        { role: 'user', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: query },
      ], 'gemini-2.5-flash', 0.1);
      const cleaned = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
      intent = JSON.parse(cleaned);
    } catch {
      const dates = parseDateOffset(query);
      intent = { washName: 'all', metric: 'both', dateFrom: dates.from, dateTo: dates.to };
    }

    if (!intent.dateFrom) intent.dateFrom = currentFrom;
    if (!intent.dateTo) intent.dateTo = currentTo;

    const washesToFetch = intent.washName === 'all'
      ? CAR_WASHES
      : CAR_WASHES.filter(w => w.name.toLowerCase().includes((intent.washName || '').toLowerCase()));
    if (washesToFetch.length === 0) washesToFetch.push(...CAR_WASHES);

    let dataSummary = '';

    if (intent.metric === 'journal_analysis') {
      const topics = intent.journalTopics || ['power', 'fuel'];
      const washFilter = intent.washName !== 'all' ? ` AND wash_name=$3` : '';
      const params = [intent.dateFrom + 'T00:00:00', intent.dateTo + 'T23:59:59'];
      if (intent.washName !== 'all') params.push(intent.washName);
      const r = await pool.query(
        `SELECT id, created_at, message, wash_name, author FROM public.work_journal_entries WHERE created_at>=$1 AND created_at<=$2${washFilter} ORDER BY created_at ASC LIMIT 1000`,
        params
      );
      const entries = r.rows;
      const powerOffKw = /відключили?\s+світло|виключили?\s+світло|вимкнули?\s+світло|немає\s+світла|выключили?\s+свет|отключили?\s+свет|блекаут|blackout|запустили\s+генератор/i;
      const powerOnKw = /дали\s+світло|включили?\s+світло|ввімкнули?\s+світло|підключили\s+світло|свет\s+дали|зупинили\s+генератор/i;
      const fuelKw = /заправк|заправили|залили|отримали?\s+дт|дт\s+\d|дизель|[\d]+\s*літр|[\d]+\s*литр/i;
      const lines = [`📊 Аналіз журналу за ${intent.dateFrom} — ${intent.dateTo}`, `Всього записів: ${entries.length}`];
      if (topics.includes('power')) {
        const offEvts = entries.filter(e => powerOffKw.test(e.message));
        const onEvts = entries.filter(e => powerOnKw.test(e.message));
        lines.push(`\n--- ВІДКЛЮЧЕННЯ СВІТЛА ---`);
        lines.push(`Вимкнень: ${offEvts.length}, відновлень: ${onEvts.length}`);
        for (const e of offEvts) lines.push(`${new Date(e.created_at).toLocaleString('uk-UA')} [${e.wash_name}] 🔴 ${e.message.slice(0,80)}`);
      }
      if (topics.includes('fuel')) {
        const fuelEvts = entries.filter(e => fuelKw.test(e.message));
        lines.push(`\n--- ПАЛИВО ---`);
        lines.push(`Записів про паливо: ${fuelEvts.length}`);
        for (const e of fuelEvts) lines.push(`${new Date(e.created_at).toLocaleString('uk-UA')} [${e.wash_name}] ${e.message.slice(0,80)}`);
      }
      dataSummary = lines.join('\n');

    } else if (intent.metric === 'forecast') {
      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
      const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
      const daysPassed = now.getDate();
      const lines = [`Дані за ${monthStart} — ${todayStr} (пройшло ${daysPassed} з ${daysInMonth} днів)`];
      let grandTotal = 0;
      for (const config of washesToFetch) {
        try {
          const report = await fetchFullSummary(config.name, monthStart, todayStr);
          const total = parseFloat((report.totalRow?.[1] || '0').replace(/[^\d.,\-]/g,'').replace(',','.')) || 0;
          const projected = daysPassed > 0 ? (total / daysPassed) * daysInMonth : 0;
          grandTotal += total;
          lines.push(`${config.name}: факт ${total.toLocaleString('uk-UA')} грн → прогноз: ${projected.toLocaleString('uk-UA')} грн`);
        } catch(e) { lines.push(`${config.name}: помилка (${e.message})`); }
      }
      if (washesToFetch.length > 1) {
        const grandProjected = daysPassed > 0 ? (grandTotal / daysPassed) * daysInMonth : 0;
        lines.push(`ПІДСУМОК: факт ${grandTotal.toLocaleString('uk-UA')} грн → прогноз: ${grandProjected.toLocaleString('uk-UA')} грн`);
      }
      dataSummary = lines.join('\n');

    } else if (intent.metric === 'expenses') {
      const washFilter = intent.washName !== 'all' ? ' AND wash_name=$3' : '';
      const params = [intent.dateFrom, intent.dateTo];
      if (intent.washName !== 'all') params.push(intent.washName);
      const r = await pool.query(
        `SELECT expense_type, SUM(amount) as total FROM public.expenses WHERE expense_date>=$1 AND expense_date<=$2${washFilter} GROUP BY expense_type ORDER BY total DESC`,
        params
      );
      const lines = [`Витрати за ${intent.dateFrom} — ${intent.dateTo}:`];
      let grand = 0;
      for (const row of r.rows) { lines.push(`  ${row.expense_type}: ${Number(row.total).toLocaleString('uk-UA')} грн`); grand += Number(row.total); }
      lines.push(`Всього: ${grand.toLocaleString('uk-UA')} грн`);
      dataSummary = lines.join('\n');

    } else if (intent.metric === 'technical') {
      dataSummary = 'Для технічного стану зверніться до розділу "Технічний стан" в дашборді.';

    } else {
      const results = [];
      let grandTotal = 0;
      let grandCashless = 0;
      for (const config of washesToFetch) {
        try {
          const port = process.env.PORT || 5001;
          const resp = await fetch(`http://localhost:${port}/api/scrape-carwash`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ washIndex: 'all', washName: config.name, dateFrom: intent.dateFrom, dateTo: intent.dateTo, authToken: 'internal' }),
          });
          const data = await resp.json();
          const result = data.results ? data.results[0] : data;
          const parseNum = (s) => parseFloat((s || '0').replace(/[^\d.,\-]/g,'').replace(',','.')) || 0;
          const total = parseNum(result?.totalRow?.[1]);
          const cashlessIdx = (result?.headers || []).findIndex(h => /безготівк|безнал|картка/i.test(h));
          const cashless = cashlessIdx >= 0 ? parseNum(result?.totalRow?.[cashlessIdx]) : 0;
          results.push({ washName: config.name, total, cashless });
          grandTotal += total; grandCashless += cashless;
        } catch(e) { results.push({ washName: config.name, total: 0, cashless: 0, error: e.message }); }
      }
      const lines = [`Виручка за ${intent.dateFrom} — ${intent.dateTo}:`];
      for (const r of results) {
        if (r.error) lines.push(`  ${r.washName}: помилка`);
        else if (intent.metric === 'cashless') lines.push(`  ${r.washName}: безнал ${r.cashless.toLocaleString('uk-UA')} грн`);
        else if (intent.metric === 'total') lines.push(`  ${r.washName}: ${r.total.toLocaleString('uk-UA')} грн`);
        else lines.push(`  ${r.washName}: всього ${r.total.toLocaleString('uk-UA')} грн, безнал ${r.cashless.toLocaleString('uk-UA')} грн`);
      }
      if (results.length > 1) lines.push(`Разом: ${grandTotal.toLocaleString('uk-UA')} грн`);
      dataSummary = lines.join('\n');
    }

    // Generate human response
    const answerSystemPrompt = `You are a helpful assistant for a car wash business. Answer in ${responseLang}. Be concise and clear. Format numbers nicely. Use the data provided.`;
    const answer = await callGemini([
      { role: 'user', content: `${answerSystemPrompt}\n\nUser question: ${query}\n\nData:\n${dataSummary}` }
    ], 'gemini-2.5-flash', 0.3);

    return res.json({ success: true, answer, intent, dataSummary });
  } catch (error) {
    console.error('[ai-assistant] error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
