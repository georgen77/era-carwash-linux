const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.CW_DATABASE_URL || process.env.DATABASE_URL });

const ALLOWED = new Set([
  'expenses','expense_logs','report_cache','daily_fixed_costs','monthly_expense_defaults',
  'contractors','reminders','notification_recipients','notification_templates',
  'login_logs','work_journal_entries','tasks','ai_chat_messages','ai_prompt_journal',
  'app_users','notes','task_assignees','task_activity_log',
]);

function guard(table, res) {
  if (!ALLOWED.has(table)) { res.status(400).json({ data: null, error: { message: `Table '${table}' not allowed` } }); return false; }
  return true;
}

function buildWhere(filters, params) {
  if (!filters || filters.length === 0) return '';
  const conds = filters.map(f => {
    params.push(f.value);
    const i = params.length;
    if (f.op === 'gte') return `"${f.column}" >= $${i}`;
    if (f.op === 'lte') return `"${f.column}" <= $${i}`;
    if (f.op === 'ilike') return `"${f.column}" ILIKE $${i}`;
    if (f.op === 'in') { params.pop(); const ph = f.value.map(v => { params.push(v); return `$${params.length}`; }).join(','); return `"${f.column}" IN (${ph})`; }
    return `"${f.column}" = $${i}`;
  });
  return ' WHERE ' + conds.join(' AND ');
}

// SELECT
router.post('/db/select', async (req, res) => {
  const { table, columns = '*', filters = [], order, limit } = req.body;
  if (!guard(table, res)) return;
  try {
    const params = [];
    let sql = `SELECT ${columns} FROM "${table}"`;
    sql += buildWhere(filters, params);
    if (order) sql += ` ORDER BY "${order.column}" ${order.ascending ? 'ASC' : 'DESC'}`;
    if (limit) { params.push(limit); sql += ` LIMIT $${params.length}`; }
    const { rows } = await pool.query(sql, params);
    res.json({ data: rows, error: null });
  } catch (e) { res.json({ data: null, error: { message: e.message } }); }
});

// INSERT
router.post('/db/insert', async (req, res) => {
  const { table, row } = req.body;
  if (!guard(table, res)) return;
  try {
    const cols = Object.keys(row);
    const vals = Object.values(row);
    const ph = vals.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await pool.query(
      `INSERT INTO "${table}" (${cols.map(c=>`"${c}"`).join(',')}) VALUES (${ph}) RETURNING *`, vals
    );
    res.json({ data: rows, error: null });
  } catch (e) { res.json({ data: null, error: { message: e.message } }); }
});

// UPDATE
router.post('/db/update', async (req, res) => {
  const { table, updates, filters = [] } = req.body;
  if (!guard(table, res)) return;
  try {
    const cols = Object.keys(updates);
    const vals = Object.values(updates);
    const set = cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
    const params = [...vals];
    const where = buildWhere(filters, params);
    const { rows } = await pool.query(`UPDATE "${table}" SET ${set}${where} RETURNING *`, params);
    res.json({ data: rows, error: null });
  } catch (e) { res.json({ data: null, error: { message: e.message } }); }
});

// UPSERT
router.post('/db/upsert', async (req, res) => {
  const { table, row, onConflict } = req.body;
  if (!guard(table, res)) return;
  try {
    const cols = Object.keys(row);
    const vals = Object.values(row);
    const ph = vals.map((_, i) => `$${i + 1}`).join(', ');
    const conflictCols = Array.isArray(onConflict) ? onConflict : [onConflict];
    const conflictSet = new Set(conflictCols);
    const updateCols = cols.filter(c => !conflictSet.has(c));
    const doUpdate = updateCols.length > 0
      ? `DO UPDATE SET ${updateCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ')}`
      : 'DO NOTHING';
    const { rows } = await pool.query(
      `INSERT INTO "${table}" (${cols.map(c=>`"${c}"`).join(',')}) VALUES (${ph}) ON CONFLICT (${conflictCols.map(c=>`"${c}"`).join(',')}) ${doUpdate} RETURNING *`, vals
    );
    res.json({ data: rows, error: null });
  } catch (e) { res.json({ data: null, error: { message: e.message } }); }
});

// DELETE
router.post('/db/delete', async (req, res) => {
  const { table, filters = [] } = req.body;
  if (!guard(table, res)) return;
  if (filters.length === 0) return res.status(400).json({ data: null, error: { message: 'DELETE requires at least one filter' } });
  try {
    const params = [];
    const where = buildWhere(filters, params);
    await pool.query(`DELETE FROM "${table}"${where}`, params);
    res.json({ data: null, error: null });
  } catch (e) { res.json({ data: null, error: { message: e.message } }); }
});

module.exports = router;
