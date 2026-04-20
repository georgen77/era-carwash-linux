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
    console.log('[restore-movements] starting restore');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: backupData } = await req.json();

    if (!backupData || !Array.isArray(backupData)) {
      throw new Error('Invalid backup data format');
    }

    console.log(`[restore-movements] restoring ${backupData.length} records`);

    // Clear existing movements
    const { error: deleteError } = await supabase
      .from('movements')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (deleteError) throw deleteError;

    // Insert backup data
    const { error: insertError } = await supabase
      .from('movements')
      .insert(backupData);

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({
        success: true,
        restored_records: backupData.length,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  } catch (error) {
    console.error('[restore-movements] error', error);
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
