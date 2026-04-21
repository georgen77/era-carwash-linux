// ── TTLOCK MODULE для ERA Apartments v2 ──────────────────────────────────────
const axios = require('axios');
const crypto = require('crypto');

const TTLOCK_BASE = 'https://euapi.ttlock.com/v3';

const LOCKS = {
  piral_1:     { lockId: process.env.TTLOCK_LOCK_PIRAL1     || '18763918', name: 'Оазис 1 (вход)' },
  piral_2:     { lockId: process.env.TTLOCK_LOCK_PIRAL2     || '9774531',  name: 'Оазис 2 (вход)' },
  salvador:    { lockId: process.env.TTLOCK_LOCK_SALVADOR   || '15975416', name: 'Сальвадор (вход)' },
  piral_1_spa: { lockId: process.env.TTLOCK_LOCK_PIRAL1_SPA || '17498988', name: 'Оазис 1 Спа' },
  piral_2_spa: { lockId: process.env.TTLOCK_LOCK_PIRAL2_SPA || '19463642', name: 'Оазис 2 Спа' },
};

const APT_LOCKS = {
  piral_1:  ['piral_1'],
  piral_2:  ['piral_2'],
  grande:   ['piral_1', 'piral_2'],
  salvador: ['salvador'],
};

const SPA_LOCKS = {
  piral_1: 'piral_1_spa',
  piral_2: 'piral_2_spa',
  grande:  ['piral_1_spa', 'piral_2_spa'],
};

let _tokenCache = null;

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

async function getToken() {
  if (_tokenCache && _tokenCache.expires > Date.now()) return _tokenCache.token;

  var clientId = process.env.TTLOCK_CLIENT_ID || '';
  var clientSecret = process.env.TTLOCK_CLIENT_SECRET || '';
  var username = process.env.TTLOCK_USERNAME || '';
  var password = process.env.TTLOCK_PASSWORD || '';

  console.log('[TTLock] Auth attempt:');
  console.log('  clientId:', clientId.slice(0,8) + '...' + clientId.slice(-4));
  console.log('  username:', username);
  console.log('  password MD5:', md5(password).slice(0,8) + '...');

  const params = new URLSearchParams({
    clientId:     clientId,
    clientSecret: md5(clientSecret),
    username:     username,
    password:     md5(password),
    grant_type:   'password',
  });

  var r = await axios.post('https://euapi.ttlock.com/oauth2/token', params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  console.log('[TTLock] Auth response:', JSON.stringify(r.data).slice(0, 200));

  if (!r.data.access_token) throw new Error('TTLock auth failed: ' + JSON.stringify(r.data));

  _tokenCache = {
    token:   r.data.access_token,
    expires: Date.now() + (r.data.expires_in - 60) * 1000,
  };
  console.log('[TTLock] Token получен!');
  return _tokenCache.token;
}

function generateCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function formatCodeForDisplay(code) {
  return code;
}

function getCodeTimes(checkinDate, checkoutDate) {
  var startDate = new Date(checkinDate + 'T15:00:00');
  var endDate   = new Date(checkoutDate + 'T11:00:00');
  return {
    startDate: startDate.getTime(),
    endDate:   endDate.getTime(),
    startStr:  checkinDate + ' 15:00',
    endStr:    checkoutDate + ' 11:00',
  };
}

async function createPasscode(lockId, code, startDate, endDate, name) {
  const token = await getToken();
  const params = new URLSearchParams({
    clientId:    process.env.TTLOCK_CLIENT_ID,
    accessToken: token,
    lockId:      lockId,
    passCode:    code,
    passCodeType: 3,
    startDate:   startDate,
    endDate:     endDate,
    name:        name || 'Guest',
    date:        Date.now(),
  });

  const r = await axios.post(TTLOCK_BASE + '/lock/addPassCode', params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  console.log('[TTLock] createPasscode response:', JSON.stringify(r.data));
  if (r.data.errcode && r.data.errcode !== 0) {
    throw new Error('TTLock error ' + r.data.errcode + ': ' + r.data.errmsg);
  }
  return r.data;
}

async function deletePasscode(lockId, keyboardPwdId) {
  const token = await getToken();
  const params = new URLSearchParams({
    clientId:       process.env.TTLOCK_CLIENT_ID,
    accessToken:    token,
    lockId:         lockId,
    keyboardPwdId:  keyboardPwdId,
    deleteType:     2,
    date:           Date.now(),
  });
  const r = await axios.post(TTLOCK_BASE + '/lock/deletePassCode', params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  if (r.data.errcode && r.data.errcode !== 0) throw new Error('TTLock error ' + r.data.errcode + ': ' + r.data.errmsg);
  return r.data;
}

async function getPasscodes(lockId) {
  const token = await getToken();
  const params = new URLSearchParams({
    clientId:    process.env.TTLOCK_CLIENT_ID,
    accessToken: token,
    lockId:      lockId,
    pageNo:      1,
    pageSize:    20,
    date:        Date.now(),
  });
  const r = await axios.get(TTLOCK_BASE + '/lock/listKeyboardPwd?' + params.toString());
  if (r.data.errcode && r.data.errcode !== 0) throw new Error('TTLock error ' + r.data.errcode + ': ' + r.data.errmsg);
  return r.data.list || [];
}

async function getLocks() {
  const token = await getToken();
  const params = new URLSearchParams({
    clientId:    process.env.TTLOCK_CLIENT_ID,
    accessToken: token,
    pageNo:      1,
    pageSize:    20,
    date:        Date.now(),
  });
  const r = await axios.get(TTLOCK_BASE + '/lock/list?' + params.toString());
  if (r.data.errcode && r.data.errcode !== 0) throw new Error('TTLock error ' + r.data.errcode + ': ' + r.data.errmsg);
  return r.data.list || [];
}

async function createGuestCode(apartment, checkinDate, checkoutDate, hasSpa, customCode) {
  var code = customCode || generateCode();
  var times = getCodeTimes(checkinDate, checkoutDate);
  var lockKeys = APT_LOCKS[apartment] || [apartment];
  var results = [];

  for (var i = 0; i < lockKeys.length; i++) {
    var lock = LOCKS[lockKeys[i]];
    if (!lock || !lock.lockId) { results.push({ lock: lockKeys[i], success: false, error: 'Lock ID не настроен' }); continue; }
    try {
      var r = await createPasscode(lock.lockId, code, times.startDate, times.endDate, 'Guest ' + checkinDate);
      results.push({ lock: lockKeys[i], name: lock.name, success: true, keyboardPwdId: r.keyboardPwdId });
    } catch(e) {
      results.push({ lock: lockKeys[i], name: lock.name, success: false, error: e.message });
    }
  }

  if (hasSpa && SPA_LOCKS[apartment]) {
    var spaKeys = Array.isArray(SPA_LOCKS[apartment]) ? SPA_LOCKS[apartment] : [SPA_LOCKS[apartment]];
    for (var j = 0; j < spaKeys.length; j++) {
      var spaLock = LOCKS[spaKeys[j]];
      if (!spaLock || !spaLock.lockId) continue;
      try {
        var sr = await createPasscode(spaLock.lockId, code, times.startDate, times.endDate, 'Guest SPA ' + checkinDate);
        results.push({ lock: spaKeys[j], name: spaLock.name, success: true, keyboardPwdId: sr.keyboardPwdId, isSpa: true });
      } catch(e) {
        results.push({ lock: spaKeys[j], name: spaLock.name, success: false, error: e.message, isSpa: true });
      }
    }
  }

  return {
    code, codeDisplay: formatCodeForDisplay(code),
    apartment, checkin: checkinDate, checkout: checkoutDate,
    validFrom: times.startStr, validTo: times.endStr,
    hasSpa, results,
    allOk: results.every(function(r){ return r.success; }),
  };
}

module.exports = { LOCKS, APT_LOCKS, SPA_LOCKS, generateCode, formatCodeForDisplay, getCodeTimes, createPasscode, deletePasscode, getPasscodes, getLocks, createGuestCode, getToken };
