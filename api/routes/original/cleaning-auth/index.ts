import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { username, password } = await req.json();
    
    const login = (username ?? '').toString().trim();
    const pwd = (password ?? '').toString().trim();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find user by username or full name (case-insensitive), only active users
    const { data: users, error: userError } = await supabase
      .from('cleaning_users')
      .select('*')
      .or(`username.ilike.${login},full_name.ilike.${login}`)
      .eq('is_active', true)
      .limit(1);

    const user = users?.[0] ?? null;

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Неверное имя пользователя или пароль' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }

    // Check password (simple comparison for now)
    if (user.password_hash !== pwd) {
      return new Response(
        JSON.stringify({ error: 'Неверное имя пользователя или пароль' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }

    // Return user data without password
    const { password_hash, ...userData } = user;
    
    return new Response(
      JSON.stringify({ 
        user: userData,
        message: 'Успешный вход'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in cleaning-auth:', error);
    return new Response(
      JSON.stringify({ error: 'Внутренняя ошибка сервера' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
