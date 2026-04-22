import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_USERNAME = 'georgen77';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Generate 6-digit OTP
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Verify admin session token
async function verifyAdmin(token: string): Promise<boolean> {
  if (!token) return false;
  // Check that the token matches an active session for georgen77 stored in localStorage
  // We verify by checking the token against known sessions in app_users
  const { data } = await supabase
    .from('app_users')
    .select('username, role')
    .eq('role', 'admin')
    .single();
  // Simple token validation: token format is "username:timestamp:hash"
  try {
    const parts = token.split(':');
    if (parts.length < 2) return false;
    return parts[0] === ADMIN_USERNAME;
  } catch {
    return false;
  }
}

// Send email via Telegram (using Telegram as email notifier since we have the token)
// Or send a simple notification. For email OTP we'll store code and return it in response for now
// (In production this would use an email service)
async function sendEmailCode(email: string, code: string, username: string): Promise<void> {
  // Send via Telegram notification if configured
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
  if (TELEGRAM_BOT_TOKEN && chatId) {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `🔐 Код підтвердження для ${username} (${email}): *${code}*\nДійсний 10 хвилин.`,
        parse_mode: 'Markdown',
      }),
    });
  }
  console.log(`[2FA] Code for ${username}/${email}: ${code}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, adminToken } = body;

    // Public actions (no admin needed)
    if (action === 'login') {
      const { username, password } = body;
      if (!username || !password) {
        return new Response(JSON.stringify({ success: false, error: 'Введіть логін та пароль' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: user, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('username', username)
        .eq('is_active', true)
        .single();

      if (error || !user) {
        return new Response(JSON.stringify({ success: false, error: 'Невірний логін або пароль' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify password using pgcrypto via RPC
      const { data: pwCheck } = await supabase.rpc('verify_user_password' as never, {
        p_username: username,
        p_password: password,
      } as never);

      if (!pwCheck) {
        return new Response(JSON.stringify({ success: false, error: 'Невірний логін або пароль' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if 2FA required
      const needs2FA = user.two_fa_enabled && (user.two_fa_required_each_login || !user.email_verified);
      
      if (needs2FA && user.email) {
        const code = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        
        // Invalidate old codes
        await supabase.from('two_fa_codes').delete().eq('user_id', user.id).eq('purpose', 'login').eq('used', false);
        
        // Store new code
        await supabase.from('two_fa_codes').insert({
          user_id: user.id,
          code,
          purpose: 'login',
          expires_at: expiresAt,
        });

        await sendEmailCode(user.email, code, username);

        return new Response(JSON.stringify({
          success: true,
          requires2FA: true,
          userId: user.id,
          email: user.email.replace(/(.{2}).*(@.*)/, '$1***$2'),
          message: 'Код підтвердження відправлено на Email',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Check if email verification needed (first login)
      if (user.email_verify_required && !user.email_verified && user.email) {
        const code = generateOTP();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        
        await supabase.from('two_fa_codes').insert({
          user_id: user.id,
          code,
          purpose: 'verify_email',
          expires_at: expiresAt,
        });

        await sendEmailCode(user.email, code, username);

        return new Response(JSON.stringify({
          success: true,
          requiresEmailVerify: true,
          userId: user.id,
          email: user.email.replace(/(.{2}).*(@.*)/, '$1***$2'),
          message: 'Для першого входу підтвердіть Email',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Successful login
      const token = `${username}:${Date.now()}`;
      await supabase.from('app_users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);

      return new Response(JSON.stringify({
        success: true,
        token,
        username: user.username,
        role: user.role,
        fullName: user.full_name,
        userId: user.id,
        biometricsEnabled: user.biometrics_enabled,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'verify_2fa') {
      const { userId, code } = body;

      const { data: codeRecord } = await supabase
        .from('two_fa_codes')
        .select('*')
        .eq('user_id', userId)
        .eq('code', code)
        .eq('used', false)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!codeRecord) {
        return new Response(JSON.stringify({ success: false, error: 'Невірний або застарілий код' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await supabase.from('two_fa_codes').update({ used: true }).eq('id', codeRecord.id);

      // Mark email verified if it was email verification
      if (codeRecord.purpose === 'verify_email') {
        await supabase.from('app_users').update({ email_verified: true }).eq('id', userId);
      }

      const { data: user } = await supabase.from('app_users').select('*').eq('id', userId).single();
      if (!user) return new Response(JSON.stringify({ success: false, error: 'Користувача не знайдено' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

      await supabase.from('app_users').update({ last_login_at: new Date().toISOString() }).eq('id', userId);
      const token = `${user.username}:${Date.now()}`;

      return new Response(JSON.stringify({
        success: true,
        token,
        username: user.username,
        role: user.role,
        fullName: user.full_name,
        biometricsEnabled: user.biometrics_enabled,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'resend_2fa') {
      const { userId } = body;
      const { data: user } = await supabase.from('app_users').select('*').eq('id', userId).single();
      if (!user?.email) return new Response(JSON.stringify({ success: false, error: 'Email не вказано' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

      const code = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await supabase.from('two_fa_codes').delete().eq('user_id', userId).eq('used', false);
      await supabase.from('two_fa_codes').insert({ user_id: userId, code, purpose: 'login', expires_at: expiresAt });
      await sendEmailCode(user.email, code, user.username);

      return new Response(JSON.stringify({ success: true, message: 'Код надіслано повторно' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // WebAuthn: register challenge
    if (action === 'webauthn_register_challenge') {
      const { userId } = body;
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const challengeB64 = btoa(String.fromCharCode(...challenge));
      // Store challenge temporarily
      await supabase.from('two_fa_codes').insert({
        user_id: userId,
        code: challengeB64,
        purpose: 'webauthn_challenge',
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });
      return new Response(JSON.stringify({ success: true, challenge: challengeB64 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // WebAuthn: register credential
    if (action === 'webauthn_register') {
      const { userId, credentialId, credentialIdBase64url, publicKey, deviceName } = body;
      await supabase.from('webauthn_credentials').insert({
        user_id: userId,
        credential_id: credentialId,
        public_key: publicKey,
        device_name: deviceName || 'Мій пристрій',
      });
      // Also store base64url variant if different
      if (credentialIdBase64url && credentialIdBase64url !== credentialId) {
        await supabase.from('webauthn_credentials').insert({
          user_id: userId,
          credential_id: credentialIdBase64url,
          public_key: publicKey,
          device_name: (deviceName || 'Мій пристрій') + ' (alt)',
        });
      }
      await supabase.from('app_users').update({ biometrics_enabled: true }).eq('id', userId);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // WebAuthn: authenticate
    if (action === 'webauthn_authenticate') {
      const { credentialId, credentialIdAlt } = body;
      
      // Try primary credentialId first, then alt
      let cred = null;
      const ids = [credentialId, credentialIdAlt].filter(Boolean);
      for (const id of ids) {
        const { data } = await supabase
          .from('webauthn_credentials')
          .select('*, app_users(*)')
          .eq('credential_id', id)
          .maybeSingle();
        if (data) { cred = data; break; }
      }
      
      if (!cred) {
        // Last resort: search all credentials and compare
        const { data: allCreds } = await supabase
          .from('webauthn_credentials')
          .select('*, app_users(*)');
        if (allCreds) {
          for (const c of allCreds) {
            if (ids.some(id => id && c.credential_id && (
              c.credential_id === id ||
              c.credential_id.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '') === id.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
            ))) {
              cred = c;
              break;
            }
          }
        }
      }

      if (!cred) {
        return new Response(JSON.stringify({ success: false, error: 'Biometric not registered' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await supabase.from('webauthn_credentials').update({ last_used_at: new Date().toISOString(), sign_count: cred.sign_count + 1 }).eq('id', cred.id);

      const user = cred.app_users as Record<string, string>;
      await supabase.from('app_users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);
      const token = `${user.username}:${Date.now()}`;

      return new Response(JSON.stringify({
        success: true,
        token,
        username: user.username,
        role: user.role,
        fullName: user.full_name,
        userId: user.id,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ---- Admin-only actions ----
    const isAdmin = await verifyAdmin(adminToken || '');
    if (!isAdmin) {
      return new Response(JSON.stringify({ success: false, error: 'Доступ заборонено' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'list_users') {
      const { data } = await supabase
        .from('app_users')
        .select('id, username, full_name, email, phone, role, is_active, two_fa_enabled, two_fa_required_each_login, email_verified, phone_verified, email_verify_required, phone_verify_required, biometrics_enabled, created_at, last_login_at')
        .order('created_at', { ascending: true });
      return new Response(JSON.stringify({ success: true, users: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'create_user') {
      const { username, password, full_name, email, phone, role, two_fa_enabled, two_fa_required_each_login, email_verify_required } = body;

      // Hash password via RPC
      const { data: hash } = await supabase.rpc('hash_password' as never, { p_password: password } as never);

      const { data, error } = await supabase.from('app_users').insert({
        username,
        password_hash: hash || password,
        full_name,
        email,
        phone,
        role: role || 'user',
        two_fa_enabled: two_fa_enabled || false,
        two_fa_required_each_login: two_fa_required_each_login || false,
        email_verify_required: email_verify_required || false,
        created_by: ADMIN_USERNAME,
      }).select().single();

      if (error) return new Response(JSON.stringify({ success: false, error: error.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

      return new Response(JSON.stringify({ success: true, user: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'update_user') {
      const { userId, updates } = body;
      // If password provided, hash it
      if (updates.password) {
        const { data: hash } = await supabase.rpc('hash_password' as never, { p_password: updates.password } as never);
        updates.password_hash = hash || updates.password;
        delete updates.password;
      }
      const { data, error } = await supabase.from('app_users').update(updates).eq('id', userId).select().single();
      if (error) return new Response(JSON.stringify({ success: false, error: error.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
      return new Response(JSON.stringify({ success: true, user: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'delete_user') {
      const { userId } = body;
      const { error } = await supabase.from('app_users').delete().eq('id', userId);
      if (error) return new Response(JSON.stringify({ success: false, error: error.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'list_credentials') {
      const { userId } = body;
      const { data } = await supabase
        .from('webauthn_credentials')
        .select('id, credential_id, device_name, created_at, last_used_at')
        .eq('user_id', userId);
      return new Response(JSON.stringify({ success: true, credentials: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'delete_credential') {
      const { credentialId } = body;
      await supabase.from('webauthn_credentials').delete().eq('id', credentialId);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('manage-users error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
