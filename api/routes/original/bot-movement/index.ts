import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_LOCATIONS = [
  'piral_1', 'piral_2', 'salvador',
  'dirty_linen_piral', 'dirty_linen_salvador',
  'clean_linen_piral', 'clean_linen_salvador',
  'albert_laundry', 'damaged', 'purchase',
] as const;

const VALID_ITEM_TYPES = [
  'sheets', 'duvet_covers', 'pillowcases',
  'large_towels', 'small_towels', 'kitchen_towels',
  'rugs', 'beach_mat', 'mattress_pad',
] as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { from_location, to_location, items, notes, source } = body;

    // Validate required fields
    if (!from_location || !to_location || !Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: 'from_location, to_location, and items[] are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!VALID_LOCATIONS.includes(from_location) || !VALID_LOCATIONS.includes(to_location)) {
      return new Response(JSON.stringify({ 
        error: `Invalid location. Valid values: ${VALID_LOCATIONS.join(', ')}` 
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate items
    for (const item of items) {
      if (!item.item_type || !VALID_ITEM_TYPES.includes(item.item_type)) {
        return new Response(JSON.stringify({ 
          error: `Invalid item_type: ${item.item_type}. Valid values: ${VALID_ITEM_TYPES.join(', ')}` 
        }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!item.quantity || item.quantity <= 0) {
        return new Response(JSON.stringify({ error: `Invalid quantity for ${item.item_type}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const now = new Date().toISOString();
    const rows = items.map((item: { item_type: string; quantity: number }) => ({
      from_location,
      to_location,
      item_type: item.item_type,
      quantity: item.quantity,
      notes: notes ? `${notes}${source ? ` [via ${source}]` : ''}` : (source ? `[via ${source}]` : null),
      created_at: now,
    }));

    const { data, error } = await supabase
      .from('movements')
      .insert(rows)
      .select('id');

    if (error) {
      console.error('Insert error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      inserted: data.length,
      movement_ids: data.map((r: { id: string }) => r.id),
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('bot-movement error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
