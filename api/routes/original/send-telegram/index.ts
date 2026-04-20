import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { chat_id, text, bot_token } = await req.json();

    if (!chat_id || !text) {
      return new Response(JSON.stringify({ error: 'chat_id and text required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use provided bot_token or fall back to env secret
    const token = bot_token || Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!token) {
      return new Response(JSON.stringify({ error: 'No Telegram bot token configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id,
        text,
        parse_mode: 'Markdown',
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      return new Response(JSON.stringify({ error: data.description || 'Telegram API error' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, message_id: data.result?.message_id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
