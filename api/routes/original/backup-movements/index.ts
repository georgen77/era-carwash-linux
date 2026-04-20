import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  try {
    console.log('[backup-movements] starting backup');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch all movements
    const { data: movements, error } = await supabase
      .from('movements')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;

    console.log(`[backup-movements] fetched ${movements?.length || 0} records`);

    return new Response(
      JSON.stringify(
        {
          backup_date: new Date().toISOString(),
          total_records: movements?.length || 0,
          data: movements,
        },
        null,
        2
      ),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  } catch (error) {
    console.error('[backup-movements] error', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }
});