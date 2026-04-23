const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CAR_WASHES = [
  { name: "Усатово", baseUrl: "https://sim5.gteh.com.ua", login: "odessa8", password: "odessa828122020" },
  { name: "Корсунцы", baseUrl: "https://sim4.gteh.com.ua", login: "krasnosilka", password: "krasnosilka221119" },
  { name: "Левитана", baseUrl: "https://sim5.gteh.com.ua", login: "odesa11", password: "dimakalinin" },
];

const USERS: Record<string, string> = {
  georgen77: '@77negroeG',
  dima: 'kalinin',
};

function verifyAuth(authToken: string): boolean {
  try {
    const decoded = atob(authToken);
    const username = decoded.split(':')[0];
    return !!USERS[username];
  } catch { return false; }
}

function extractAllCookies(response: Response): Record<string, string> {
  const cookies: Record<string, string> = {};
  const setCookieHeaders = response.headers.getSetCookie?.() || [];
  for (const header of setCookieHeaders) {
    const nameVal = header.split(';')[0];
    const eq = nameVal.indexOf('=');
    if (eq > 0) cookies[nameVal.substring(0, eq).trim()] = nameVal.substring(eq + 1);
  }
  if (Object.keys(cookies).length === 0) {
    const raw = response.headers.get('set-cookie');
    if (raw) {
      const parts = raw.split(/,(?=\s*[a-zA-Z_]+=)/);
      for (const part of parts) {
        const nameVal = part.split(';')[0].trim();
        const eq = nameVal.indexOf('=');
        if (eq > 0) cookies[nameVal.substring(0, eq).trim()] = nameVal.substring(eq + 1);
      }
    }
  }
  return cookies;
}

function cookieString(cookies: Record<string, string>): string {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function loginAndGetSession(config: typeof CAR_WASHES[0]) {
  const jar: Record<string, string> = {};
  const addCookies = (resp: Response) => Object.assign(jar, extractAllCookies(resp));
  const loginPageUrl = `${config.baseUrl}/sim4/login`;
  const pageResp = await fetch(loginPageUrl);
  addCookies(pageResp);
  const pageHtml = await pageResp.text();
  const csrf = pageHtml.match(/name="_token"\s+value="([^"]+)"/)?.[1] || '';
  const form = new URLSearchParams();
  form.append('login', config.login);
  form.append('password', config.password);
  if (csrf) form.append('_token', csrf);
  const loginResp = await fetch(loginPageUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookieString(jar) },
    body: form.toString(),
    redirect: 'manual',
  });
  addCookies(loginResp);
  if (loginResp.status === 302) {
    const redirectUrl = loginResp.headers.get('location') || `${config.baseUrl}/sim4`;
    const redirectResp = await fetch(redirectUrl, { headers: { 'Cookie': cookieString(jar) }, redirect: 'follow' });
    addCookies(redirectResp);
  }
  return { jar };
}

async function fetchFullSummaryViaEdge(washName: string, dateFrom: string, dateTo: string, authToken: string): Promise<{ headers: string[]; rows: string[][]; totalRow: string[] }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://wjvsdpgwhdriftevxsqp.supabase.co';
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqdnNkcGd3aGRyaWZ0ZXZ4c3FwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MTgzOTcsImV4cCI6MjA4NzE5NDM5N30.RBeyNzninPqQVpQqbzYsdD6v9mKLnKSGNAfKpLeFr2I';
  const resp = await fetch(`${supabaseUrl}/functions/v1/scrape-carwash`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
    body: JSON.stringify({ reportType: 'fullSummary', washName, dateFrom, dateTo, authToken }),
  });
  const json = await resp.json();
  if (!json.success || !json.results?.[0]) return { headers: [], rows: [], totalRow: [] };
  return json.results[0];
}

// Fetch analytics table via AJAX POST (same approach as scrape-carwash)
async function fetchAnalyticsTable(config: typeof CAR_WASHES[0], jar: Record<string, string>) {
  // First get CSRF token from states page
  const statesUrl = `${config.baseUrl}/sim4/states`;
  const statesResp = await fetch(statesUrl, { headers: { 'Cookie': cookieString(jar) }, redirect: 'follow' });
  Object.assign(jar, extractAllCookies(statesResp));
  const statesHtml = await statesResp.text();
  const csrf = statesHtml.match(/meta\s+name="csrf-token"\s+content="([^"]+)"/)?.[1]
    || statesHtml.match(/name="_token"\s+value="([^"]+)"/)?.[1]
    || '';

  // POST to analytics endpoint
  const analyticsUrl = `${config.baseUrl}/sim4/states/analytics`;
  const resp = await fetch(analyticsUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieString(jar),
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRF-TOKEN': csrf,
    },
    body: new URLSearchParams({ '_token': csrf }).toString(),
    redirect: 'follow',
  });
  Object.assign(jar, extractAllCookies(resp));
  const html = await resp.text();

  // Parse table with row color detection
  const headers: string[] = [];
  const rows: string[][] = [];
  // rawCells: per-cell metadata for problem detection
  const rawCells: { text: string; isRed: boolean; isNeedCollection: boolean; collectionTime: string }[][] = [];

  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/);
  if (!tableMatch) return { headers, rows, rawCells };

  const tableHtml = tableMatch[0];

  // Parse headers (check both thead>th and thead>td)
  const theadMatch = tableHtml.match(/<thead[^>]*>([\s\S]*?)<\/thead>/);
  if (theadMatch) {
    const cellRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g;
    let m;
    while ((m = cellRegex.exec(theadMatch[1])) !== null) {
      headers.push(m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    }
  }

  const tbodyMatch = tableHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  if (tbodyMatch) {
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let trMatch;
    while ((trMatch = trRegex.exec(tbodyMatch[1])) !== null) {
      const tdRegex = /<td([^>]*)>([\s\S]*?)<\/td>/g;
      let tdMatch;
      const cells: string[] = [];
      const rawRow: { text: string; isRed: boolean; isNeedCollection: boolean; collectionTime: string }[] = [];
      while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
        const attrs = tdMatch[1];
        const cellHtml = tdMatch[2];
        const isRed = /table-danger|table-warning|text-danger|bg-danger/i.test(attrs + cellHtml);
        const text = cellHtml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        const isNeedCollection = /здійсніть\s+інкасацію/i.test(text);
        // Extract time info after "здійсніть інкасацію" e.g. "(24:35)"
        const timeMatch = text.match(/здійсніть\s+інкасацію[^\d]*(\d[\d:]+)/i);
        const collectionTime = timeMatch ? timeMatch[1] : '';
        cells.push(text);
        rawRow.push({ text, isRed, isNeedCollection, collectionTime });
      }
      if (cells.length > 0) {
        rows.push(cells);
        rawCells.push(rawRow);
      }
    }
  }

  return { headers, rows, rawCells };
}

function parseTable(html: string): { headers: string[]; rows: string[][]; totalRow: string[] } {
  const headers: string[] = [];
  const rows: string[][] = [];
  let totalRow: string[] = [];

  // Parse multi-level thead: flatten header rows
  const theadMatch = html.match(/<thead[^>]*>([\s\S]*?)<\/thead>/);
  if (theadMatch) {
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let trM;
    const headerRows: string[][] = [];
    while ((trM = trRegex.exec(theadMatch[1])) !== null) {
      const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/g;
      let m;
      const row: string[] = [];
      while ((m = thRegex.exec(trM[1])) !== null) {
        row.push(m[1].replace(/<[^>]+>/g, '').trim());
      }
      if (row.length > 0) headerRows.push(row);
    }
    // Use the last header row (most specific) if multi-level, else first
    const picked = headerRows.length > 1 ? headerRows[headerRows.length - 1] : headerRows[0];
    if (picked) headers.push(...picked);
  }

  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  if (tbodyMatch) {
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let trMatch;
    while ((trMatch = trRegex.exec(tbodyMatch[1])) !== null) {
      const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
      let tdMatch;
      const cells: string[] = [];
      while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
        cells.push(tdMatch[1].replace(/<[^>]+>/g, '').trim());
      }
      if (cells.length > 0) rows.push(cells);
    }
  }

  const tfootMatch = html.match(/<tfoot[^>]*>([\s\S]*?)<\/tfoot>/);
  if (tfootMatch) {
    const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g;
    let m;
    while ((m = tdRegex.exec(tfootMatch[1])) !== null) {
      totalRow.push(m[1].replace(/<[^>]+>/g, '').trim());
    }
  }
  return { headers, rows, totalRow };
}

// Find the "за безготівку" column index specifically
function findCashlessColIndex(headers: string[]): number {
  // Priority: exact "за безготівку" or "за безготовку"
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase();
    if (/за безгот/.test(h)) return i;
  }
  // Fallback broader matches
  const candidates = [/безготівка/i, /безнал/i, /cashless/i, /картк/i, /card/i, /б\/г/i];
  for (const re of candidates) {
    for (let i = 0; i < headers.length; i++) {
      if (re.test(headers[i])) return i;
    }
  }
  // Last resort: any header with "без"
  for (let i = 0; i < headers.length; i++) {
    if (/без/i.test(headers[i])) return i;
  }
  return -1;
}

function parseDateOffset(text: string): { from: string; to: string } {
  const now = new Date();
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  if (/вчора|вчера|yesterday/i.test(text)) {
    const y = new Date(now); y.setDate(y.getDate()-1);
    return { from: fmt(y), to: fmt(y) };
  }
  if (/сьогодні|сегодня|today/i.test(text)) return { from: fmt(now), to: fmt(now) };
  const daysMatch = text.match(/(\d+)\s*(?:дн|день|дней|days?)/i);
  if (daysMatch) {
    const n = parseInt(daysMatch[1]);
    const from = new Date(now); from.setDate(from.getDate() - n + 1);
    return { from: fmt(from), to: fmt(now) };
  }
  if (/тижн|неделю?|week/i.test(text)) {
    const from = new Date(now);
    const day = from.getDay() || 7;
    from.setDate(from.getDate() - day + 1);
    return { from: fmt(from), to: fmt(now) };
  }
  if (/місяц|месяц|month/i.test(text)) {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: fmt(from), to: fmt(now) };
  }
  return { from: fmt(now), to: fmt(now) };
}

const LANG_NAMES: Record<string, string> = {
  uk: 'Ukrainian',
  en: 'English',
  de: 'German',
  ru: 'Russian',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { query, authToken, dateFrom, dateTo, history, imageData, lang, systemOverride, jsonMode } = body;
    const responseLang = LANG_NAMES[lang] || 'Ukrainian';

    // Handle smart voice parsing mode (systemOverride + jsonMode)
    if (systemOverride && jsonMode) {
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY') || '';
      const parseResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-lite',
          messages: [
            { role: 'system', content: systemOverride },
            { role: 'user', content: query },
          ],
          temperature: 0.1,
        }),
      });
      const parseJson = await parseResp.json();
      const answer = parseJson.choices?.[0]?.message?.content || '{}';
      return new Response(JSON.stringify({ success: true, answer }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Accept either custom auth token OR any non-empty Bearer token (anon key or session token)
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const authHeader = req.headers.get('Authorization') || '';
    const headerToken = authHeader.replace('Bearer ', '');
    const isValidToken = (authToken && verifyAuth(authToken)) || (headerToken && headerToken.length > 10);
    if (!isValidToken) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const today = new Date();
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const todayStr = fmt(today);
    const currentFrom = dateFrom || todayStr;
    const currentTo = dateTo || todayStr;

    // --- Task creation detection ---
    const taskKeywords = /запиши\s+задачу|відміть\s+задачу|відзнач\s+задачу|запишіть\s+задачу|отметь\s+задачу|запиши\s+завдання|додай\s+задачу|добав\s+задачу|создай\s+задачу|поставь\s+задачу|нагадай|remind|create\s+task/i;
    const isTaskCreation = taskKeywords.test(query || '');

    if (isTaskCreation) {
      // Extract wash name from query
      const washMap: Record<string, string> = {
        'усатово': 'Усатово', 'усатов': 'Усатово',
        'корсунц': 'Корсунцы', 'красносілка': 'Корсунцы',
        'левитан': 'Левитана', 'левітан': 'Левитана',
      };
      let taskWash = 'Общее';
      const qLow = (query || '').toLowerCase();
      for (const [key, val] of Object.entries(washMap)) {
        if (qLow.includes(key)) { taskWash = val; break; }
      }

      // Extract task title — strip the command prefix
      const taskTitle = (query || '')
        .replace(/^(запиши|відміть|відзнач|запишіть|отметь|запиши|відзнач|додай|добав|создай|поставь|нагадай)\s+(задачу|завдання|таск|task|задание)\s*/i, '')
        .replace(/\s*(на|по|для|in|at)\s+(усатово|усатов|корсунц|левитан|левітан|мийці|мойке|мойку)\s*/i, '')
        .trim();

      // Detect if should notify specific person
      const notifyMap: Record<string, string[]> = {
        'калин': ['1190893632'],
        'georgiy': ['6270826055'],
        'калинину': ['1190893632'],
        'георгий': ['6270826055'],
        'george': ['6270826055'],
      };
      const notifyRecipients: string[] = [];
      const qLow2 = (query || '').toLowerCase();
      for (const [key, ids] of Object.entries(notifyMap)) {
        if (qLow2.includes(key)) notifyRecipients.push(...ids);
      }

      if (taskTitle) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://wjvsdpgwhdriftevxsqp.supabase.co';
        const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqdnNkcGd3aGRyaWZ0ZXZ4c3FwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MTgzOTcsImV4cCI6MjA4NzE5NDM5N30.RBeyNzninPqQVpQqbzYsdD6v9mKLnKSGNAfKpLeFr2I';

        // Default due date: +7 days
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 7);
        const dueDateStr = dueDate.toISOString().split('T')[0];

        await fetch(`${supabaseUrl}/rest/v1/tasks`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            title: taskTitle,
            wash_name: taskWash,
            status: 'todo',
            priority: 'normal',
            due_date: dueDateStr,
            created_by: body.username || 'ai',
            notify_recipients: notifyRecipients.length > 0 ? notifyRecipients : null,
          }),
        });

        // Send Telegram notification if recipients specified
        const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
        let notifyConfirmation = '';
        if (notifyRecipients.length > 0 && BOT_TOKEN) {
          const recipientNames: Record<string, string> = {
            '1190893632': 'Kalinin',
            '6270826055': 'Georgiy',
          };
          const names = notifyRecipients.map(id => recipientNames[id] || id).join(', ');
          for (const recipId of notifyRecipients) {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: recipId,
                text: `📋 *Новая задача*: ${taskTitle}\n🏢 Объект: ${taskWash}\n📅 Срок: ${dueDateStr}\n📊 Статус: Сделать`,
                parse_mode: 'Markdown',
              }),
            }).catch(() => {});
          }
          notifyConfirmation = `\n📬 Уведомление отправлено: ${names}`;
        }

        return new Response(JSON.stringify({
          success: true,
          answer: `✅ Задача создана!\n\n**${taskTitle}**\nОбъект: ${taskWash}\nСрок: ${dueDateStr}${notifyConfirmation}\n\nЗадача добавлена в Рабочий журнал → Задачи.`,
          intent: { metric: 'create_task', washName: taskWash },
          taskCreated: { title: taskTitle, wash_name: taskWash },
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const systemPrompt = `You are a data assistant for a car wash business. You parse natural language queries about revenue statistics AND technical terminal state AND expenses AND journal/log analysis.
The car washes are: "Усатово", "Корсунцы", "Левитана" (also known as Левітана).
Today is ${todayStr}. Currently selected period: ${currentFrom} to ${currentTo}.

IMPORTANT: For "безнал", "безготівка", "картки", "по карточкам", "оплата карткою" — use metric "cashless". The cashless column in reports is specifically "за безготівку".
For "виручка", "оборот", "загальна", "всього" — use metric "total".
For "а всього", "по всіх", "всі мийки" — use washName "all".
For questions about terminal state, collections, card readers, bill acceptors ("коли останній раз інкасували", "картоприймач", "кандидат", "купюрник", "купюроприймач", "термінал") — use metric "technical".
For questions about revenue forecast, prognosis, prediction for the end of the month ("прогноз", "прогнозована", "скільки буде", "до кінця місяця", "предполагаемая выручка", "сколько будет") — use metric "forecast".
For questions about expenses comparison between months ("расходы", "витрати", "скільки витратили", "порівняй витрати", "більше витрат", "менше витрат", "електрика", "хімія", "газ", "податки", "мийщик") — use metric "expenses".
CRITICAL: For ANY short follow-up question about electricity/light/power ("а что по свету", "що по світлу", "а свет?", "відключення?", "по свету", "по світлу", "по электричеству", "по електриці", "блекаути", "відключення електрики", "скільки раз виключали", "на скільки годин") — these are ALWAYS about power outages in the bot journal, use metric "journal_analysis" with journalTopics ["power"].
For questions about power outages/electricity ("свет", "світло", "електрика", "виключили", "відключили", "выключили", "включили", "ввімкнули", "обесточили", "блекаут", "blackout", "генератор", "а что по свету", "що по світлу") OR diesel fuel/DT for generators ("дт", "дизель", "топливо", "паливо", "заправка", "заправили", "заправлено", "залили", "получено дт", "літрів", "литров", "генератор") — use metric "journal_analysis".
ALSO use metric "journal_analysis" for ANY question in context of previous journal_analysis conversation — if the previous assistant message was about power/fuel analysis, treat follow-ups as journal_analysis too.

Extract from the user query:
1. washName: one of "Усатово", "Корсунцы", "Левитана", or "all" if not specified or asking about all washes
2. metric: "cashless"|"total"|"both"|"technical"|"forecast"|"expenses"|"journal_analysis"
3. period: extract date range as dateFrom and dateTo in YYYY-MM-DD format
   - If no period mentioned in current query, use the currently selected period: ${currentFrom} to ${currentTo}
   - For forecast: dateFrom = first day of current month, dateTo = today
   - For expenses comparison like "в этом месяце vs прошлом": dateFrom=first day of month mentioned, dateTo=last day; compare two months
   - For "в январе vs феврале" type comparisons: set dateFrom/dateTo for the first month, add compareMonth field
4. journalTopics: array of topics to analyze, e.g. ["power", "fuel"] — include "power" if asking about outages/electricity, "fuel" if asking about diesel/DT/generator fuel. DEFAULT to ["power"] if query mentions light/electricity/свет/світло.

Consider conversation history when interpreting follow-up questions like "а всього?", "по всіх?", "а вчора?", "а на Усатово?", "розкажи детальніше", "які саме?", "а что по свету".

Respond ONLY with valid JSON, no markdown, no explanation:
{"washName":"...","metric":"cashless|total|both|technical|forecast|expenses|journal_analysis","dateFrom":"YYYY-MM-DD","dateTo":"YYYY-MM-DD","compareFrom":"YYYY-MM-DD","compareTo":"YYYY-MM-DD","journalTopics":["power","fuel"]}`;

    // Build messages array including conversation history for context
    const historyMessages = Array.isArray(history) ? history.slice(-6) : [];

    const aiParseResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          { role: 'system', content: systemPrompt },
          ...historyMessages,
          { role: 'user', content: imageData
            ? [
                { type: 'text', text: query || 'Що показано на скріншоті? Визнач мийку, метрику та період.' },
                { type: 'image_url', image_url: { url: imageData } }
              ]
            : query
          }
        ],
        temperature: 0.1,
      }),
    });

    if (!aiParseResp.ok) throw new Error(`AI gateway error: ${aiParseResp.status}`);

    const aiJson = await aiParseResp.json();
    let intent: { washName: string; metric: string; dateFrom: string; dateTo: string; compareFrom?: string; compareTo?: string; journalTopics?: string[] };

    try {
      const raw = aiJson.choices?.[0]?.message?.content || '{}';
      const cleaned = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
      intent = JSON.parse(cleaned);
    } catch {
      const dates = parseDateOffset(query);
      intent = { washName: 'all', metric: 'both', dateFrom: dates.from, dateTo: dates.to };
    }

    if (!intent.dateFrom) intent.dateFrom = currentFrom;
    if (!intent.dateTo) intent.dateTo = currentTo;
    if (intent.dateFrom > todayStr) intent.dateFrom = todayStr;
    if (intent.dateTo > todayStr) intent.dateTo = todayStr;

    const washesToFetch = intent.washName === 'all'
      ? CAR_WASHES
      : CAR_WASHES.filter(w => w.name.toLowerCase().includes(intent.washName.toLowerCase()));

    if (washesToFetch.length === 0) {
      const q = intent.washName.toLowerCase();
      const fuzzy = CAR_WASHES.filter(w =>
        q.includes(w.name.toLowerCase().slice(0,4)) ||
        w.name.toLowerCase().slice(0,4).includes(q.slice(0,4))
      );
      washesToFetch.push(...(fuzzy.length ? fuzzy : CAR_WASHES));
    }

    const results: { washName: string; total: number; cashless: number; error?: string }[] = [];
    let dataSummary = '';

    if (intent.metric === 'journal_analysis') {
      // Analyze work_journal_entries (bot log) for power outages and diesel fuel events
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://wjvsdpgwhdriftevxsqp.supabase.co';
      const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqdnNkcGd3aGRyaWZ0ZXZ4c3FwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MTgzOTcsImV4cCI6MjA4NzE5NDM5N30.RBeyNzninPqQVpQqbzYsdD6v9mKLnKSGNAfKpLeFr2I';

      const topics = intent.journalTopics || ['power', 'fuel'];

      // Fetch all journal entries for the period
      const washFilter = intent.washName !== 'all' ? `&wash_name=eq.${encodeURIComponent(intent.washName)}` : '';
      const journalUrl = `${supabaseUrl}/rest/v1/work_journal_entries?created_at=gte.${intent.dateFrom}T00:00:00&created_at=lte.${intent.dateTo}T23:59:59${washFilter}&select=id,created_at,message,wash_name,author,telegram_user&order=created_at.asc&limit=1000`;
      const journalResp = await fetch(journalUrl, {
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
      });
      const journalEntries = await journalResp.json() as { id: string; created_at: string; message: string; wash_name: string | null; author: string | null; telegram_user: string | null }[];

      // --- POWER OUTAGE analysis ---
      // Keywords: outage (light off), restore (light on)
      const powerOffKeywords = /відключили?\s+світло|виключили?\s+світло|вимкнули?\s+світло|вимкнення\s+світла|немає\s+світла|нет\s+света|выключили?\s+свет|отключили?\s+свет|обесточили|блекаут|blackout|зник\s+світло|пропал\s+свет|світло\s+вимкнул|свет\s+выключил|свет\s+отключ|немає\s+живлення|нет\s+питания|відключили?\s+електро|запустили\s+генератор|запустив\s+генератор|ввімкнули\s+генератор|включили\s+генератор|generator\s+on/i;
      const powerOnKeywords = /дали\s+світло|дали\s+свет|включили?\s+світло|ввімкнули?\s+світло|підключили\s+світло|є\s+світло|появилось\s+свет|з'явилось?\s+світло|відновили\s+світло|відновлено\s+живлення|свет\s+дали|свет\s+есть|світло\s+є|зупинили\s+генератор|вимкнули\s+генератор|відключили\s+генератор|generator\s+off/i;

      // --- FUEL / DT analysis ---
      const fuelKeywords = /заправк[иауе]|заправили|заправлено|заправив|залили|отримали\s+дт|отримано\s+дт|одержали\s+дт|получили?\s+дт|получено\s+дт|прийняли?\s+дт|прийнято\s+дт|оприходовано\s+дт|[\d]+\s*літр|[\d]+\s*литр|[\d]+\s*l\b|дт\s+[\d]|дизель|дизельне?\s+паливо|diesel|топливо\s+для\s+генератор|паливо\s+для\s+генератор|завезли\s+паливо|завезли\s+топливо/i;
      const fuelAmountRegex = /(\d+(?:[.,]\d+)?)\s*(?:літр|литр|л\b|l\b)/i;

      interface PowerEvent {
        date: string;
        wash: string;
        type: 'off' | 'on';
        message: string;
        hour: number;
      }
      interface FuelEvent {
        date: string;
        wash: string;
        liters: number | null;
        message: string;
        author: string;
      }

      const powerEvents: PowerEvent[] = [];
      const fuelEvents: FuelEvent[] = [];

      for (const entry of journalEntries) {
        const msg = entry.message || '';
        const washName = entry.wash_name || 'Невідома';
        const dateObj = new Date(entry.created_at);
        const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth()+1).padStart(2,'0')}-${String(dateObj.getDate()).padStart(2,'0')}`;
        const timeStr = `${String(dateObj.getHours()).padStart(2,'0')}:${String(dateObj.getMinutes()).padStart(2,'0')}`;
        const hour = dateObj.getHours();
        const displayDate = `${String(dateObj.getDate()).padStart(2,'0')}.${String(dateObj.getMonth()+1).padStart(2,'0')}.${dateObj.getFullYear()} ${timeStr}`;
        const authorStr = entry.author || entry.telegram_user || '';

        if (topics.includes('power')) {
          if (powerOffKeywords.test(msg)) {
            powerEvents.push({ date: displayDate, wash: washName, type: 'off', message: msg.slice(0, 120), hour });
          } else if (powerOnKeywords.test(msg)) {
            powerEvents.push({ date: displayDate, wash: washName, type: 'on', message: msg.slice(0, 120), hour });
          }
        }

        if (topics.includes('fuel')) {
          if (fuelKeywords.test(msg)) {
            const amountMatch = msg.match(fuelAmountRegex);
            const liters = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : null;
            fuelEvents.push({ date: displayDate, wash: washName, liters, message: msg.slice(0, 120), author: authorStr });
          }
        }
      }

      // --- Build power outage sessions (pair off → on events per wash) ---
      const journalLines: string[] = [];
      journalLines.push(`📊 Аналіз журналу бота за ${intent.dateFrom} — ${intent.dateTo}${intent.washName !== 'all' ? ` (${intent.washName})` : ' (всі мийки)'}`);
      journalLines.push(`Всього записів у журналі: ${journalEntries.length}`);

      if (topics.includes('power')) {
        journalLines.push('\n--- ВІДКЛЮЧЕННЯ СВІТЛА ---');

        // Group by wash
        const washesPower = intent.washName === 'all'
          ? ['Усатово', 'Корсунцы', 'Левитана']
          : [intent.washName];

        let grandOutageCount = 0;
        for (const wash of washesPower) {
          const washEvents = powerEvents.filter(e => e.wash === wash || intent.washName !== 'all');
          const offEvents = washEvents.filter(e => e.type === 'off');
          const onEvents = washEvents.filter(e => e.type === 'on');

          if (offEvents.length === 0 && intent.washName !== 'all') {
            journalLines.push(`${wash}: записів про відключення не знайдено`);
            continue;
          }
          if (offEvents.length === 0) continue;
          grandOutageCount += offEvents.length;
          journalLines.push(`\n${wash}: відключень — ${offEvents.length} разів, відновлень — ${onEvents.length} разів`);
          journalLines.push(`ТАБЛИЦЯ відключень ${wash}:`);
          journalLines.push(`Дата/Час\t\t\tПодія\t\t\tПовідомлення`);
          for (const ev of offEvents) {
            journalLines.push(`${ev.date}\t🔴 Вимкнення\t${ev.message}`);
          }
          for (const ev of onEvents) {
            journalLines.push(`${ev.date}\t🟢 Ввімкнення\t${ev.message}`);
          }
        }

        if (intent.washName === 'all') {
          // All washes combined
          const allOffEvents = powerEvents.filter(e => e.type === 'off');
          const allOnEvents = powerEvents.filter(e => e.type === 'on');
          grandOutageCount = allOffEvents.length;
          journalLines.push(`\nПО ВСІХ МИЙКАХ РАЗОМ: відключень — ${allOffEvents.length}, відновлень — ${allOnEvents.length}`);
          journalLines.push(`ЗВЕДЕНА ТАБЛИЦЯ відключень:`);
          journalLines.push(`Дата/Час\t\t\tМийка\t\t\tПодія\t\tПовідомлення`);
          for (const ev of powerEvents.sort((a,b) => a.date.localeCompare(b.date))) {
            journalLines.push(`${ev.date}\t${ev.wash}\t${ev.type === 'off' ? '🔴 Вимкнення' : '🟢 Ввімкнення'}\t${ev.message}`);
          }
        }
      }

      if (topics.includes('fuel')) {
        journalLines.push('\n--- ДТ ДЛЯ ГЕНЕРАТОРІВ ---');

        const totalLiters = fuelEvents.reduce((sum, e) => sum + (e.liters || 0), 0);
        const eventsWithAmount = fuelEvents.filter(e => e.liters !== null);

        if (fuelEvents.length === 0) {
          journalLines.push('Записів про прийом/заправку ДТ не знайдено');
        } else {
          journalLines.push(`Всього подій з паливом: ${fuelEvents.length}`);
          if (totalLiters > 0) journalLines.push(`Всього літрів ДТ (де зазначено кількість): ${totalLiters} л`);

          // Per wash breakdown
          const washesInFuel = [...new Set(fuelEvents.map(e => e.wash))];
          for (const wash of washesInFuel) {
            const washFuel = fuelEvents.filter(e => e.wash === wash);
            const washLiters = washFuel.reduce((sum, e) => sum + (e.liters || 0), 0);
            journalLines.push(`\n${wash}: ${washFuel.length} заправок, ${washLiters > 0 ? washLiters + ' л' : 'об\'єм не зазначено'}`);
          }

          journalLines.push(`\nТАБЛИЦЯ прийому ДТ:`);
          journalLines.push(`Дата/Час\t\t\tМийка\t\tЛітри\tАвтор\t\tПовідомлення`);
          for (const ev of fuelEvents) {
            journalLines.push(`${ev.date}\t${ev.wash}\t${ev.liters !== null ? ev.liters + ' л' : '—'}\t${ev.author}\t${ev.message}`);
          }
        }
      }

      dataSummary = journalLines.join('\n');

    } else if (intent.metric === 'forecast') {
      // Revenue forecast: fetch from start of current month to today, extrapolate to full month
      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
      const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
      const daysPassed = now.getDate();

      const forecastLines: string[] = [];
      forecastLines.push(`Данные за период: ${monthStart} — ${todayStr} (прошло ${daysPassed} из ${daysInMonth} дней)`);

      let grandTotal = 0;
      for (const config of washesToFetch) {
        try {
          const report = await fetchFullSummaryViaEdge(config.name, monthStart, todayStr, body.authToken);
          const parseNum = (s: string) => parseFloat((s || '0').replace(/[^\d.,\-]/g, '').replace(',', '.')) || 0;
          const total = parseNum(report.totalRow?.[1] || '0');
          const projected = daysPassed > 0 ? (total / daysPassed) * daysInMonth : 0;
          grandTotal += total;
          forecastLines.push(`${config.name}: фактически ${total.toLocaleString('uk-UA', {minimumFractionDigits:2})} грн за ${daysPassed} дней → прогноз на ${daysInMonth} дней: ${projected.toLocaleString('uk-UA', {minimumFractionDigits:2})} грн`);
        } catch(e) {
          forecastLines.push(`${config.name}: ошибка (${e})`);
        }
      }
      if (washesToFetch.length > 1) {
        const grandProjected = daysPassed > 0 ? (grandTotal / daysPassed) * daysInMonth : 0;
        forecastLines.push(`ИТОГО все мойки: факт ${grandTotal.toLocaleString('uk-UA', {minimumFractionDigits:2})} грн → прогноз: ${grandProjected.toLocaleString('uk-UA', {minimumFractionDigits:2})} грн`);
      }
      dataSummary = forecastLines.join('\n');

    } else if (intent.metric === 'expenses') {
      // Fetch expenses from database and compare months
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://wjvsdpgwhdriftevxsqp.supabase.co';
      const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqdnNkcGd3aGRyaWZ0ZXZ4c3FwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MTgzOTcsImV4cCI6MjA4NzE5NDM5N30.RBeyNzninPqQVpQqbzYsdD6v9mKLnKSGNAfKpLeFr2I';

      const fetchExpenses = async (from: string, to: string, washName?: string) => {
        let url = `${supabaseUrl}/rest/v1/expenses?expense_date=gte.${from}&expense_date=lte.${to}&select=expense_type,amount,wash_name`;
        if (washName && washName !== 'all') url += `&wash_name=eq.${encodeURIComponent(washName)}`;
        const r = await fetch(url, { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }});
        return await r.json() as { expense_type: string; amount: number; wash_name: string }[];
      };

      const periodFrom = intent.dateFrom;
      const periodTo = intent.dateTo;
      const compareFrom = intent.compareFrom;
      const compareTo = intent.compareTo;

      const washFilter = intent.washName !== 'all' ? intent.washName : undefined;
      const expenses1 = await fetchExpenses(periodFrom, periodTo, washFilter);

      // Group by expense_type
      const groupByType = (rows: { expense_type: string; amount: number }[]) => {
        const map: Record<string, number> = {};
        for (const r of rows) map[r.expense_type] = (map[r.expense_type] || 0) + Number(r.amount);
        return map;
      };

      const g1 = groupByType(expenses1);
      const total1 = Object.values(g1).reduce((a, b) => a + b, 0);

      let expenseLines: string[] = [];
      expenseLines.push(`Расходы за ${periodFrom} — ${periodTo}${washFilter ? ` (${washFilter})` : ''}:`);
      expenseLines.push(`Итого: ${total1.toLocaleString('uk-UA', {minimumFractionDigits:2})} грн`);
      for (const [type, amt] of Object.entries(g1).sort((a,b) => b[1]-a[1])) {
        expenseLines.push(`  ${type}: ${amt.toLocaleString('uk-UA', {minimumFractionDigits:2})} грн`);
      }

      if (compareFrom && compareTo) {
        const expenses2 = await fetchExpenses(compareFrom, compareTo, washFilter);
        const g2 = groupByType(expenses2);
        const total2 = Object.values(g2).reduce((a, b) => a + b, 0);
        expenseLines.push(`\nРасходы за ${compareFrom} — ${compareTo}${washFilter ? ` (${washFilter})` : ''}:`);
        expenseLines.push(`Итого: ${total2.toLocaleString('uk-UA', {minimumFractionDigits:2})} грн`);
        for (const [type, amt] of Object.entries(g2).sort((a,b) => b[1]-a[1])) {
          expenseLines.push(`  ${type}: ${amt.toLocaleString('uk-UA', {minimumFractionDigits:2})} грн`);
        }
        const diff = total1 - total2;
        expenseLines.push(`\nРазница (первый период - второй): ${diff >= 0 ? '+' : ''}${diff.toLocaleString('uk-UA', {minimumFractionDigits:2})} грн`);
        // Per-category diffs
        const allTypes = new Set([...Object.keys(g1), ...Object.keys(g2)]);
        for (const type of allTypes) {
          const d = (g1[type] || 0) - (g2[type] || 0);
          if (Math.abs(d) > 0.01) expenseLines.push(`  ${type}: ${d >= 0 ? '+' : ''}${d.toLocaleString('uk-UA', {minimumFractionDigits:2})} грн`);
        }
      }
      dataSummary = expenseLines.join('\n');

    } else if (intent.metric === 'technical') {
      // Fetch analytics table (contains terminal address + collection status)
      const techResults: { washName: string; headers: string[]; rows: string[][]; rawCells: { text: string; isRed: boolean; isNeedCollection: boolean; collectionTime: string }[][]; error?: string }[] = [];
      for (const config of washesToFetch) {
        try {
          const { jar } = await loginAndGetSession(config);
          const { headers, rows, rawCells } = await fetchAnalyticsTable(config, jar);
          techResults.push({ washName: config.name, headers, rows, rawCells });
        } catch (e) {
          techResults.push({ washName: config.name, headers: [], rows: [], rawCells: [], error: String(e) });
        }
      }

      // Build data summary for AI — find address column and collection column
      dataSummary = techResults.map(r => {
        if (r.error) return `${r.washName}: помилка (${r.error})`;
        if (!r.rows.length) return `${r.washName}: дані відсутні`;

        // Flexible column finder: exact → starts-with → contains
        const findCol = (patterns: RegExp[]) => {
          for (const re of patterns) {
            const idx = r.headers.findIndex(h => re.test(h.toLowerCase().trim()));
            if (idx >= 0) return idx;
          }
          return -1;
        };

        const addrIdx = findCol([/^адрес[аи]?\s+термінал/i, /адрес/i, /термінал/i, /address/i]);
        const collectionIdx = findCol([/остання\s+інкас/i, /інкас/i, /collection/i, /инкас/i]);
        const cardReaderIdx = findCol([/картоприймач|картко|card\s*read|купюро/i]);
        const billIdx = findCol([/купюрник|купюр|bill\s*accept/i]);

        console.log(`[ai-assistant] ${r.washName} analytics headers:`, r.headers,
          'addrIdx:', addrIdx, 'collectionIdx:', collectionIdx,
          'cardReaderIdx:', cardReaderIdx, 'billIdx:', billIdx);

        const needCollectionTerminals: string[] = [];
        const badCardReaderTerminals: string[] = [];
        const badBillTerminals: string[] = [];
        const allTerminalLines: string[] = [];

        r.rows.forEach((row, ri) => {
          const rawRow = r.rawCells?.[ri] || [];
          const terminalName = addrIdx >= 0 ? (row[addrIdx] || row[0] || `Термінал ${ri+1}`) : (row[0] || `Термінал ${ri+1}`);

          // --- Incassation check ---
          let collectionStatus = '';
          let hasCollectionProblem = false;
          row.forEach((cell, ci) => {
            const raw = rawRow[ci];
            if (raw?.isNeedCollection || /здійсніть\s+інкасацію/i.test(cell)) {
              hasCollectionProblem = true;
              const time = raw?.collectionTime || cell.match(/(\d+:\d+)/)?.[1] || '';
              collectionStatus = time ? `здійсніть інкасацію (${time})` : 'здійсніть інкасацію';
            }
          });

          // --- Card reader check ---
          let cardReaderStatus = 'норма';
          const cardCell = cardReaderIdx >= 0 ? row[cardReaderIdx] : '';
          const cardRaw = cardReaderIdx >= 0 ? rawRow[cardReaderIdx] : null;
          if (cardRaw?.isRed || /перевірте|не\s*прац|помилка|error|fail/i.test(cardCell)) {
            cardReaderStatus = cardCell || 'помилка';
            badCardReaderTerminals.push(`${terminalName} — ${cardReaderStatus}`);
          }

          // --- Bill acceptor check ---
          let billStatus = 'норма';
          const billCell = billIdx >= 0 ? row[billIdx] : '';
          const billRaw = billIdx >= 0 ? rawRow[billIdx] : null;
          if (billRaw?.isRed || /перевірте|не\s*прац|помилка|error|fail/i.test(billCell)) {
            billStatus = billCell || 'помилка';
            badBillTerminals.push(`${terminalName} — ${billStatus}`);
          }

          const statusStr = collectionStatus || (collectionIdx >= 0 ? row[collectionIdx] : '');
          allTerminalLines.push(`${terminalName}: інкасація=${statusStr || 'норма'}, картоприймач=${cardReaderStatus}, купюрник=${billStatus}`);
          if (hasCollectionProblem) needCollectionTerminals.push(`${terminalName} — ${collectionStatus}`);
        });

        return `${r.washName}:\nВсі термінали:\n${allTerminalLines.join('\n')}\n\nТермінали потребують інкасації (${needCollectionTerminals.length}):\n${needCollectionTerminals.join('\n') || 'немає'}\n\nПроблеми з картоприймачем (${badCardReaderTerminals.length}):\n${badCardReaderTerminals.join('\n') || 'немає'}\n\nПроблеми з купюрником (${badBillTerminals.length}):\n${badBillTerminals.join('\n') || 'немає'}`;
      }).join('\n\n');

    } else {
      // Use fullSummary report via scrape-carwash to get cashless column
      const authToken = body.authToken;
      for (const config of washesToFetch) {
        try {
          const report = await fetchFullSummaryViaEdge(config.name, intent.dateFrom, intent.dateTo, authToken);
          // totalRow[0] = "Підсумок", [1] = total revenue
          const parseNum = (s: string) => parseFloat((s || '0').replace(/[^\d.,\-]/g, '').replace(',', '.')) || 0;
          const total = parseNum(report.totalRow?.[1] || '0');
          const cardIdx = findCashlessColIndex(report.headers);
          const cashless = cardIdx >= 0 ? parseNum(report.totalRow?.[cardIdx] || '0') : 0;
          console.log(`[ai-assistant] ${config.name} fullSummary headers:`, report.headers, 'cardIdx:', cardIdx, 'cashless:', cashless, 'total:', total);
          results.push({ washName: config.name, total, cashless });
        } catch (e) {
          results.push({ washName: config.name, total: 0, cashless: 0, error: String(e) });
        }
      }

      dataSummary = results.map(r => {
        if (r.error) return `${r.washName}: помилка отримання даних`;
        return `${r.washName}: виручка ${r.total.toLocaleString('uk-UA', {minimumFractionDigits:2})} грн, за безготівку ${r.cashless.toLocaleString('uk-UA', {minimumFractionDigits:2})} грн`;
      }).join('\n');
    }

    // Fetch live currency rates so AI can answer rate questions accurately
    let liveRatesText = '';
    try {
      const ratesResp = await fetch('https://open.er-api.com/v6/latest/USD');
      if (ratesResp.ok) {
        const ratesData = await ratesResp.json();
        const usdUah = ratesData.rates?.UAH;
        const usdEur = ratesData.rates?.EUR;
        if (usdUah && usdEur) {
          const eurUah = (usdUah / usdEur).toFixed(2);
          liveRatesText = `\n\nACTUAL LIVE EXCHANGE RATES (today ${todayStr}, source: open.er-api.com):
• 1 USD = ${usdUah.toFixed(2)} UAH (гривень)
• 1 EUR = ${eurUah} UAH (гривень)
• 1 UAH = ${(1/usdUah).toFixed(6)} USD
Always use these rates when answering any questions about currency. These are real-time market rates.`;
        }
      }
    } catch { /* not critical */ }

    const answerSystemPrompt = `You are a helpful assistant for a car wash business.
CRITICAL LANGUAGE RULE: You MUST respond EXCLUSIVELY in ${responseLang} language. This is non-negotiable. If the language is Russian, write in Russian. If Ukrainian — in Ukrainian. Never mix languages. Never respond in a different language even if the question is in another language.
Be concise and direct. The period requested: ${intent.dateFrom} to ${intent.dateTo}.${liveRatesText}
If asked about "безнал", "безготівка", "картки", "безналичные" — report ONLY the "за безготівку" figure from the data. Do NOT report total as cashless.
If asked about total revenue — report the "виручка" figure.
If asked about all washes combined — sum up all figures and report the total.
If asked about revenue forecast/prognosis (metric=forecast):
- Explain: actual revenue so far this month ÷ days passed × days in month = projected monthly revenue.
- Show the calculation for each wash and the total.
- Be clear about the projection basis (how many days passed out of total).
If asked about expenses (metric=expenses):
- Show expenses by category for each period.
- If two periods provided, show the comparison: which month had more, by how much, and break down by category.
- Highlight the biggest differences.
If asked about terminal analytics, collections ("інкасація", "инкасация", "инкассация"):
- The data contains each terminal's address (name) and its last collection status.
- "здійсніть інкасацію" means collection is overdue. The time in parentheses (e.g. 24:35) shows how long since last collection.
- List terminals needing collection by their address/name from the data.
- If asking about overdue collections — list all terminals where status is "здійсніть інкасацію" with the time shown.
If asked about "картоприймач" (card reader) or "кандидат":
- Look at the "картоприймач" status for each terminal. If isRed or contains "перевірте"/"помилка" — it's broken.
- List broken card reader terminals by name.
If asked about "купюрник" (bill acceptor):
- Look at the "купюрник" status for each terminal. If isRed or contains "перевірте"/"помилка" — it's broken.
- List broken bill acceptor terminals by name.
If asked about power outages / electricity / light / generators OR diesel fuel for generators (metric=journal_analysis):
- The data is extracted from bot work journal entries matching keywords.
- CRITICAL FORMATTING RULE: Do NOT use markdown tables (no pipe | characters, no dashes ---). Do NOT use asterisks ** or # headers. Use plain natural text only — the response will be read aloud by text-to-speech.
- For power outages: list each event as plain text on its own line, e.g.: "12.03.2025 14:30, Усатово, вимкнення, текст повідомлення". Group by wash with a simple header line.
  Summarize total count per wash and overall. If both off and on events found, try to pair them and estimate approximate outage duration where possible.
- For diesel fuel (ДТ): list each event as plain text on its own line, e.g.: "12.03.2025 10:00, Усатово, 50 літрів, автор, текст".
  Summarize total liters per wash and overall. Note any entries where volume was not specified.
- Clearly state the number of events found. If 0 events — say "За вказаний період записів не знайдено" and suggest checking a wider date range.
- Use natural conversational sentences and line breaks. No special symbols, no markdown formatting whatsoever.`;

    const answerResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: answerSystemPrompt },
          ...historyMessages,
          { role: 'user', content: imageData
            ? [
                { type: 'text', text: `Question: "${query}"\n\nData:\n${dataSummary}` },
                { type: 'image_url', image_url: { url: imageData } }
              ]
            : `Question: "${query}"\n\nData:\n${dataSummary}`
          }
        ],
        temperature: 0.3,
      }),
    });

    const answerJson = await answerResp.json();
    const answer = answerJson.choices?.[0]?.message?.content || 'Не вдалося отримати відповідь';

    return new Response(JSON.stringify({
      success: true,
      answer,
      intent,
      results,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('ai-assistant error:', error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
