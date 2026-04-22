require('dotenv').config();
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.CW_DATABASE_URL || process.env.DATABASE_URL });

const ADMIN_USERNAME = 'georgen77';

async function verifyAdmin(token) {
  if (!token) return false;
  try {
    const parts = token.split(':');
    if (parts.length < 2) return false;
    return parts[0] === ADMIN_USERNAME;
  } catch {
    return false;
  }
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendEmailCode(email, code, username) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken && chatId) {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: `🔐 Код підтвердження для ${username} (${email}): *${code}*\nДійсний 10 хвилин.`, parse_mode: 'Markdown' }),
    }).catch(() => {});
  }
  console.log(`[2FA] Code for ${username}/${email}: ${code}`);
}

router.post('/manage-users', async (req, res) => {
  try {
    const body = req.body;
    const { action, adminToken } = body;

    if (action === 'login') {
      const { username, password } = body;
      if (!username || !password) return res.json({ success: false, error: 'Введіть логін та пароль' });

      const userRes = await pool.query(
        "SELECT * FROM public.app_users WHERE username=$1 AND is_active=true",
        [username]
      );
      const user = userRes.rows[0];
      if (!user) return res.json({ success: false, error: 'Невірний логін або пароль' });

      const pwRes = await pool.query(
        "SELECT public.crypt($2, password_hash) = password_hash AS ok FROM public.app_users WHERE username=$1",
        [username, password]
      );
      if (!pwRes.rows[0]?.ok) return res.json({ success: false, error: 'Невірний логін або пароль' });

      const needs2FA = user.two_fa_enabled && (user.two_fa_required_each_login || !user.email_verified);
      if (needs2FA && user.email) {
        const code = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        await pool.query("DELETE FROM public.two_fa_codes WHERE user_id=$1 AND purpose='login' AND used=false", [user.id]);
        await pool.query(
          "INSERT INTO public.two_fa_codes (user_id, code, purpose, expires_at) VALUES ($1,$2,'login',$3)",
          [user.id, code, expiresAt]
        );
        await sendEmailCode(user.email, code, username);
        return res.json({
          success: true, requires2FA: true, userId: user.id,
          email: user.email.replace(/(.{2}).*(@.*)/, '$1***$2'),
          message: 'Код підтвердження відправлено на Email',
        });
      }

      const token = `${username}:${Date.now()}`;
      await pool.query("UPDATE public.app_users SET last_login_at=now() WHERE id=$1", [user.id]);
      return res.json({
        success: true, token, username: user.username, role: user.role,
        fullName: user.full_name, userId: user.id, biometricsEnabled: user.biometrics_enabled,
      });
    }

    if (action === 'verify_2fa') {
      const { userId, code } = body;
      const codeRes = await pool.query(
        "SELECT * FROM public.two_fa_codes WHERE user_id=$1 AND code=$2 AND used=false AND expires_at>now() ORDER BY created_at DESC LIMIT 1",
        [userId, code]
      );
      const codeRecord = codeRes.rows[0];
      if (!codeRecord) return res.json({ success: false, error: 'Невірний або застарілий код' });
      await pool.query("UPDATE public.two_fa_codes SET used=true WHERE id=$1", [codeRecord.id]);
      if (codeRecord.purpose === 'verify_email') await pool.query("UPDATE public.app_users SET email_verified=true WHERE id=$1", [userId]);
      const userRes = await pool.query("SELECT * FROM public.app_users WHERE id=$1", [userId]);
      const user = userRes.rows[0];
      if (!user) return res.json({ success: false, error: 'Користувача не знайдено' });
      await pool.query("UPDATE public.app_users SET last_login_at=now() WHERE id=$1", [userId]);
      return res.json({ success: true, token: `${user.username}:${Date.now()}`, username: user.username, role: user.role, fullName: user.full_name });
    }

    if (action === 'resend_2fa') {
      const { userId } = body;
      const userRes = await pool.query("SELECT * FROM public.app_users WHERE id=$1", [userId]);
      const user = userRes.rows[0];
      if (!user?.email) return res.json({ success: false, error: 'Email не вказано' });
      const code = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await pool.query("DELETE FROM public.two_fa_codes WHERE user_id=$1 AND used=false", [userId]);
      await pool.query("INSERT INTO public.two_fa_codes (user_id, code, purpose, expires_at) VALUES ($1,$2,'login',$3)", [userId, code, expiresAt]);
      await sendEmailCode(user.email, code, user.username);
      return res.json({ success: true, message: 'Код надіслано повторно' });
    }

    // WebAuthn stubs
    if (action === 'webauthn_register_challenge') return res.json({ success: false, error: 'WebAuthn не реалізовано' });
    if (action === 'webauthn_register') return res.json({ success: false, error: 'WebAuthn не реалізовано' });
    if (action === 'webauthn_authenticate') return res.json({ success: false, error: 'WebAuthn не реалізовано' });

    // Admin-only actions
    const isAdmin = await verifyAdmin(adminToken || '');
    if (!isAdmin) return res.status(403).json({ success: false, error: 'Доступ заборонено' });

    if (action === 'list_users') {
      const r = await pool.query(
        "SELECT id, username, full_name, email, phone, role, is_active, two_fa_enabled, two_fa_required_each_login, email_verified, biometrics_enabled, created_at, last_login_at FROM public.app_users ORDER BY created_at ASC"
      );
      return res.json({ success: true, users: r.rows });
    }

    if (action === 'create_user') {
      const { username, password, full_name, email, phone, role, two_fa_enabled, two_fa_required_each_login } = body;
      const hashRes = await pool.query("SELECT public.crypt($1, public.gen_salt('bf', 10)) AS h", [password]);
      const hash = hashRes.rows[0].h;
      const r = await pool.query(
        "INSERT INTO public.app_users (username, password_hash, full_name, email, phone, role, two_fa_enabled, two_fa_required_each_login, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
        [username, hash, full_name, email, phone, role || 'user', two_fa_enabled || false, two_fa_required_each_login || false, ADMIN_USERNAME]
      );
      return res.json({ success: true, user: r.rows[0] });
    }

    if (action === 'update_user') {
      const { userId, updates } = body;
      if (updates.password) {
        const hashRes = await pool.query("SELECT public.crypt($1, public.gen_salt('bf', 10)) AS h", [updates.password]);
        updates.password_hash = hashRes.rows[0].h;
        delete updates.password;
      }
      const fields = Object.keys(updates).map((k, i) => `${k}=$${i + 2}`).join(', ');
      const values = Object.values(updates);
      const r = await pool.query(`UPDATE public.app_users SET ${fields} WHERE id=$1 RETURNING *`, [userId, ...values]);
      return res.json({ success: true, user: r.rows[0] });
    }

    if (action === 'delete_user') {
      const { userId } = body;
      await pool.query("DELETE FROM public.app_users WHERE id=$1", [userId]);
      return res.json({ success: true });
    }

    if (action === 'list_credentials') {
      const { userId } = body;
      const r = await pool.query("SELECT id, credential_id, device_name, created_at, last_used_at FROM public.webauthn_credentials WHERE user_id=$1", [userId]);
      return res.json({ success: true, credentials: r.rows });
    }

    if (action === 'delete_credential') {
      const { credentialId } = body;
      await pool.query("DELETE FROM public.webauthn_credentials WHERE id=$1", [credentialId]);
      return res.json({ success: true });
    }

    return res.status(400).json({ success: false, error: 'Unknown action' });
  } catch (err) {
    console.error('[manage-users] error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
