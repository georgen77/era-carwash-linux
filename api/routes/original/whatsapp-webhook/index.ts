import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const locationNames: Record<string, string> = {
  piral_1: 'Пераль 1',
  piral_2: 'Пераль 2',
  salvador: 'Сальвадор',
  dirty_linen_piral: 'Пераль (грязное бельё)',
  dirty_linen_salvador: 'Сальвадор (грязное бельё)',
  clean_linen_piral: 'Пераль (кладовка)',
  clean_linen_salvador: 'Сальвадор (шкаф)',
  albert_laundry: 'Прачечная Альберт',
  damaged: 'Испорченное',
  purchase: 'Закупка',
};

const itemTypeNames: Record<string, string> = {
  sheets: 'Простыни',
  duvet_covers: 'Пододеяльники',
  pillowcases: 'Наволочки',
  large_towels: 'Большие полотенца',
  small_towels: 'Маленькие полотенца',
  kitchen_towels: 'Кухонные полотенца',
  rugs: 'Коврики',
  beach_mat: 'Пляжные подстилки',
  mattress_pad: 'Наматрасники',
};

const AI_PROMPT = `You are a laundry tracking assistant for vacation rentals in Spain.
Parse the Russian message and extract linen movement data.

LOCATION RULES (girl writes only FROM, TO is always automatic):

"Пераль 1","Пераль1","П1","Оазис 1","оазис1","Piral 1","piral1","первый","первая","кв1","кв 1"
→ from_location: "piral_1", to_location: "dirty_linen_piral"

"Пераль 2","Пераль2","П2","Оазис 2","оазис2","Piral 2","piral2","второй","вторая","кв2","кв 2"
→ from_location: "piral_2", to_location: "dirty_linen_piral"

"Сальвадор","Salvador","Сальв","Салв","третий","третья","кв3","кв 3"
→ from_location: "salvador", to_location: "dirty_linen_salvador"

"Пераль 1+2","Оазис 1+2","П1+П2","обе","оба","обе квартиры","1 и 2","1+2"
→ TWO separate movements with identical items:
  1) from: "piral_1" → to: "dirty_linen_piral"
  2) from: "piral_2" → to: "dirty_linen_piral"

ITEM TYPE MAPPINGS (handle all Russian inflections and typos):
"простынь","простыни","простыня","простынь на резинке","на резинке","ризинке","резинке" → "sheets"
"пododеяльник","пуховик","пуховики","пободеяльник","пободеяльников" → "duvet_covers"
"наволочка","наволочки","наволочку","ушки","ушек" → "pillowcases"
"полотенце большое","большое полотенце","большие полотенца","большие","б.полотенца" → "large_towels"
"полотенце маленькое","маленькое полотенце","маленькие полотенца","маленькие","м.полотенца" → "small_towels"
"кухонное полотенце","кухонные полотенца","кухонные","кухонка" → "kitchen_towels"
"коврик","коврики" → "rugs"
"подстилка","пляжная подстилка","подстилки" → "beach_mat"
"наматрасник","наматрасники" → "mattress_pad"

CRITICAL RULES:
- Girl NEVER writes destination — always automatic based on source
- NEVER leave to_location null
- Numbers can be digits (2) or Russian words (два, четыре, двенадцать)
- Ignore typos in linen names
- Ignore non-linen text (greetings, notes like "забыли","не использовали")
- If location completely unclear → set needs_clarification: true
- Only include items with quantity > 0

Return ONLY valid JSON:
{
  "movements": [
    {
      "from_location": "piral_1",
      "to_location": "dirty_linen_piral",
      "apartment_name": "Пераль 1",
      "items": [
        {"item_type": "sheets", "quantity": 2},
        {"item_type": "duvet_covers", "quantity": 3}
      ]
    }
  ],
  "needs_clarification": false,
  "cleaner_hint": "name or number of sender if visible"
}

Return null if this is not a linen movement message.`;

async function parseWithClaude(text: string): Promise<{
  movements: Array<{
    from_location: string;
    to_location: string;
    apartment_name: string;
    items: Array<{ item_type: string; quantity: number }>;
  }>;
  needs_clarification: boolean;
  cleaner_hint?: string;
} | null> {
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      messages: [{ role: 'user', content: `${AI_PROMPT}\n\nMessage to parse:\n${text}` }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${err}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text?.trim();
  if (!content || content === 'null') return null;

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.movements?.length && !parsed.needs_clarification) return null;
  return parsed;
}

async function sendWhatsApp(to: string, body: string): Promise<void> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!;
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')!;
  const from = Deno.env.get('TWILIO_WHATSAPP_FROM')!;

  const fromNumber = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;
  const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

  const params = new URLSearchParams();
  params.append('From', fromNumber);
  params.append('To', toNumber);
  params.append('Body', body);

  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });
}

function buildItemsList(items: Array<{ item_type: string; quantity: number }>): string {
  return items.map(item => `• ${itemTypeNames[item.item_type] || item.item_type}: ${item.quantity}`).join('\n');
}

function buildIrinaWhatsApp(apartmentName: string, cleanerFrom: string, items: Array<{ item_type: string; quantity: number }>, fromLoc: string, toLoc: string, originalText: string): string {
  const now = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Madrid' });
  let msg = `🧺 Бельё из ${apartmentName}\n`;
  msg += `👤 ${cleanerFrom}\n\n`;
  msg += `📋 Распознано:\n`;
  msg += buildItemsList(items);
  msg += `\n\n✅ Запишем: ${locationNames[fromLoc] || fromLoc} → ${locationNames[toLoc] || toLoc}\n`;
  msg += `\n💬 Оригинал: "${originalText.substring(0, 120)}"\n`;
  msg += `⏰ ${now}\n\n`;
  msg += `Ответьте:\nДА — внести ✅\nНЕТ — отменить ❌\nИЗМЕНИТЬ — открыть форму ✏️`;
  return msg;
}

async function confirmPending(supabase: any, pendingId: string, irinaNumber: string): Promise<{ success: boolean; error?: string }> {
  const { data: pending, error } = await supabase
    .from('pending_movements')
    .select('*')
    .eq('id', pendingId)
    .single();

  if (error || !pending) return { success: false, error: 'Pending not found' };

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const res = await fetch(`${supabaseUrl}/functions/v1/bot-movement`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
    },
    body: JSON.stringify({
      from_location: pending.from_location,
      to_location: pending.to_location,
      items: pending.items,
      cleaner_name: pending.cleaner_name,
      notes: `Bot: ${pending.source}`,
      source: pending.source,
    }),
  });

  const result = await res.json();
  if (!result.success) return { success: false, error: JSON.stringify(result) };

  await supabase.from('pending_movements').update({ confirmed: true }).eq('id', pendingId);

  const now = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Madrid' });
  const confirmMsg = `✅ Внесено!\n\n📍 ${pending.apartment_name || pending.from_location}\n👤 ${pending.cleaner_name || '—'}\n\n${buildItemsList(pending.items)}\n\n⏰ ${now}`;
  await sendWhatsApp(irinaNumber, confirmMsg);

  return { success: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const irinaNumber = Deno.env.get('IRINA_WHATSAPP_NUMBER') || '';

  try {
    const contentType = req.headers.get('content-type') || '';
    let from = '';
    let messageText = '';
    let profileName = '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formText = await req.text();
      const params = new URLSearchParams(formText);
      from = params.get('From') || '';
      messageText = params.get('Body') || '';
      profileName = params.get('ProfileName') || '';
    } else {
      const json = await req.json();
      from = json.From || '';
      messageText = json.Body || '';
      profileName = json.ProfileName || '';
    }

    console.log(`WhatsApp from ${from} (${profileName}): ${messageText}`);

    if (!messageText.trim()) {
      return new Response('<Response></Response>', {
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
      });
    }

    // Normalize from number for comparison
    const fromNormalized = from.replace('whatsapp:', '');
    const irinaNormalized = irinaNumber.replace('whatsapp:', '');
    const isIrina = irinaNumber && fromNormalized === irinaNormalized;

    // Irina's reply handling
    if (isIrina) {
      const upperText = messageText.trim().toUpperCase();

      if (['ДА', 'YES', '1'].includes(upperText)) {
        const { data: latest } = await supabase
          .from('pending_movements')
          .select('*')
          .eq('confirmed', false)
          .eq('source', 'whatsapp')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latest) {
          const result = await confirmPending(supabase, latest.id, from);
          if (!result.success) await sendWhatsApp(from, `❌ Ошибка: ${result.error}`);
        } else {
          await sendWhatsApp(from, '❓ Нет ожидающих записей');
        }
        return new Response('<Response></Response>', {
          headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
        });
      }

      if (['НЕТ', 'NO', '2'].includes(upperText)) {
        const { data: latest } = await supabase
          .from('pending_movements')
          .select('*')
          .eq('confirmed', false)
          .eq('source', 'whatsapp')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latest) {
          await supabase.from('pending_movements').delete().eq('id', latest.id);
          await sendWhatsApp(from, '❌ Отменено');
        } else {
          await sendWhatsApp(from, '❓ Нет ожидающих записей');
        }
        return new Response('<Response></Response>', {
          headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
        });
      }

      if (['ИЗМЕНИТЬ', 'EDIT', '3'].includes(upperText)) {
        const { data: latest } = await supabase
          .from('pending_movements')
          .select('*')
          .eq('confirmed', false)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latest) {
          const appUrl = 'https://linen-ledger-piral.lovable.app';
          const params = new URLSearchParams({
            prefilled: 'true',
            pending_id: latest.id,
            from: latest.from_location || '',
            to: latest.to_location || '',
          });
          (latest.items || []).forEach((item: any) => {
            params.set(item.item_type, String(item.quantity));
          });
          if (latest.cleaner_name) params.set('cleaner', latest.cleaner_name);
          await sendWhatsApp(from, `✏️ Форма редактирования:\n${appUrl}?${params.toString()}`);
        }
        return new Response('<Response></Response>', {
          headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
        });
      }
    }

    // Parse with Claude AI (for cleaners' messages)
    let parsed;
    try {
      parsed = await parseWithClaude(messageText);
    } catch (err) {
      console.error('Claude parsing error:', err);
      return new Response('<Response></Response>', {
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
      });
    }

    if (!parsed) {
      console.log('Not a linen movement message, skipping');
      return new Response('<Response></Response>', {
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
      });
    }

    const cleanerName = parsed.cleaner_hint || profileName || from;

    // Handle needs_clarification
    if (parsed.needs_clarification || !parsed.movements?.length) {
      if (irinaNumber) {
        await sendWhatsApp(irinaNumber,
          `⚠️ Не определён апартамент!\n👤 ${cleanerName}: "${messageText.substring(0, 120)}"\nОтветьте: П1, П2 или САЛ`
        );
      }
      return new Response('<Response></Response>', {
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
      });
    }

    // Save each movement as pending and notify Irina
    for (const movement of parsed.movements) {
      // Upsert if same from_location + chat_id pending exists
      const { data: existing } = await supabase
        .from('pending_movements')
        .select('id')
        .eq('from_location', movement.from_location)
        .eq('chat_id', from)
        .eq('confirmed', false)
        .maybeSingle();

      let pendingId: string;

      if (existing) {
        await supabase.from('pending_movements').update({
          items: movement.items,
          apartment_name: movement.apartment_name,
          original_message: messageText,
          cleaner_name: cleanerName,
        }).eq('id', existing.id);
        pendingId = existing.id;
      } else {
        const { data: inserted } = await supabase.from('pending_movements').insert({
          from_location: movement.from_location,
          to_location: movement.to_location,
          items: movement.items,
          apartment_name: movement.apartment_name,
          original_message: messageText,
          cleaner_name: cleanerName,
          source: 'whatsapp',
          chat_id: from,
          needs_clarification: false,
        }).select().single();
        pendingId = inserted?.id;
      }

      if (!pendingId || !irinaNumber) continue;

      const irinaMsg = buildIrinaWhatsApp(
        movement.apartment_name,
        cleanerName,
        movement.items,
        movement.from_location,
        movement.to_location,
        messageText,
      );

      await sendWhatsApp(irinaNumber, irinaMsg);
    }

    return new Response('<Response></Response>', {
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
    });

  } catch (err) {
    console.error('whatsapp-webhook error:', err);
    return new Response('<Response></Response>', {
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
    });
  }
});
