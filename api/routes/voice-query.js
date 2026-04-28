'use strict';
const express = require('express');
const { Pool } = require('pg');
const router = express.Router();
const pool = new Pool({ connectionString: process.env.CW_DATABASE_URL || process.env.DATABASE_URL });

function fmtDate(d) {
  if (!d) return '';
  const s = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  if (!s.includes('-')) return s;
  const [y, m, dd] = s.split('-');
  return `${dd}.${m}.${y}`;
}

function periodFromCmd(cmd) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const iso = (yr, mo, d) => `${yr}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const lastDay = (yr, mo) => new Date(yr, mo, 0).getDate();
  if (cmd.date_from && cmd.date_to) return { from: cmd.date_from, to: cmd.date_to };
  switch (cmd.period || 'this_month') {
    case 'today':      { const d = now.toISOString().slice(0,10); return { from: d, to: d }; }
    case 'yesterday':  { const d = new Date(now - 86400000).toISOString().slice(0,10); return { from: d, to: d }; }
    case 'this_week':  { const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay()+6)%7)); return { from: mon.toISOString().slice(0,10), to: new Date(mon.getTime()+6*86400000).toISOString().slice(0,10) }; }
    case 'last_7':     return { from: new Date(now - 6*86400000).toISOString().slice(0,10), to: now.toISOString().slice(0,10) };
    case 'this_month': return { from: iso(y, m+1, 1), to: iso(y, m+1, lastDay(y, m+1)) };
    case 'last_month': return { from: iso(y, m, 1), to: iso(y, m, lastDay(y, m)) };
    case 'this_year':  return { from: iso(y, 1, 1), to: iso(y, 12, 31) };
    default:           return { from: iso(y, m+1, 1), to: iso(y, m+1, lastDay(y, m+1)) };
  }
}

const COMMANDS = {

  query_expenses: {
    intent: 'Расходы по мойкам за период (можно указать конкретную мойку)',
    params: { period: 'today / yesterday / this_week / this_month / last_month', wash: 'необязательно: Усатово / Корсунцы / Левитана / Усатого' },
    example: '{"action":"query_expenses","period":"this_month","wash":""}',
    async execute(cmd) {
      const per = periodFromCmd(cmd);
      const where = cmd.wash ? `AND wash_name = '${cmd.wash.replace(/'/g,"''")}'` : '';
      const { rows } = await pool.query(
        `SELECT wash_name, COALESCE(SUM(amount),0) as total, COUNT(*) as cnt
         FROM expenses WHERE expense_date >= $1 AND expense_date <= $2 ${where}
         GROUP BY wash_name ORDER BY total DESC`, [per.from, per.to]
      );
      if (!rows.length) return 'Расходов за период нет.';
      const total = rows.reduce((s,r) => s + parseFloat(r.total), 0);
      const detail = rows.map(r => `${r.wash_name}: ${parseFloat(r.total).toFixed(0)}`).join(', ');
      return `Расходы ${fmtDate(per.from)} — ${fmtDate(per.to)}: итого ${total.toFixed(0)} грн. ${detail}.`;
    },
  },

  query_expenses_by_type: {
    intent: 'Расходы по типу (химия, ДТ, ремонт и т.д.) за период',
    params: { period: 'this_month / last_month / this_week', wash: 'необязательно' },
    example: '{"action":"query_expenses_by_type","period":"this_month","wash":""}',
    async execute(cmd) {
      const per = periodFromCmd(cmd);
      const where = cmd.wash ? `AND wash_name = '${cmd.wash.replace(/'/g,"''")}'` : '';
      const { rows } = await pool.query(
        `SELECT expense_type, COALESCE(SUM(amount),0) as total FROM expenses
         WHERE expense_date >= $1 AND expense_date <= $2 ${where}
         GROUP BY expense_type ORDER BY total DESC LIMIT 8`, [per.from, per.to]
      );
      if (!rows.length) return 'Нет расходов за период.';
      return 'По типам: ' + rows.map(r => `${r.expense_type} ${parseFloat(r.total).toFixed(0)} грн`).join(', ') + '.';
    },
  },

  query_tasks: {
    intent: 'Открытые задачи по мойкам',
    params: { wash: 'необязательно', status: 'open / in_progress / all' },
    example: '{"action":"query_tasks","wash":"","status":"open"}',
    async execute(cmd) {
      const status = cmd.status === 'all' ? ['open','in_progress','completed'] : [cmd.status || 'open', 'in_progress'];
      const where = cmd.wash ? `AND wash_name = '${cmd.wash.replace(/'/g,"''")}'` : '';
      const { rows } = await pool.query(
        `SELECT wash_name, title, priority, due_date FROM tasks
         WHERE status = ANY($1) ${where} ORDER BY priority DESC, due_date ASC LIMIT 10`, [status]
      );
      if (!rows.length) return 'Открытых задач нет.';
      return `Задач: ${rows.length}. ` + rows.slice(0,5).map(r =>
        `${r.wash_name ? r.wash_name+': ' : ''}${r.title}${r.due_date ? ' (до '+fmtDate(r.due_date)+')' : ''}`
      ).join('. ') + '.';
    },
  },

  query_journal: {
    intent: 'Последние записи рабочего журнала мойки',
    params: { wash: 'необязательно', limit: 'количество записей, по умолчанию 5' },
    example: '{"action":"query_journal","wash":"","limit":5}',
    async execute(cmd) {
      const where = cmd.wash ? `WHERE wash_name = '${cmd.wash.replace(/'/g,"''")}'` : '';
      const { rows } = await pool.query(
        `SELECT wash_name, message, created_at FROM work_journal_entries ${where}
         ORDER BY created_at DESC LIMIT $1`, [cmd.limit || 5]
      );
      if (!rows.length) return 'Записей в журнале нет.';
      return rows.map(r =>
        `${r.wash_name} ${fmtDate(r.created_at)}: ${r.message?.slice(0,80) || '—'}`
      ).join('. ') + '.';
    },
  },

  query_expenses_compare: {
    intent: 'Сравнить расходы по мойкам — кто тратит больше',
    params: { period: 'this_month / last_month / this_week' },
    example: '{"action":"query_expenses_compare","period":"this_month"}',
    async execute(cmd) {
      const per = periodFromCmd(cmd);
      const { rows } = await pool.query(
        `SELECT wash_name, COALESCE(SUM(amount),0) as total
         FROM expenses WHERE expense_date >= $1 AND expense_date <= $2
         GROUP BY wash_name ORDER BY total DESC`, [per.from, per.to]
      );
      if (!rows.length) return 'Нет данных за период.';
      const total = rows.reduce((s,r) => s + parseFloat(r.total), 0);
      return rows.map((r,i) => {
        const pct = total > 0 ? Math.round(parseFloat(r.total)/total*100) : 0;
        return `${i+1}. ${r.wash_name}: ${parseFloat(r.total).toFixed(0)} грн (${pct}%)`;
      }).join(', ') + `. Итого: ${total.toFixed(0)} грн.`;
    },
  },

  create_task: {
    intent: 'Создать задачу для мойки',
    params: { wash: 'Усатово / Корсунцы / Левитана / Усатого', title: 'название задачи', priority: 'high / medium / low' },
    example: '{"action":"create_task","wash":"Усатово","title":"Проверить фильтры","priority":"medium"}',
    async execute(cmd) {
      if (!cmd.title) return 'Не указано название задачи.';
      await pool.query(
        `INSERT INTO tasks (wash_name, title, status, priority, created_by, created_at)
         VALUES ($1, $2, 'open', $3, 'voice', NOW())`,
        [cmd.wash || null, cmd.title, cmd.priority || 'medium']
      );
      return `Задача создана: "${cmd.title}"${cmd.wash ? ' для ' + cmd.wash : ''}.`;
    },
  },

  query_summary: {
    intent: 'Общая сводка по всем мойкам — расходы и задачи',
    params: { period: 'today / this_week / this_month' },
    example: '{"action":"query_summary","period":"this_month"}',
    async execute(cmd) {
      const per = periodFromCmd(cmd);
      const [{ rows: exp }, { rows: tasks }] = await Promise.all([
        pool.query(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as cnt FROM expenses WHERE expense_date >= $1 AND expense_date <= $2`, [per.from, per.to]),
        pool.query(`SELECT COUNT(*) as cnt FROM tasks WHERE status IN ('open','in_progress')`),
      ]);
      const total = parseFloat(exp[0]?.total || 0).toFixed(0);
      const expCnt = exp[0]?.cnt || 0;
      const taskCnt = tasks[0]?.cnt || 0;
      return `Сводка ${fmtDate(per.from)} — ${fmtDate(per.to)}: расходы ${total} грн (${expCnt} записей), открытых задач ${taskCnt}.`;
    },
  },

};

function buildSystemPrompt(commands) {
  const today = new Date().toISOString().slice(0,10);
  const commandList = Object.entries(commands).map(([action, cmd]) => {
    const paramsStr = cmd.params ? '\n  Параметры: ' + JSON.stringify(cmd.params) : '';
    return `${action}: ${cmd.intent}${paramsStr}\n  Пример: ${cmd.example}`;
  }).join('\n\n');
  return `Ты голосовой помощник ERA Carwash (сеть автомоек). Мойки: Усатово, Корсунцы, Левитана, Усатого.
Сегодня: ${today}. Периоды: today, yesterday, this_week, this_month, last_month. Даты YYYY-MM-DD.

ДОСТУПНЫЕ КОМАНДЫ:
${commandList}

ПРАВИЛА:
- Верни ТОЛЬКО JSON, без markdown.
- Если команда непонятна — {"action":"unknown"}.`;
}

async function parseIntent(text) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: buildSystemPrompt(COMMANDS) },
        { role: 'user', content: text },
      ],
      temperature: 0,
    }),
  });
  const data = await resp.json();
  const raw = (data.choices?.[0]?.message?.content || '{}').trim().replace(/^```json\n?/,'').replace(/\n?```$/,'');
  try { return JSON.parse(raw); } catch(e) { return { action: 'unknown' }; }
}

router.post('/voice-query', async (req, res) => {
  try {
    const secret = req.headers['x-bot-secret'] || req.body.secret;
    if (process.env.BOT_SECRET && secret !== process.env.BOT_SECRET) return res.status(403).json({ error: 'Unauthorized' });

    const q = (req.body.q || req.body.query || '').trim();
    if (!q) return res.status(400).json({ error: 'Missing q' });

    const cmd = await parseIntent(q);
    console.log('[voice-query] action:', cmd.action, '| q:', q);

    const handler = COMMANDS[cmd.action];
    if (!handler) {
      return res.json({ text: cmd.confirm_text || 'Не понял команду. Попробуйте ещё раз.', action: cmd.action });
    }

    const text = await handler.execute(cmd);
    res.json({ text, action: cmd.action });
  } catch (e) {
    console.error('[voice-query]', e.message);
    res.status(500).json({ error: e.message, text: 'Произошла ошибка. Попробуйте ещё раз.' });
  }
});

module.exports = router;
