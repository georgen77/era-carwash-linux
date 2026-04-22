require('dotenv').config();
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.CW_DATABASE_URL || process.env.DATABASE_URL });

async function authenticate(username, password) {
  const r = await pool.query(
    "SELECT id, role FROM public.app_users WHERE username=$1 AND is_active=true AND public.crypt($2, password_hash) = password_hash",
    [username, password]
  );
  return r.rows[0] || null;
}

function requireAdmin(req, res, next) {
  const username = req.headers['x-username'];
  const password = req.headers['x-password'];
  if (!username || !password) return res.status(401).json({ success: false, error: 'Потрібна авторизація' });
  authenticate(username, password).then(user => {
    if (!user) return res.status(401).json({ success: false, error: 'Невірний логін або пароль' });
    if (user.role !== 'admin') return res.status(403).json({ success: false, error: 'Доступ заборонено' });
    req.adminUser = user;
    next();
  }).catch(err => res.status(500).json({ success: false, error: err.message }));
}

// Login
router.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, error: 'Введіть логін та пароль' });
    const r = await pool.query(
      "SELECT id, username, full_name, role FROM public.app_users WHERE username=$1 AND is_active=true AND public.crypt($2, password_hash) = password_hash",
      [username, password]
    );
    const user = r.rows[0];
    if (!user) return res.status(401).json({ success: false, error: 'Невірний логін або пароль' });
    await pool.query("UPDATE public.app_users SET last_login_at=now() WHERE id=$1", [user.id]);
    const token = Buffer.from(`${username}:${Date.now()}`).toString('base64');
    res.json({ success: true, token, username: user.username, fullName: user.full_name, role: user.role, userId: user.id });
  } catch (err) {
    console.error('[auth/login] error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// List users (admin only)
router.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT id, username, full_name, email, phone, role, is_active, created_at, last_login_at FROM public.app_users ORDER BY created_at ASC"
    );
    res.json({ success: true, users: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Set password
router.post('/admin/users/set-password', requireAdmin, async (req, res) => {
  try {
    const { userId, password } = req.body;
    if (!userId || !password) return res.status(400).json({ success: false, error: 'userId and password required' });
    await pool.query(
      "UPDATE public.app_users SET password_hash=public.crypt($2, public.gen_salt('bf', 10)), updated_at=now() WHERE id=$1",
      [userId, password]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create user
router.post('/admin/users/create', requireAdmin, async (req, res) => {
  try {
    const { username, password, full_name, email, phone, role } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, error: 'username and password required' });
    const r = await pool.query(
      "INSERT INTO public.app_users (username, password_hash, full_name, email, phone, role, created_by) VALUES ($1, public.crypt($2, public.gen_salt('bf',10)), $3,$4,$5,$6,$7) RETURNING id, username, role",
      [username, password, full_name || null, email || null, phone || null, role || 'user', req.headers['x-username']]
    );
    res.json({ success: true, user: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, error: 'Користувач вже існує' });
    res.status(500).json({ success: false, error: err.message });
  }
});

// Toggle active
router.post('/admin/users/toggle', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
    const r = await pool.query("UPDATE public.app_users SET is_active=NOT is_active WHERE id=$1 RETURNING is_active", [userId]);
    res.json({ success: true, isActive: r.rows[0]?.is_active });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Set role
router.post('/admin/users/set-role', requireAdmin, async (req, res) => {
  try {
    const { userId, role } = req.body;
    if (!userId || !role) return res.status(400).json({ success: false, error: 'userId and role required' });
    const allowed = ['admin', 'manager', 'user', 'viewer'];
    if (!allowed.includes(role)) return res.status(400).json({ success: false, error: 'Invalid role' });
    await pool.query("UPDATE public.app_users SET role=$2 WHERE id=$1", [userId, role]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
