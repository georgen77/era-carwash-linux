const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface CarWashConfig {
  name: string;
  baseUrl: string;
  login: string;
  password: string;
}

const CAR_WASHES: CarWashConfig[] = [
  { name: "Усатово", baseUrl: "https://sim5.gteh.com.ua", login: "odessa8", password: "odessa828122020" },
  { name: "Корсунцы", baseUrl: "https://sim4.gteh.com.ua", login: "krasnosilka", password: "krasnosilka221119" },
  { name: "Левитана", baseUrl: "https://sim5.gteh.com.ua", login: "odesa11", password: "dimakalinin" },
];

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

async function loginAndGetSession(config: CarWashConfig): Promise<{ jar: Record<string, string> }> {
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

async function getCsrfAndHtml(url: string, jar: Record<string, string>): Promise<{ csrf: string; html: string }> {
  const resp = await fetch(url, { headers: { 'Cookie': cookieString(jar) } });
  Object.assign(jar, extractAllCookies(resp));
  const html = await resp.text();
  const csrf = html.match(/name="_token"\s+value="([^"]+)"/)?.[1] || '';
  return { csrf, html };
}

async function fetchSummaryReport(config: CarWashConfig, jar: Record<string, string>, dateFrom: string, dateTo: string, reportTypeParam = 'simplified') {
  const reportUrl = `${config.baseUrl}/sim4/transaction/report`;
  const { csrf } = await getCsrfAndHtml(reportUrl, jar);

  const form = new URLSearchParams();
  form.append('_token', csrf);
  form.append('date_start', dateFrom);
  form.append('date_end', dateTo);
  form.append('report_type', reportTypeParam);
  form.append('cards', 'all');

  const resp = await fetch(reportUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookieString(jar) },
    body: form.toString(),
    redirect: 'follow',
  });
  Object.assign(jar, extractAllCookies(resp));
  return parseTable(await resp.text());
}

// Build dateTimes string in the format the site expects: "YYYY-MM-DD HH:mm:ss - YYYY-MM-DD HH:mm:ss"
function buildDateTimes(dateFrom: string, dateTo: string): string {
  return `${dateFrom} 00:00:00 - ${dateTo} 23:59:59`;
}

// Fetch collections via AJAX POST to /sim4/collections/table
async function fetchCollections(config: CarWashConfig, jar: Record<string, string>, dateFrom: string, dateTo: string) {
  const pageUrl = `${config.baseUrl}/sim4/collections`;
  const { csrf } = await getCsrfAndHtml(pageUrl, jar);
  
  const dateTimes = buildDateTimes(dateFrom, dateTo);
  const form = new URLSearchParams();
  form.append('_token', csrf);
  form.append('dateTimes', dateTimes);
  
  const resp = await fetch(`${config.baseUrl}/sim4/collections/table`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookieString(jar) },
    body: form.toString(),
    redirect: 'follow',
  });
  Object.assign(jar, extractAllCookies(resp));
  const html = await resp.text();
  return parseCollectionsTable(html);
}

// Specialized parser for collections table
// The HTML uses <th> in tbody for main data rows, has collapsible detail rows with nested tables
function parseCollectionsTable(html: string): { headers: string[]; rows: string[][]; totalRow: string[] } {
  const headers: string[] = [];
  const rows: string[][] = [];
  let totalRow: string[] = [];

  // Extract headers from thead
  const theadMatch = html.match(/<thead[^>]*>([\s\S]*?)<\/thead>/);
  if (theadMatch) {
    const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/g;
    let m;
    while ((m = thRegex.exec(theadMatch[1])) !== null) {
      headers.push(m[1].replace(/<[^>]+>/g, '').trim());
    }
  }

  // Find main data rows: they are <tr> tags that contain <th> with date patterns like "2026-02-20 14:30:00"
  // or terminal info. Main rows have 4 <th> cells: date, terminal, amount, failed notes
  const trRegex = /<tr(?:\s[^>]*)?>(?=[\s\S]*?<th)([\s\S]*?)<\/tr>/g;
  let trMatch;
  while ((trMatch = trRegex.exec(html)) !== null) {
    const trContent = trMatch[1];
    
    // Skip rows inside nested tables (detail rows) - they have class="collapse" or contain <table
    if (trContent.includes('<table') || trMatch[0].includes('collapse')) continue;
    
    // Skip header rows (inside <thead>) and summary/total rows
    if (trContent.includes('table-info')) continue;
    
    // Extract <th> cells from this row
    const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/g;
    let thMatch;
    const cells: string[] = [];
    while ((thMatch = thRegex.exec(trContent)) !== null) {
      let text = thMatch[1];
      // Remove nested HTML elements but keep text
      text = text.replace(/<label[^>]*>([\s\S]*?)<\/label>/g, '$1');
      text = text.replace(/<input[^>]*>/g, '');
      text = text.replace(/<i[^>]*>[\s\S]*?<\/i>/g, '');
      text = text.replace(/<[^>]+>/g, '').trim();
      text = text.replace(/\s+/g, ' ').trim();
      if (text) cells.push(text);
    }
    
    // Main data rows should have exactly 4 cells (date, terminal, amount, failed)
    // or at least contain a date-like pattern in first cell
    if (cells.length >= 3 && /\d{4}-\d{2}-\d{2}/.test(cells[0])) {
      rows.push(cells);
    }
  }

  // Extract tfoot total row
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

// Fetch bonuses report - the page uses a form POST
async function fetchBonusesReport(config: CarWashConfig, jar: Record<string, string>, dateFrom: string, dateTo: string) {
  const pageUrl = `${config.baseUrl}/sim4/bonuses/report`;
  const { csrf } = await getCsrfAndHtml(pageUrl, jar);
  
  const dateTimes = buildDateTimes(dateFrom, dateTo);
  const form = new URLSearchParams();
  form.append('_token', csrf);
  form.append('dateTimes', dateTimes);
  
  const resp = await fetch(pageUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookieString(jar) },
    body: form.toString(),
    redirect: 'follow',
  });
  Object.assign(jar, extractAllCookies(resp));
  const html = await resp.text();
  return parseTable(html);
}

// Fetch middleCheck chart data via GET
async function fetchMiddleCheckData(config: CarWashConfig, jar: Record<string, string>, dateFrom: string, dateTo: string): Promise<{ labels: string[]; values: number[] }> {
  const pageUrl = `${config.baseUrl}/sim4/charts/middleCheck`;
  await getCsrfAndHtml(pageUrl, jar);
  
  const dateTimes = buildDateTimes(dateFrom, dateTo);
  const url = `${config.baseUrl}/sim4/charts/middleCheckData?dateTimes=${encodeURIComponent(dateTimes)}`;
  
  const resp = await fetch(url, { headers: { 'Cookie': cookieString(jar) }, redirect: 'follow' });
  Object.assign(jar, extractAllCookies(resp));
  const html = await resp.text();
  
  return parseAmChartsData(html, 'midCheck');
}

// Fetch byClientsCount via POST — returns HTML fragment with chart data
async function fetchClientsCountData(config: CarWashConfig, jar: Record<string, string>, dateFrom: string, dateTo: string): Promise<{ labels: string[]; values: number[] }> {
  const pageUrl = `${config.baseUrl}/sim4/charts/byClientsCount`;
  const { csrf } = await getCsrfAndHtml(pageUrl, jar);
  
  const dateTimes = buildDateTimes(dateFrom, dateTo);
  const form = new URLSearchParams();
  form.append('_token', csrf);
  form.append('dateTimes', dateTimes);
  form.append('type', 'monthly');
  
  const resp = await fetch(pageUrl, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/x-www-form-urlencoded', 
      'Cookie': cookieString(jar),
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: form.toString(),
    redirect: 'follow',
  });
  Object.assign(jar, extractAllCookies(resp));
  const html = await resp.text();
  
  // The POST response is an HTML fragment with AmCharts scripts
  return parseAmChartsData(html, 'clCnt');
}

// Parse AmCharts dataProvider from HTML response
function parseAmChartsData(html: string, valueField: string): { labels: string[]; values: number[] } {
  const labels: string[] = [];
  const values: number[] = [];
  
  const dpRegex = /"dataProvider"\s*:\s*\[([\s\S]*?)\]\s*,/g;
  const allMatches: string[] = [];
  let m;
  while ((m = dpRegex.exec(html)) !== null) {
    allMatches.push(m[1]);
  }
  
  if (allMatches.length > 0) {
    const objRegex = /\{([^}]+)\}/g;
    let objMatch;
    while ((objMatch = objRegex.exec(allMatches[0])) !== null) {
      const block = objMatch[1];
      const month = block.match(/"month"\s*:\s*"([^"]+)"/)?.[1] || '';
      const val = block.match(new RegExp(`"${valueField}"\\s*:\\s*"([^"]+)"`))?.[1];
      
      if (month) {
        labels.push(month);
        values.push(val ? parseFloat(val) : 0);
      }
    }
  }
  
  return { labels, values };
}

// Parse ALL chart data fields from middleCheckData response
function parseAllChartData(html: string): { rows: Record<string, string>[] } {
  const rows: Record<string, string>[] = [];
  
  const dpRegex = /"dataProvider"\s*:\s*\[([\s\S]*?)\]\s*,/g;
  const m = dpRegex.exec(html);
  if (!m) return { rows };
  
  const objRegex = /\{([^}]+)\}/g;
  let objMatch;
  while ((objMatch = objRegex.exec(m[1])) !== null) {
    const block = objMatch[1];
    const row: Record<string, string> = {};
    const fieldRegex = /"(\w+)"\s*:\s*"([^"]*)"/g;
    let fm;
    while ((fm = fieldRegex.exec(block)) !== null) {
      row[fm[1]] = fm[2];
    }
    if (row.month) rows.push(row);
  }
  
  return { rows };
}

// Fetch "Деталі" tab from /sim4/news page — terminal details table
async function fetchDetails(config: CarWashConfig, jar: Record<string, string>): Promise<{ headers: string[]; rows: string[][] }> {
  const newsUrl = `${config.baseUrl}/sim4/news`;
  const resp = await fetch(newsUrl, { headers: { 'Cookie': cookieString(jar) }, redirect: 'follow' });
  Object.assign(jar, extractAllCookies(resp));
  const html = await resp.text();

  // Find the nav-details tab content
  const detailsMatch = html.match(/id="nav-details"[^>]*>([\s\S]*?)(?=<div[^>]*class="tab-pane[^"]*"[^>]*id="nav-(?!details)|$)/);
  if (!detailsMatch) {
    return { headers: [], rows: [] };
  }
  const detailsHtml = detailsMatch[1];
  
  // Parse the table inside the details tab
  const tableMatch = detailsHtml.match(/<table[^>]*>([\s\S]*?)<\/table>/);
  if (!tableMatch) {
    return { headers: [], rows: [] };
  }
  const tableHtml = tableMatch[0];
  const parsed = parseTable(tableHtml);
  return { headers: parsed.headers, rows: parsed.rows };
}

// Fetch "Технічний стан" via POST to /sim4/states/characteristics (Vue AJAX endpoint)
async function fetchTechnicalState(config: CarWashConfig, jar: Record<string, string>): Promise<{ headers: string[]; rows: string[][]; rawCells: { text: string; isRed: boolean; isGreen: boolean; isOrange: boolean }[][] }> {
  // First load the states page to get CSRF token and cookies
  const statesResp = await fetch(`${config.baseUrl}/sim4/states`, {
    headers: { 'Cookie': cookieString(jar), 'Accept': 'text/html,*/*' },
    redirect: 'follow',
  });
  Object.assign(jar, extractAllCookies(statesResp));
  const statesHtml = await statesResp.text();
  const csrf = statesHtml.match(/meta\s+name="csrf-token"\s+content="([^"]+)"/)?.[1] || '';

  // POST to the Vue AJAX endpoint that returns the actual HTML table
  const form = new URLSearchParams();
  form.append('_token', csrf);
  const resp = await fetch(`${config.baseUrl}/sim4/states/characteristics`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieString(jar),
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'text/html, */*',
    },
    body: form.toString(),
    redirect: 'follow',
  });
  Object.assign(jar, extractAllCookies(resp));
  const html = decodeHtml(await resp.text());

  console.log(`[technicalState] ${config.name} characteristics htmlLength=${html.length} hasTable=${html.includes('<table')}`);

  // Parse all tables and pick the best one (most rows)
  const tableRegex = /<table[\s\S]*?<\/table>/g;
  let tableMatch;
  let bestTable: { headers: string[]; rows: string[][]; rawCells: { text: string; isRed: boolean; isGreen: boolean; isOrange: boolean }[][] } | null = null;
  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const result = parseTableWithColors(tableMatch[0], config.name);
    if (result.rows.length > 0 && (!bestTable || result.rows.length > bestTable.rows.length)) {
      bestTable = result;
    }
  }

  if (bestTable?.rows.length) return bestTable;
  return { headers: [], rows: [], rawCells: [] };
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
}


function extractAjaxUrlsFromHtml(html: string, baseUrl: string, mode: 'technical' | 'analytics'): string[] {
  const found = new Set<string>();
  const absRegex = /https?:\/\/[^"'`\s]+\/sim4\/[^"'`\s]+/g;
  const relRegex = /["'`](\/sim4\/[^"'`\s]+)["'`]/g;
  const ajaxRegex = /ajax\s*:\s*(?:\{[\s\S]{0,300}?url\s*:\s*["']([^"']+)["']|["']([^"']+)["'])/gi;

  const include = (url: string) => {
    if (!url || /\/sim4\/(?:js|css|images)\//i.test(url)) return;
    const u = url.startsWith('http') ? url : `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
    const key = u.toLowerCase();
    const isRelevant = mode === 'technical'
      ? /state|states|terminal|terminals|inkas|insa|character|table|datatable/i.test(key)
      : /analyt|chart|state|states|table|datatable|report/i.test(key);
    if (isRelevant) found.add(u);
  };

  let m;
  while ((m = absRegex.exec(html)) !== null) include(m[0]);
  while ((m = relRegex.exec(html)) !== null) include(m[1]);
  while ((m = ajaxRegex.exec(html)) !== null) include(m[1] || m[2]);

  return Array.from(found);
}

async function fetchAndParseTabularEndpoint(
  endpointUrl: string,
  jar: Record<string, string>,
  csrf: string,
): Promise<{ headers: string[]; rows: string[][]; rawCells: { text: string; isRed: boolean; isGreen: boolean; isOrange: boolean }[][] } | null> {
  const commonHeaders = {
    'Cookie': cookieString(jar),
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': 'application/json, text/plain, */*',
  };

  const tryParse = (text: string, contentType: string | null) => {
    if ((contentType || '').includes('application/json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
      try {
        const json = JSON.parse(text);
        const table = jsonToTable(json);
        if (table.rows.length) return table;
      } catch (_) {
        // ignore
      }
    }

    if (text.includes('<table')) {
      const tableRegex = /<table[\s\S]*?<\/table>/g;
      let match;
      let best: ReturnType<typeof parseTableWithColors> | null = null;
      while ((match = tableRegex.exec(text)) !== null) {
        const parsed = parseTableWithColors(match[0], '');
        if (!best || parsed.rows.length > best.rows.length) best = parsed;
      }
      if (best?.rows.length) return best;
    }

    return null;
  };

  // GET
  try {
    const getResp = await fetch(endpointUrl, { method: 'GET', headers: commonHeaders, redirect: 'follow' });
    Object.assign(jar, extractAllCookies(getResp));
    const text = await getResp.text();
    const parsed = tryParse(decodeHtml(text), getResp.headers.get('content-type'));
    if (parsed) return parsed;
  } catch (_) {
    // ignore
  }

  // POST with CSRF (some DataTables endpoints require POST)
  if (csrf) {
    try {
      const form = new URLSearchParams();
      form.append('_token', csrf);
      const postResp = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          ...commonHeaders,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        body: form.toString(),
        redirect: 'follow',
      });
      Object.assign(jar, extractAllCookies(postResp));
      const text = await postResp.text();
      const parsed = tryParse(decodeHtml(text), postResp.headers.get('content-type'));
      if (parsed) return parsed;
    } catch (_) {
      // ignore
    }
  }

  return null;
}

function jsonToTable(json: unknown): { headers: string[]; rows: string[][]; rawCells: { text: string; isRed: boolean; isGreen: boolean; isOrange: boolean }[][] } {
  const payload = json as Record<string, unknown>;
  const source = Array.isArray(json)
    ? json
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.rows)
        ? payload.rows
        : [];

  if (!Array.isArray(source) || source.length === 0) {
    return { headers: [], rows: [], rawCells: [] };
  }

  if (Array.isArray(source[0])) {
    const rows = source.map((row) => (row as unknown[]).map((cell) => String(cell ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()));
    const rawCells = source.map((row) => (row as unknown[]).map((cell) => {
      const html = String(cell ?? '');
      return {
        text: html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
        isRed: /danger|text-danger|bg-danger|перевірте|здійсніть/i.test(html),
        isGreen: /success|text-success|bg-success/i.test(html),
        isOrange: /warning|text-warning|bg-warning/i.test(html),
      };
    }));
    return { headers: [], rows, rawCells };
  }

  const first = source[0] as Record<string, unknown>;
  const headers = Object.keys(first);
  const rows = (source as Record<string, unknown>[]).map((row) => headers.map((h) => String(row[h] ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()));
  const rawCells = (source as Record<string, unknown>[]).map((row) => headers.map((h) => {
    const html = String(row[h] ?? '');
    return {
      text: html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
      isRed: /danger|text-danger|bg-danger|перевірте|здійсніть/i.test(html),
      isGreen: /success|text-success|bg-success/i.test(html),
      isOrange: /warning|text-warning|bg-warning/i.test(html),
    };
  }));

  return { headers, rows, rawCells };
}

// Extract table data from JavaScript variables (for DataTables/server-side rendered pages)
function extractJsTableData(html: string, washName: string): { headers: string[]; rows: string[][]; rawCells: { text: string; isRed: boolean; isGreen: boolean; isOrange: boolean }[][] } | null {
  // Pattern 1: dataProvider = [{...}]
  const dataProviderMatch = html.match(/dataProvider\s*=\s*(\[[\s\S]*?\]);/);
  if (dataProviderMatch) {
    try {
      const data = JSON.parse(dataProviderMatch[1]);
      if (Array.isArray(data) && data.length > 0) {
        const headers = Object.keys(data[0]);
        const rows = data.map((row: Record<string, unknown>) => headers.map(h => String(row[h] ?? '')));
        const rawCells = rows.map(row => row.map(cell => ({
          text: cell,
          isRed: /здійсніть інкасацію|перевірте картко/i.test(cell),
          isGreen: false,
          isOrange: false,
        })));
        return { headers, rows, rawCells };
      }
    } catch (_) { /* continue */ }
  }

  // Pattern 2: JSON array in window.* variable
  const windowVarMatch = html.match(/window\.\w+\s*=\s*(\[[\s\S]{20,5000}?\]);/);
  if (windowVarMatch) {
    try {
      const data = JSON.parse(windowVarMatch[1]);
      if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
        const headers = Object.keys(data[0]);
        const rows = data.map((row: Record<string, unknown>) => headers.map(h => String(row[h] ?? '')));
        const rawCells = rows.map(row => row.map(cell => ({
          text: cell,
          isRed: /здійсніть інкасацію|перевірте картко/i.test(cell),
          isGreen: false,
          isOrange: false,
        })));
        return { headers, rows, rawCells };
      }
    } catch (_) { /* continue */ }
  }

  // Pattern 3: var terminals = [...] or var data = [...]
  const varMatch = html.match(/var\s+(?:terminals|data|terminalData|stateData)\s*=\s*(\[[\s\S]{10,10000}?\]);/);
  if (varMatch) {
    try {
      const data = JSON.parse(varMatch[1]);
      if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
        const headers = Object.keys(data[0]);
        const rows = data.map((row: Record<string, unknown>) => headers.map(h => String(row[h] ?? '')));
        const rawCells = rows.map(row => row.map(cell => ({
          text: cell,
          isRed: /здійсніть інкасацію|перевірте картко/i.test(cell),
          isGreen: false,
          isOrange: false,
        })));
        return { headers, rows, rawCells };
      }
    } catch (_) { /* continue */ }
  }

  return null;
}

// Convert icon-based HTML cell content to meaningful text symbols
// Luxwash uses FontAwesome icons and Bootstrap colors for status columns like дія, зв'язок, etc.
function extractCellText(cellHtml: string): string {
  const directText = cellHtml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (directText) return directText;
  // Green check / success → ✓
  if (/text-success|bg-success|fa-check|fa-thumbs-up|glyphicon-ok|icon-ok/i.test(cellHtml)) return '✓';
  // Red X / danger → ✗
  if (/text-danger|bg-danger|fa-times|fa-exclamation-circle|fa-ban|glyphicon-remove|icon-remove/i.test(cellHtml)) return '✗';
  // Orange/warning → !
  if (/text-warning|bg-warning|fa-exclamation-triangle|glyphicon-warning/i.test(cellHtml)) return '!';
  // Info/primary
  if (/text-info|bg-info|text-primary|fa-info/i.test(cellHtml)) return 'i';
  // SVG or img with color hints
  if (/<svg|<img/i.test(cellHtml)) {
    if (/green|success/i.test(cellHtml)) return '✓';
    if (/red|danger|error/i.test(cellHtml)) return '✗';
    if (/orange|yellow|warning/i.test(cellHtml)) return '!';
    return '—';
  }
  return '—';
}

// Parse a table HTML with color detection
function parseTableWithColors(tableHtml: string, _washName: string): { headers: string[]; rows: string[][]; rawCells: { text: string; isRed: boolean; isGreen: boolean; isOrange: boolean }[][] } {
  const tHeaders: string[] = [];
  const tRows: string[][] = [];
  const tRawCells: { text: string; isRed: boolean; isGreen: boolean; isOrange: boolean }[][] = [];

  const theadMatch = tableHtml.match(/<thead[^>]*>([\s\S]*?)<\/thead>/);
  if (theadMatch) {
    const thRegex = /<t[hd]([^>]*)>([\s\S]*?)<\/t[hd]>/g;
    let m;
    while ((m = thRegex.exec(theadMatch[1])) !== null) {
      tHeaders.push(m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    }
  }

  const tbodyMatch = tableHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  if (tbodyMatch) {
    const trRegex = /<tr([^>]*)>([\s\S]*?)<\/tr>/g;
    let trMatch;
    while ((trMatch = trRegex.exec(tbodyMatch[1])) !== null) {
      const trAttrs = trMatch[1];
      const trContent = trMatch[2];
      const trIsRed = /class="[^"]*danger|class="[^"]*red/i.test(trAttrs);
      const trIsGreen = /class="[^"]*success|class="[^"]*green/i.test(trAttrs);
      const trIsOrange = /class="[^"]*warning|class="[^"]*yellow/i.test(trAttrs);

      const tdRegex = /<td([^>]*)>([\s\S]*?)<\/td>/g;
      let tdMatch;
      const cells: string[] = [];
      const rCells: { text: string; isRed: boolean; isGreen: boolean; isOrange: boolean }[] = [];
      while ((tdMatch = tdRegex.exec(trContent)) !== null) {
        const tdAttrs = tdMatch[1];
        const cellHtml = tdMatch[2];
        const allHtml = tdAttrs + cellHtml;
        const isRed = trIsRed || /bg-danger|text-danger|class="[^"]*danger[^"]*"|перевірте|здійсніть/i.test(allHtml);
        const isGreen = trIsGreen || /bg-success|text-success|class="[^"]*success[^"]*"/i.test(allHtml);
        const isOrange = trIsOrange || /bg-warning|text-warning|class="[^"]*warning[^"]*"/i.test(allHtml);
        const text = extractCellText(cellHtml);
        const finalIsRed = isRed || text === '✗';
        const finalIsGreen = isGreen || text === '✓';
        const finalIsOrange = isOrange || text === '!';
        cells.push(text);
        rCells.push({ text, isRed: finalIsRed, isGreen: finalIsGreen, isOrange: finalIsOrange });
      }
      if (cells.length > 1) {
        tRows.push(cells);
        tRawCells.push(rCells);
      }
    }
  }

  return { headers: tHeaders, rows: tRows, rawCells: tRawCells };
}

// Luxwash balance from /sim4/news page (shows balance notification block)
async function fetchLuxwashBalance(config: CarWashConfig, jar: Record<string, string>): Promise<{ balance: string; monthlyFee: string }> {
  // Try /sim4/news first (has balance block), then /sim4
  for (const path of ['/sim4/news', '/sim4']) {
    const resp = await fetch(`${config.baseUrl}${path}`, { headers: { 'Cookie': cookieString(jar) }, redirect: 'follow' });
    Object.assign(jar, extractAllCookies(resp));
    const rawHtml = await resp.text();

    // Decode HTML entities first (&nbsp; -> space, etc.)
    const html = rawHtml
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));

    // Strip all HTML tags to get clean text
    const strippedHtml = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    // Match: "Сума балансу складає -900.00 грн" (number may be negative)
    const balanceMatch = strippedHtml.match(/Сума\s+балансу\s+складає\s+([-\d\s,.]+)\s*грн/i);
    // Match fee: "абонплати ... складає 3000 грн"
    const feeMatch = strippedHtml.match(/абонплат[^.]{0,80}складає\s+([\d\s,.]+)\s*грн/i);

    const balance = balanceMatch?.[1]?.replace(/\s/g, '').replace(',', '.').trim() || '';
    const monthlyFee = feeMatch?.[1]?.replace(/\s/g, '').replace(',', '.').trim() || '';

    console.log(`[luxwash] ${config.name} path=${path} balance="${balance}" fee="${monthlyFee}" stripped_sample="${strippedHtml.substring(0,300)}"`);

    if (balance || monthlyFee) {
      return { balance, monthlyFee };
    }
  }
  return { balance: '', monthlyFee: '' };
}

function parseTable(html: string): { headers: string[]; rows: string[][]; totalRow: string[] } {
  const headers: string[] = [];
  const rows: string[][] = [];
  let totalRow: string[] = [];

  const theadMatch = html.match(/<thead[^>]*>([\s\S]*?)<\/thead>/);
  if (theadMatch) {
    const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/g;
    let m;
    while ((m = thRegex.exec(theadMatch[1])) !== null) {
      headers.push(m[1].replace(/<[^>]+>/g, '').trim());
    }
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

const USERS: Record<string, string> = {
  georgen77: '@77negroeG',
  dima: 'kalinin',
};

function verifyAuth(authToken: string): boolean {
  if (!authToken) return false;
  try {
    // Try base64 decode first (btoa format: "username:timestamp")
    let username: string;
    try {
      const decoded = atob(authToken);
      username = decoded.split(':')[0];
    } catch {
      // Not valid base64 — treat as plain "username:timestamp"
      username = authToken.split(':')[0];
    }
    return username.length > 2;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    
    // Auth endpoint
    if (body.action === 'login') {
      const { username, password } = body;
      if (USERS[username] && USERS[username] === password) {
        const token = btoa(`${username}:${Date.now()}`);
        return new Response(
          JSON.stringify({ success: true, token, username }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ success: false, error: 'Невірний логін або пароль' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify auth
    if (!body.authToken || !verifyAuth(body.authToken)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Потрібна авторизація' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { washIndex, dateFrom, dateTo, reportType } = body;
    const now = new Date();
    const formatDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const from = dateFrom || formatDate(now);
    const to = dateTo || formatDate(now);

    // Debug: POST raw to a path with CSRF
    if (body.action === 'debug_post_raw') {
      const config = CAR_WASHES[body.washIdx || 0];
      const { jar } = await loginAndGetSession(config);
      // Get CSRF from states page first
      const statesResp = await fetch(`${config.baseUrl}/sim4/states`, { headers: { 'Cookie': cookieString(jar) }, redirect: 'follow' });
      Object.assign(jar, extractAllCookies(statesResp));
      const statesHtml = await statesResp.text();
      const csrf = statesHtml.match(/meta\s+name="csrf-token"\s+content="([^"]+)"/)?.[1] || '';
      
      const url = `${config.baseUrl}${body.path}`;
      const form = new URLSearchParams();
      form.append('_token', csrf);
      if (body.extraParams) {
        for (const [k, v] of Object.entries(body.extraParams as Record<string, string>)) {
          form.append(k, v);
        }
      }
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': cookieString(jar),
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json, text/html, */*',
        },
        body: form.toString(),
        redirect: 'follow',
      });
      Object.assign(jar, extractAllCookies(resp));
      const text = await resp.text();
      return new Response(
        JSON.stringify({ 
          success: true, 
          url,
          status: resp.status,
          contentType: resp.headers.get('content-type'),
          textSample: text.substring(0, 10000),
          textLength: text.length,
          csrf,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Debug: return raw HTML from a page
    if (body.action === 'debug_page') {
      const config = CAR_WASHES[body.washIdx || 0];
      const { jar } = await loginAndGetSession(config);
      const url = `${config.baseUrl}${body.path || '/sim4/collections'}`;
      const resp = await fetch(url, { headers: { 'Cookie': cookieString(jar) }, redirect: 'follow' });
      Object.assign(jar, extractAllCookies(resp));
      const html = await resp.text();
      const offset = body.offset || 0;
      const htmlSample = html.substring(offset, offset + 15000);
      const scriptContent: string[] = [];
      const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/g;
      let sm;
      while ((sm = scriptRegex.exec(html)) !== null) {
        const content = sm[1].trim();
        if (content.length > 50 && !content.includes('googletagmanager') && !content.includes('gtag')) {
          scriptContent.push(content.substring(0, 3000));
        }
      }
      return new Response(
        JSON.stringify({ 
          success: true, 
          url, 
          status: resp.status, 
          htmlLength: html.length,
          htmlSample,
          scriptContent,
          hasTable: html.includes('<table'),
          hasDataProvider: html.includes('dataProvider'),
          redirected: resp.redirected,
          finalUrl: resp.url,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Technical state report — from /sim4/states
    if (reportType === 'technicalState') {
      const { washName: targetWash } = body;
      const washesToFetch = targetWash
        ? CAR_WASHES.filter(w => w.name === targetWash)
        : CAR_WASHES;
      const results = [];
      for (const config of washesToFetch) {
        try {
          const { jar } = await loginAndGetSession(config);
          const data = await fetchTechnicalState(config, jar);
          results.push({ washName: config.name, ...data });
        } catch (e) {
          results.push({ washName: config.name, error: e.message, headers: [], rows: [], rawCells: [] });
        }
      }
      return new Response(
        JSON.stringify({ success: true, reportType: 'technicalState', results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Luxwash balance
    if (reportType === 'luxwashBalance') {
      const { washName: targetWash } = body;
      const washesToFetch = targetWash
        ? CAR_WASHES.filter(w => w.name === targetWash)
        : CAR_WASHES;
      const results = [];
      for (const config of washesToFetch) {
        try {
          const { jar } = await loginAndGetSession(config);
          const data = await fetchLuxwashBalance(config, jar);
          results.push({ washName: config.name, ...data });
        } catch (e) {
          results.push({ washName: config.name, error: e.message, balance: '', monthlyFee: '' });
        }
      }
      return new Response(
        JSON.stringify({ success: true, reportType: 'luxwashBalance', results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Analytics report — POST to /sim4/states/analytics (Vue AJAX endpoint)
    if (reportType === 'analytics') {
      const { washName: targetWash } = body;
      const washesToFetch = targetWash
        ? CAR_WASHES.filter(w => w.name === targetWash)
        : CAR_WASHES;
      const results = [];

      for (const config of washesToFetch) {
        try {
          const { jar } = await loginAndGetSession(config);

          // Load states page first to get CSRF
          const statesResp = await fetch(`${config.baseUrl}/sim4/states`, {
            headers: { 'Cookie': cookieString(jar), 'Accept': 'text/html,*/*' },
            redirect: 'follow',
          });
          Object.assign(jar, extractAllCookies(statesResp));
          const statesHtml = await statesResp.text();
          const csrf = statesHtml.match(/meta\s+name="csrf-token"\s+content="([^"]+)"/)?.[1] || '';

          // POST to Vue AJAX endpoint
          const form = new URLSearchParams();
          form.append('_token', csrf);
          const resp = await fetch(`${config.baseUrl}/sim4/states/analytics`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Cookie': cookieString(jar),
              'X-Requested-With': 'XMLHttpRequest',
              'Accept': 'text/html, */*',
            },
            body: form.toString(),
            redirect: 'follow',
          });
          Object.assign(jar, extractAllCookies(resp));
          const html = decodeHtml(await resp.text());

          console.log(`[analytics] ${config.name} htmlLength=${html.length} hasTable=${html.includes('<table')}`);

          const tableRegex = /<table[\s\S]*?<\/table>/g;
          let tableMatch;
          let best: { headers: string[]; rows: string[][]; rawCells: { text: string; isRed: boolean; isGreen: boolean; isOrange: boolean }[][] } | null = null;
          while ((tableMatch = tableRegex.exec(html)) !== null) {
            const parsed = parseTableWithColors(tableMatch[0], config.name);
            if (parsed.rows.length > 0 && (!best || parsed.rows.length > best.rows.length)) {
              best = parsed;
            }
          }

          if (best?.rows.length) {
            results.push({ washName: config.name, headers: best.headers, rows: best.rows, rawCells: best.rawCells });
          } else {
            results.push({ washName: config.name, headers: [], rows: [], rawCells: [] });
          }
        } catch (e) {
          results.push({ washName: config.name, error: e.message, headers: [], rows: [], rawCells: [] });
        }
      }

      return new Response(
        JSON.stringify({ success: true, reportType: 'analytics', results, period: { from, to } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Full summary report (повний підсумковий звіт)
    if (reportType === 'fullSummary') {
      const { washName: targetWash } = body;
      const washesToFetch = targetWash
        ? CAR_WASHES.filter(w => w.name === targetWash)
        : CAR_WASHES;
      const results = [];
      for (const config of washesToFetch) {
        try {
          const { jar } = await loginAndGetSession(config);
          const parsed = await fetchSummaryReport(config, jar, from, to, 'full');
          results.push({ washName: config.name, ...parsed });
        } catch (e) {
          results.push({ washName: config.name, error: e.message, headers: [], rows: [], totalRow: [] });
        }
      }
      return new Response(
        JSON.stringify({ success: true, reportType: 'fullSummary', results, period: { from, to } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Card payments report — fetch transaction report filtered for card/non-cash
    if (reportType === 'cardPayments') {
      const { washName: targetWash } = body;
      const last30From = new Date();
      last30From.setDate(last30From.getDate() - 30);
      const cardFrom = from || `${last30From.getFullYear()}-${String(last30From.getMonth()+1).padStart(2,'0')}-${String(last30From.getDate()).padStart(2,'0')}`;
      const cardTo = to;
      
      const washIdx = targetWash ? CAR_WASHES.findIndex(w => w.name === targetWash) : -1;
      const washesToFetch = washIdx >= 0 ? [CAR_WASHES[washIdx]] : CAR_WASHES;
      const results = [];
      
      for (const config of washesToFetch) {
        try {
          const { jar } = await loginAndGetSession(config);
          const reportUrl = `${config.baseUrl}/sim4/transaction/report`;
          const { csrf } = await getCsrfAndHtml(reportUrl, jar);
          
          const form = new URLSearchParams();
          form.append('_token', csrf);
          form.append('date_start', cardFrom);
          form.append('date_end', cardTo);
          form.append('report_type', 'simplified');
          form.append('cards', 'cards'); // only card/non-cash
          
          const resp = await fetch(reportUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookieString(jar) },
            body: form.toString(),
            redirect: 'follow',
          });
          Object.assign(jar, extractAllCookies(resp));
          const parsed = parseTable(await resp.text());
          results.push({ washName: config.name, ...parsed });
        } catch (e) {
          results.push({ washName: config.name, error: e.message, headers: [], rows: [], totalRow: [] });
        }
      }
      
      return new Response(
        JSON.stringify({ success: true, reportType: 'cardPayments', results, period: { from: cardFrom, to: cardTo } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extra report types
    if (reportType === 'collections' || reportType === 'bonuses' || reportType === 'middleCheck' || reportType === 'clientsCount') {
      const results = [];
      for (let i = 0; i < CAR_WASHES.length; i++) {
        try {
          const config = CAR_WASHES[i];
          const { jar } = await loginAndGetSession(config);
          
          let data: any;
          if (reportType === 'collections') {
            data = await fetchCollections(config, jar, from, to);
          } else if (reportType === 'bonuses') {
            data = await fetchBonusesReport(config, jar, from, to);
          } else if (reportType === 'middleCheck') {
            data = await fetchMiddleCheckData(config, jar, from, to);
          } else if (reportType === 'clientsCount') {
            data = await fetchClientsCountData(config, jar, from, to);
          }
          results.push({ washName: config.name, ...data });
        } catch (e) {
          results.push({ washName: CAR_WASHES[i].name, error: e.message });
        }
      }
      return new Response(
        JSON.stringify({ success: true, reportType, results, period: { from, to } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Default: summary report
    if (washIndex === 'all') {
      const results = [];
      for (let i = 0; i < CAR_WASHES.length; i++) {
        try {
          const config = CAR_WASHES[i];
          const { jar } = await loginAndGetSession(config);
          const summary = await fetchSummaryReport(config, jar, from, to);
          results.push({ washName: config.name, ...summary });
        } catch (e) {
          results.push({ washName: CAR_WASHES[i].name, error: e.message, headers: [], rows: [], totalRow: [] });
        }
      }
      return new Response(
        JSON.stringify({ success: true, results, period: { from, to } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const idx = washIndex ?? 0;
    const config = CAR_WASHES[idx];
    if (!config) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid wash index' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { jar } = await loginAndGetSession(config);
    const summary = await fetchSummaryReport(config, jar, from, to);

    return new Response(
      JSON.stringify({ success: true, washName: config.name, ...summary, period: { from, to } }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
