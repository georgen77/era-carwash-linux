import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MovementDetails {
  from: string;
  to: string;
  items: Array<{ type: string; quantity: number }>;
  notes?: string;
  timestamp: string;
}

const locationNames: Record<string, string> = {
  piral_1: "Пераль 1",
  piral_2: "Пераль 2",
  salvador: "Сальвадор",
  dirty_linen_piral: "Пераль грязное бельё",
  dirty_linen_salvador: "Сальвадор грязное бельё",
  clean_linen_piral: "Пераль кладовка",
  clean_linen_salvador: "Сальвадор шкаф",
  albert_laundry: "Прачечная Альберт",
  purchase: "Закупка",
  damaged: "Испорченное/украденное",
};

const itemTypeNames: Record<string, string> = {
  sheets: "Простыни",
  duvet_covers: "Пододеяльники",
  pillowcases: "Наволочки",
  large_towels: "Большие полотенца",
  small_towels: "Маленькие полотенца",
  kitchen_towels: "Кухонное полотенце",
  rugs: "Коврик",
};

async function sendWhatsApp(to: string, message: string) {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = Deno.env.get('TWILIO_WHATSAPP_FROM');

  if (!accountSid || !authToken || !from) {
    throw new Error('Missing Twilio credentials');
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  
  // Ensure both From and To have whatsapp: prefix
  const fromNumber = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;
  const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  
  const params = new URLSearchParams();
  params.append('From', fromNumber);
  params.append('To', toNumber);
  params.append('Body', message);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Twilio error:', error);
    throw new Error(`Failed to send WhatsApp message: ${error}`);
  }

  return await response.json();
}

function formatMovementMessage(details: MovementDetails): string {
  const from = locationNames[details.from] || details.from;
  const to = locationNames[details.to] || details.to;
  
  let message = `🔄 *Новое перемещение белья*\n\n`;
  message += `📍 Откуда: ${from}\n`;
  message += `📍 Куда: ${to}\n`;
  message += `🕐 Время: ${new Date(details.timestamp).toLocaleString('ru-RU')}\n\n`;
  message += `📦 *Товары:*\n`;
  
  details.items.forEach(item => {
    const itemName = itemTypeNames[item.type] || item.type;
    message += `• ${itemName}: ${item.quantity} шт.\n`;
  });

  if (details.notes) {
    message += `\n📝 Заметки: ${details.notes}`;
  }

  return message;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { movementDetails, phoneNumber, movementId, to, message: directMessage } = body;

    // Support direct message mode (from EmmaCash) or movement notification mode
    const targetPhone = to || phoneNumber;
    const finalMessage = directMessage || (movementDetails ? formatMovementMessage(movementDetails) : '');

    console.log('Sending WhatsApp notification to:', targetPhone);

    if (!finalMessage) throw new Error('No message provided');

    const result = await sendWhatsApp(targetPhone, finalMessage);

    console.log('WhatsApp sent successfully:', result.sid);

    // Update movement record with success status
    if (movementId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      
      await fetch(`${supabaseUrl}/rest/v1/movements?id=eq.${movementId}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          whatsapp_status: 'sent',
          whatsapp_sent_at: new Date().toISOString()
        })
      });
    }

    return new Response(
      JSON.stringify({ success: true, messageSid: result.sid }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in send-whatsapp function:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    // Update movement record with failure status if movementId provided
    try {
      const { movementId } = await req.clone().json();
      if (movementId) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        
        await fetch(`${supabaseUrl}/rest/v1/movements?id=eq.${movementId}`, {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            whatsapp_status: 'failed'
          })
        });
      }
    } catch (updateError) {
      console.error('Error updating movement status:', updateError);
    }
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
