import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, userId, bookingId, bookingData, cleaningData } = await req.json();

    console.log('Action:', action, 'UserId:', userId);

    // Verify user exists and is active
    const { data: user, error: userError } = await supabase
      .from('cleaning_users')
      .select('id, role, is_active')
      .eq('id', userId)
      .eq('is_active', true)
      .single();

    if (userError || !user) {
      throw new Error('User not found or inactive');
    }

    // Check permissions for admin-only actions
    const isAdminOrCoordinator = user.role === 'admin' || user.role === 'coordinator';

    switch (action) {
      case 'create': {
        // Only coordinators and admins can create bookings
        if (!isAdminOrCoordinator) {
          throw new Error('Insufficient permissions');
        }

        // Insert booking
        const { data: booking, error: bookingError } = await supabase
          .from('bookings')
          .insert(bookingData)
          .select()
          .single();

        if (bookingError) {
          console.error('Booking error:', bookingError);
          throw bookingError;
        }

        // Create cleaning if provided
        if (cleaningData) {
          const { error: cleaningError } = await supabase
            .from('cleanings')
            .insert(cleaningData);

          if (cleaningError) {
            console.error('Cleaning error:', cleaningError);
            // Rollback booking
            await supabase.from('bookings').delete().eq('id', booking.id);
            throw cleaningError;
          }
        }

        return new Response(
          JSON.stringify({ success: true, booking }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'delete': {
        // Only admins can delete bookings
        if (user.role !== 'admin') {
          throw new Error('Only admins can delete bookings');
        }

        const { error } = await supabase
          .from('bookings')
          .delete()
          .eq('id', bookingId);

        if (error) {
          console.error('Delete error:', error);
          throw error;
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        throw new Error('Invalid action');
    }
  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
