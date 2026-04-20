const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { to, subject, html, text } = await req.json();

    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) throw new Error('Missing RESEND_API_KEY');

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'ERA Apartments <onboarding@resend.dev>',
        to: Array.isArray(to) ? to : [to],
        subject,
        html: html || `<pre style="font-family:sans-serif;white-space:pre-wrap">${text}</pre>`,
        text: text || '',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Resend error:', data);
      throw new Error(data.message || 'Failed to send email');
    }

    console.log('Email sent:', data.id);
    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('send-email error:', msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
