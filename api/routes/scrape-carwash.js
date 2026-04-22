require('dotenv').config();
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.CW_DATABASE_URL || process.env.DATABASE_URL });

const CAR_WASHES = [
  { name: 'Усатово',  baseUrl: 'https://sim5.gteh.com.ua', login: process.env.WASH_USATOVO_LOGIN  || 'odessa8',      password: process.env.WASH_USATOVO_PASS  || 'odessa828122020' },
  { name: 'Корсунцы', baseUrl: 'https://sim4.gteh.com.ua', login: process.env.WASH_KORSUNTSY_LOGIN || 'krasnosilka',  password: process.env.WASH_KORSUNTSY_PASS || 'krasnosilka221119' },
  { name: 'Левитана', baseUrl: 'https://sim5.gteh.com.ua', login: process.env.WASH_LEVITANA_LOGIN  || 'odesa11',      password: process.env.WASH_LEVITANA_PASS  || 'dimakalinin' },
];

function extractAllCookies(response) {
  const cookies = {};
  const raw = response.headers.get('set-cookie');
  if (!raw) return cookies;
  const parts = raw.split(/,(?=\s*[a-zA-Z_]+=)/);
  for (const part of parts) {
    const nameVal = part.split(';')[0].trim();
    const eq = nameVal.indexOf('=');
    if (eq > 0) cookies[nameVal.substring(0, eq).trim()] = nameVal.substring(eq + 1);
  }
  return cookies;
}

function cookieString(cookies) {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function loginAndGetSession(config) {
  const jar = {};
  const addCookies = (resp) => Object.assign(jar, extractAllCookies(resp));
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

async function getCsrfAndHtml(url, jar) {
  const resp = await fetch(url, { headers: { 'Cookie': cookieString(jar) } });
  Object.assign(jar, extractAllCookies(resp));
  const html = await resp.text();
  const csrf = html.match(/name="_token"\s+value="([^"]+)"/)?.[1] || '';
  return { csrf, html };
}

function parseTable(html) {
  const headers = [];
  const rows = [];
  let totalRow = [];
  const theadMatch = html.match(/<thead[^>]*>([\s\S]*?)<\/thead>/);
  if (theadMatch) {
    const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/g;
    let m;
    while ((m = thRegex.exec(theadMatch[1])) !== null) headers.push(m[1].replace(/<[^>]+>/g, '').trim());
  }
  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  if (tbodyMatch) {
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let trMatch;
    while ((trMatch = trRegex.exec(tbodyMatch[1])) !== null) {
      const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
      let tdMatch;
      const cells = [];
      while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) cells.push(tdMatch[1].replace(/<[^>]+>/g, '').trim());
      if (cells.length > 0) rows.push(cells);
    }
  }
  const tfootMatch = html.match(/<tfoot[^>]*>([\s\S]*?)<\/tfoot>/);
  if (tfootMatch) {
    const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g;
    let m;
    while ((m = tdRegex.exec(tfootMatch[1])) !== null) totalRow.push(m[1].replace(/<[^>]+>/g, '').trim());
  }
  return { headers, rows, totalRow };
}

function decodeHtml(value) {
  return value.replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(parseInt(n)));
}

function extractCellText(cellHtml) {
  const directText = cellHtml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (directText) return directText;
  if (/text-success|bg-success|fa-check/i.test(cellHtml)) return '✓';
  if (/text-danger|bg-danger|fa-times/i.test(cellHtml)) return '✗';
  if (/text-warning|bg-warning/i.test(cellHtml)) return '!';
  return '—';
}

function parseTableWithColors(tableHtml) {
  const tHeaders = [];
  const tRows = [];
  const tRawCells = [];
  const theadMatch = tableHtml.match(/<thead[^>]*>([\s\S]*?)<\/thead>/);
  if (theadMatch) {
    const thRegex = /<t[hd]([^>]*)>([\s\S]*?)<\/t[hd]>/g;
    let m;
    while ((m = thRegex.exec(theadMatch[1])) !== null) tHeaders.push(m[2].replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim());
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
      const trIsOrange = /class="[^"]*warning/i.test(trAttrs);
      const tdRegex = /<td([^>]*)>([\s\S]*?)<\/td>/g;
      let tdMatch;
      const cells = [];
      const rCells = [];
      while ((tdMatch = tdRegex.exec(trContent)) !== null) {
        const tdAttrs = tdMatch[1];
        const cellHtml = tdMatch[2];
        const allHtml = tdAttrs + cellHtml;
        const isRed = trIsRed || /bg-danger|text-danger|перевірте|здійсніть/i.test(allHtml);
        const isGreen = trIsGreen || /bg-success|text-success/i.test(allHtml);
        const isOrange = trIsOrange || /bg-warning|text-warning/i.test(allHtml);
        const text = extractCellText(cellHtml);
        cells.push(text);
        rCells.push({ text, isRed: isRed || text==='✗', isGreen: isGreen || text==='✓', isOrange: isOrange || text==='!' });
      }
      if (cells.length > 1) { tRows.push(cells); tRawCells.push(rCells); }
    }
  }
  return { headers: tHeaders, rows: tRows, rawCells: tRawCells };
}

async function fetchSummaryReport(config, jar, dateFrom, dateTo, reportTypeParam = 'simplified') {
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

function buildDateTimes(dateFrom, dateTo) {
  return `${dateFrom} 00:00:00 - ${dateTo} 23:59:59`;
}

async function fetchCollections(config, jar, dateFrom, dateTo) {
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
  return parseTable(await resp.text());
}

async function fetchTechnicalState(config, jar) {
  const statesResp = await fetch(`${config.baseUrl}/sim4/states`, { headers: { 'Cookie': cookieString(jar) }, redirect: 'follow' });
  Object.assign(jar, extractAllCookies(statesResp));
  const statesHtml = await statesResp.text();
  const csrf = statesHtml.match(/meta\s+name="csrf-token"\s+content="([^"]+)"/)?.[1] || '';
  const form = new URLSearchParams();
  form.append('_token', csrf);
  const resp = await fetch(`${config.baseUrl}/sim4/states/characteristics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookieString(jar), 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'text/html, */*' },
    body: form.toString(),
    redirect: 'follow',
  });
  Object.assign(jar, extractAllCookies(resp));
  const html = decodeHtml(await resp.text());
  const tableRegex = /<table[\s\S]*?<\/table>/g;
  let tableMatch;
  let bestTable = null;
  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const result = parseTableWithColors(tableMatch[0]);
    if (result.rows.length > 0 && (!bestTable || result.rows.length > bestTable.rows.length)) bestTable = result;
  }
  if (bestTable) return bestTable;
  return { headers: [], rows: [], rawCells: [] };
}

async function verifyUserPassword(username, password) {
  try {
    const res = await pool.query(
      "SELECT public.crypt($2, password_hash) = password_hash AS ok FROM public.app_users WHERE username=$1 AND is_active=true",
      [username, password]
    );
    return res.rows[0]?.ok === true;
  } catch (e) {
    console.error('[scrape-carwash] DB auth error:', e.message);
    return false;
  }
}

router.post('/scrape-carwash', async (req, res) => {
  try {
    const body = req.body;
    const now = new Date();
    const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const from = body.dateFrom || formatDate(now);
    const to = body.dateTo || formatDate(now);

    if (body.action === 'login') {
      const { username, password } = body;
      const ok = await verifyUserPassword(username, password);
      if (ok) {
        const token = Buffer.from(`${username}:${Date.now()}`).toString('base64');
        return res.json({ success: true, token, username });
      }
      return res.status(401).json({ success: false, error: 'Невірний логін або пароль' });
    }

    if (!body.authToken) return res.status(401).json({ success: false, error: 'Потрібна авторизація' });

    const { washIndex, reportType } = body;

    if (reportType === 'technicalState') {
      const { washName: targetWash } = body;
      const washesToFetch = targetWash ? CAR_WASHES.filter(w => w.name === targetWash) : CAR_WASHES;
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
      return res.json({ success: true, reportType: 'technicalState', results });
    }

    if (reportType === 'fullSummary') {
      const { washName: targetWash } = body;
      const washesToFetch = targetWash ? CAR_WASHES.filter(w => w.name === targetWash) : CAR_WASHES;
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
      return res.json({ success: true, reportType: 'fullSummary', results, period: { from, to } });
    }

    if (reportType === 'collections') {
      const results = [];
      for (const config of CAR_WASHES) {
        try {
          const { jar } = await loginAndGetSession(config);
          const data = await fetchCollections(config, jar, from, to);
          results.push({ washName: config.name, ...data });
        } catch (e) {
          results.push({ washName: config.name, error: e.message });
        }
      }
      return res.json({ success: true, reportType, results, period: { from, to } });
    }

    if (washIndex === 'all') {
      const results = [];
      for (const config of CAR_WASHES) {
        try {
          const { jar } = await loginAndGetSession(config);
          const summary = await fetchSummaryReport(config, jar, from, to);
          results.push({ washName: config.name, ...summary });
        } catch (e) {
          results.push({ washName: config.name, error: e.message, headers: [], rows: [], totalRow: [] });
        }
      }
      return res.json({ success: true, results, period: { from, to } });
    }

    const idx = washIndex ?? 0;
    const config = CAR_WASHES[idx];
    if (!config) return res.status(400).json({ success: false, error: 'Invalid wash index' });
    const { jar } = await loginAndGetSession(config);
    const summary = await fetchSummaryReport(config, jar, from, to);
    return res.json({ success: true, washName: config.name, ...summary, period: { from, to } });
  } catch (error) {
    console.error('[scrape-carwash] error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
