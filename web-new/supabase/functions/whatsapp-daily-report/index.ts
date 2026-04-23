const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CAR_WASHES = [
  { name: "Усатово", baseUrl: "https://sim5.gteh.com.ua", login: "odessa8", password: "odessa828122020" },
  { name: "Корсунцы", baseUrl: "https://sim4.gteh.com.ua", login: "krasnosilka", password: "krasnosilka221119" },
  { name: "Левитана", baseUrl: "https://sim5.gteh.com.ua", login: "odesa11", password: "dimakalinin" },
];

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function fetchRevenue(washName: string, dateFrom: string, dateTo: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://wjvsdpgwhdriftevxsqp.supabase.co';
  // Use standard revenue report (same as dashboard/AI) — has 'за безготівку' column
  const resp = await fetch(`${supabaseUrl}/functions/v1/scrape-carwash`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      washIndex: 'all',
      washName,
      dateFrom,
      dateTo,
      authToken: btoa('georgen77:@77negroeG'),
    }),
  });
  const json = await resp.json();
  // find the result matching this washName
  return (json.results || []).find((r: any) => r.washName === washName) || json.results?.[0];
}

function parseNum(s: string): number {
  return parseFloat((s || '0').replace(/[^\d.,\-]/g, '').replace(',', '.')) || 0;
}

function findCashlessIdx(headers: string[]): number {
  const candidates = ['за безготівку', 'за безгот', 'безготівкова', 'безготівка', 'безнал', 'картка', 'cashless', 'безгот'];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase().trim();
    if (candidates.some(c => h.includes(c))) return i;
  }
  return -1;
}

async function sendTelegramTo(chatId: string, message: string) {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN not configured');
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Telegram error [${resp.status}]: ${err}`);
  }
  return await resp.json();
}

async function sendTelegram(message: string) {
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
  if (!chatId) throw new Error('TELEGRAM_CHAT_ID not configured');
  return sendTelegramTo(chatId, message);
}

async function getRecipientsFromDB(recipientId?: string): Promise<{telegram_chat_id: string; name: string}[]> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://wjvsdpgwhdriftevxsqp.supabase.co';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';

  if (recipientId) {
    // Specific recipient requested (manual send for one person)
    const url = `${supabaseUrl}/rest/v1/notification_recipients?select=name,telegram_chat_id&id=eq.${recipientId}`;
    const resp = await fetch(url, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } });
    const data = await resp.json();
    return Array.isArray(data) ? data.filter((r: any) => r.telegram_chat_id) : [];
  }

  // No specific recipient — only send to recipients who have an ACTIVE schedule right now (scheduled send)
  // This prevents broadcasting to ALL recipients when called without a specific target.
  // Get all active schedules and collect their unique recipient_ids
  const schedulesUrl = `${supabaseUrl}/rest/v1/notification_schedules?select=recipient_id,recipient:notification_recipients(name,telegram_chat_id)&active=eq.true`;
  const schedResp = await fetch(schedulesUrl, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } });
  const schedules = await schedResp.json();

  if (!Array.isArray(schedules) || schedules.length === 0) return [];

  // Deduplicate by telegram_chat_id
  const seen = new Set<string>();
  const recipients: {telegram_chat_id: string; name: string}[] = [];
  for (const s of schedules) {
    const r = s.recipient;
    if (r?.telegram_chat_id && !seen.has(r.telegram_chat_id)) {
      seen.add(r.telegram_chat_id);
      recipients.push({ name: r.name, telegram_chat_id: r.telegram_chat_id });
    }
  }
  return recipients;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const recipientId = body?.recipientId;
    const now = new Date();
    const todayStr = fmt(now);
    const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
    const daysPassed = now.getDate();

    const monthName = now.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });

    let todayTotalAll = 0;
    let monthTotalAll = 0;
    const lines: string[] = [];

    lines.push(`🚗 *Ежедневный отчёт по выручке*`);
    lines.push(`📅 ${now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`);
    lines.push('');

    for (const wash of CAR_WASHES) {
      let todayTotal = 0;
      let todayCashless = 0;
      let monthTotal = 0;
      let monthCashless = 0;

      try {
        const todayReport = await fetchRevenue(wash.name, todayStr, todayStr);
        todayTotal = parseNum(todayReport?.totalRow?.[1] || '0');
        const cashlessIdx = findCashlessIdx(todayReport?.headers || []);
        console.log(`[${wash.name}] today headers:`, todayReport?.headers, 'cashlessIdx:', cashlessIdx, 'totalRow:', todayReport?.totalRow);
        todayCashless = cashlessIdx >= 0 ? parseNum(todayReport?.totalRow?.[cashlessIdx] || '0') : 0;
      } catch(e) {
        console.error(`Today fetch error for ${wash.name}:`, e);
      }

      try {
        const monthReport = await fetchRevenue(wash.name, monthStart, todayStr);
        monthTotal = parseNum(monthReport?.totalRow?.[1] || '0');
        const cashlessIdx = findCashlessIdx(monthReport?.headers || []);
        monthCashless = cashlessIdx >= 0 ? parseNum(monthReport?.totalRow?.[cashlessIdx] || '0') : 0;
      } catch(e) {
        console.error(`Month fetch error for ${wash.name}:`, e);
      }

      todayTotalAll += todayTotal;
      monthTotalAll += monthTotal;

      const todayCashlessPct = todayTotal > 0 ? Math.round(todayCashless / todayTotal * 100) : 0;

      lines.push(`*${wash.name}*`);
      lines.push(`  За сегодня: ${todayTotal.toLocaleString('ru-RU')} грн (безнал: ${todayCashless.toLocaleString('ru-RU')} грн, ${todayCashlessPct}%)`);
      lines.push(`  С начала месяца: ${monthTotal.toLocaleString('ru-RU')} грн`);
    }

    lines.push('');
    lines.push(`*📊 ИТОГО ВСЕ МОЙКИ*`);
    lines.push(`  За сегодня: ${todayTotalAll.toLocaleString('ru-RU')} грн`);
    lines.push(`  С начала ${monthName}: ${monthTotalAll.toLocaleString('ru-RU')} грн`);

    // Forecast
    if (daysPassed > 0) {
      const projected = Math.round(monthTotalAll / daysPassed * daysInMonth);
      lines.push(`  Прогноз на месяц: ~${projected.toLocaleString('ru-RU')} грн (${daysPassed}/${daysInMonth} дней)`);
    }

    const message = lines.join('\n');

    // Get recipients from DB or use default TELEGRAM_CHAT_ID
    const dbRecipients = await getRecipientsFromDB(recipientId).catch(() => []);
    
    let sentCount = 0;
    if (dbRecipients.length > 0) {
      for (const r of dbRecipients) {
        try {
          await sendTelegramTo(r.telegram_chat_id, message);
          sentCount++;
        } catch(e) {
          console.error(`Failed to send to ${r.name}:`, e);
        }
      }
    } else {
      // fallback to env var
      await sendTelegram(message);
      sentCount = 1;
    }

    console.log(`Report sent to ${sentCount} recipients`);

    return new Response(JSON.stringify({ success: true, message: `Report sent to ${sentCount} recipients`, preview: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('whatsapp-daily-report error:', error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
