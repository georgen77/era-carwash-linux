/**
 * Google Assistant Webhook for era-carwash
 *
 * Usage (Google Assistant Actions / IFTTT Webhooks):
 *   POST /functions/v1/google-assistant-webhook
 *   Body: { "query": "какой выторг на Левитана сегодня?" }
 *   Returns: { "speech": "..." }
 *
 * For IFTTT integration:
 *   - Trigger: "Say a phrase with a text ingredient"
 *   - Phrase: "узнай у era-carwash $"
 *   - Action: Webhooks → Make a web request
 *     URL: https://wjvsdpgwhdriftevxsqp.supabase.co/functions/v1/google-assistant-webhook
 *     Method: POST
 *     Content-Type: application/json
 *     Body: {"query":"{{TextField}}"}
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://wjvsdpgwhdriftevxsqp.supabase.co';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY') || '';

async function getRecentRevenue(): Promise<string> {
  try {
    const today = new Date();
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const todayStr = fmt(today);
    const monthStart = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01`;

    const CAR_WASHES = ["Усатово", "Корсунцы", "Левитана"];
    const results: string[] = [];

    for (const washName of CAR_WASHES) {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/scrape-carwash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          washIndex: 'all',
          washName,
          dateFrom: todayStr,
          dateTo: todayStr,
          authToken: btoa('georgen77:@77negroeG'),
        }),
      });
      const json = await resp.json();
      const r = (json.results || []).find((x: any) => x.washName === washName) || json.results?.[0];
      if (r?.totalRow?.[1]) {
        results.push(`${washName}: ${parseFloat((r.totalRow[1] || '0').replace(/[^\d.,\-]/g, '').replace(',', '.'))} грн`);
      }
    }

    // Yesterday
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = fmt(yesterday);

    const yesterdayResults: string[] = [];
    for (const washName of CAR_WASHES) {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/scrape-carwash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          washIndex: 'all', washName,
          dateFrom: yesterdayStr, dateTo: yesterdayStr,
          authToken: btoa('georgen77:@77negroeG'),
        }),
      });
      const json = await resp.json();
      const r = (json.results || []).find((x: any) => x.washName === washName) || json.results?.[0];
      if (r?.totalRow?.[1]) {
        yesterdayResults.push(`${washName}: ${parseFloat((r.totalRow[1] || '0').replace(/[^\d.,\-]/g, '').replace(',', '.'))} грн`);
      }
    }

    // Month
    const monthResults: string[] = [];
    for (const washName of CAR_WASHES) {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/scrape-carwash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          washIndex: 'all', washName,
          dateFrom: monthStart, dateTo: todayStr,
          authToken: btoa('georgen77:@77negroeG'),
        }),
      });
      const json = await resp.json();
      const r = (json.results || []).find((x: any) => x.washName === washName) || json.results?.[0];
      if (r?.totalRow?.[1]) {
        monthResults.push(`${washName}: ${parseFloat((r.totalRow[1] || '0').replace(/[^\d.,\-]/g, '').replace(',', '.'))} грн`);
      }
    }

    let context = `Данные по выручке автомоек ERA (Украина):\n`;
    context += `Сегодня (${todayStr}):\n${results.join(', ')}\n`;
    context += `Вчера (${yesterdayStr}):\n${yesterdayResults.join(', ')}\n`;
    context += `С начала месяца:\n${monthResults.join(', ')}\n`;
    return context;
  } catch(e) {
    console.error('Revenue fetch error:', e);
    return 'Данные о выручке временно недоступны.';
  }
}

async function getExpensesContext(): Promise<string> {
  try {
    const today = new Date();
    const monthStart = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01`;
    const todayStr = today.toISOString().split('T')[0];

    const resp = await fetch(`${SUPABASE_URL}/rest/v1/expenses?select=wash_name,expense_type,amount,expense_date&expense_date=gte.${monthStart}&expense_date=lte.${todayStr}&order=expense_date.desc`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
    });
    const expenses = await resp.json();
    if (!Array.isArray(expenses) || expenses.length === 0) return 'Расходов за этот месяц не зафиксировано.';

    const byWash: Record<string, number> = {};
    for (const e of expenses) {
      byWash[e.wash_name] = (byWash[e.wash_name] || 0) + Number(e.amount);
    }
    return `Расходы за текущий месяц:\n` + Object.entries(byWash).map(([w, a]) => `${w}: ${a.toLocaleString('ru-RU')} грн`).join(', ');
  } catch(e) {
    return '';
  }
}

async function getAIPromptJournal(): Promise<string> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/ai_prompt_journal?select=question,description&active=eq.true&order=sort_order.asc`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
    });
    const prompts = await resp.json();
    if (!Array.isArray(prompts) || prompts.length === 0) return '';
    return `Инструкции для ответов на вопросы:\n` + prompts.map((p: any) => `- ${p.question}: ${p.description || ''}`).join('\n');
  } catch(e) {
    return '';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    // Support both Google Assistant Actions format and simple { query } format
    const query: string = body?.query
      || body?.inputs?.[0]?.rawInputs?.[0]?.query
      || body?.queryResult?.queryText
      || body?.message
      || '';

    if (!query.trim()) {
      return new Response(JSON.stringify({ speech: 'Не получил вопрос. Попробуйте снова.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[google-assistant] query: ${query}`);

    // Gather context in parallel
    const [revenueCtx, expensesCtx, promptJournalCtx] = await Promise.all([
      getRecentRevenue(),
      getExpensesContext(),
      getAIPromptJournal(),
    ]);

    const systemPrompt = `Ты — голосовой AI-помощник для сети автомоек ERA (Одесса, Украина).
Объекты: Усатово, Левитана, Корсунцы.
Отвечай на русском языке. Ответ должен быть кратким (1-3 предложения) — для голосового воспроизведения.
Не используй markdown, списки, звёздочки — только живую речь.

${revenueCtx}
${expensesCtx}
${promptJournalCtx}

Текущая дата: ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
Текущее время (Киев): ${new Date().toLocaleTimeString('ru-RU', { timeZone: 'Europe/Kiev', hour: '2-digit', minute: '2-digit' })}`;

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ speech: 'AI-сервис временно недоступен.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query },
        ],
        max_tokens: 300,
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error('AI error:', aiResp.status, errText);
      return new Response(JSON.stringify({ speech: 'Не удалось получить ответ от ИИ.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiJson = await aiResp.json();
    const speech = aiJson.choices?.[0]?.message?.content || 'Не удалось получить ответ.';

    console.log(`[google-assistant] response: ${speech}`);

    // Return in multiple formats for compatibility
    return new Response(JSON.stringify({
      speech,                          // simple format
      fulfillmentText: speech,         // Dialogflow format
      fulfillmentResponse: {           // Google Actions format
        messages: [{ text: { variants: [{ speech }] } }]
      },
      payload: { google: { expectUserResponse: false, richResponse: { items: [{ simpleResponse: { textToSpeech: speech } }] } } }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('google-assistant-webhook error:', error);
    return new Response(JSON.stringify({ speech: 'Произошла ошибка. Попробуйте позже.', error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
