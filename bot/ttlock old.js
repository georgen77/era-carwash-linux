// ── TTLOCK MODULE для ERA Apartments ─────────────────────────────────────────
// EU сервер: euopen.ttlock.com
// Документация: https://euopen.ttlock.com/document

const axios = require('axios');
const crypto = require('crypto');

const TTLOCK_BASE = 'https://euapi.ttlock.com/v3';

// ── КОНФИГУРАЦИЯ ЗАМКОВ ───────────────────────────────────────────────────────
// Lock ID берётся из .env если есть, иначе используем реальные значения ERA
const LOCKS = {
  piral_1:     { lockId: process.env.TTLOCK_LOCK_PIRAL1     || '18763918', name: 'Оазис 1 (вход)' },
  piral_2:     { lockId: process.env.TTLOCK_LOCK_PIRAL2     || '9774531',  name: 'Оазис 2 (вход)' },
  salvador:    { lockId: process.env.TTLOCK_LOCK_SALVADOR   || '15975416', name: 'Сальвадор (вход)' },
  piral_1_spa: { lockId: process.env.TTLOCK_LOCK_PIRAL1_SPA || '17498988', name: 'Оазис 1 Спа' },
  piral_2_spa: { lockId: process.env.TTLOCK_LOCK_PIRAL2_SPA || '19463642', name: 'Оазис 2 Спа' },
};

// Какие замки открывает каждый апартамент
const APT_LOCKS = {
  piral_1:  ['piral_1'],
  piral_2:  ['piral_2'],
  grande:   ['piral_1', 'piral_2'],
  salvador: ['salvador'],
};

// Спа-замки — только если в брони есть задание spa
const SPA_LOCKS = {
  piral_1: 'piral_1_spa',
  piral_2: 'piral_2_spa',
  grande:  ['piral_1_spa', 'piral_2_spa'],
};

// ── АВТОРИЗАЦИЯ ───────────────────────────────────────────────────────────────
let _tokenCache = null;

async function getToken() {
  // Кэшируем токен — TTLock токены живут долго
  if (_tokenCache && _tokenCache.expires > Date.now()) return _tokenCache.token;

  const params = new URLSearchParams({
    clientId:     process.env.TTLOCK_CLIENT_ID,
    clientSecret: md5(process.env.TTLOCK_CLIENT_SECRET || ''),
    username:     process.env.TTLOCK_USERNAME,  // логин обычного TTLock аккаунта
    password:     md5(process.env.TTLOCK_PASSWORD || ''),
    grant_type:   'password',
  });

  const r = await axios.post('https://euapi.ttlock.com/oauth2/token', params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  if (!r.data.access_token) throw new Error('TTLock auth failed: ' + JSON.stringify(r.data));

  _tokenCache = {
    token:   r.data.access_token,
    expires: Date.now() + (r.data.expires_in - 60) * 1000,
  };
  return _tokenCache.token;
}

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

// ── ГЕНЕРАЦИЯ КОДА ────────────────────────────────────────────────────────────
function generateCode() {
  // Случайный 6-значный код (не начинается с 0)
  return String(Math.floor(100000 + Math.random() * 900000));
}

function formatCodeForDisplay(code) {
  // Показываем код красиво: 123-456
  return code.slice(0, 3) + '-' + code.slice(3);
}

// ── ВРЕМЯ ДЕЙСТВИЯ КОДА ───────────────────────────────────────────────────────
function getCodeTimes(checkinDate, checkoutDate) {
  // Начало: 15:00 дня заезда
  var startDate = new Date(checkinDate + 'T15:00:00');
  // Конец: 11:00 дня выезда
  var endDate   = new Date(checkoutDate + 'T11:00:00');
  return {
    startDate: startDate.getTime(),
    endDate:   endDate.getTime(),
    startStr:  checkinDate + ' 15:00',
    endStr:    checkoutDate + ' 11:00',
  };
}

// ── СОЗДАТЬ PASSCODE ──────────────────────────────────────────────────────────
async function createPasscode(lockId, code, startDate, endDate, name) {
  const token = await getToken();
  const params = new URLSearchParams({
    clientId:    process.env.TTLOCK_CLIENT_ID,
    accessToken: token,
    lockId:      lockId,
    passCode:    code,
    passCodeType: 3,  // 3 = timed passcode
    startDate:   startDate,
    endDate:     endDate,
    name:        name || 'Guest',
    date:        Date.now(),
  });

  const r = await axios.post(TTLOCK_BASE + '/lock/addPassCode', params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  if (r.data.errcode && r.data.errcode !== 0) {
    throw new Error('TTLock error ' + r.data.errcode + ': ' + r.data.errmsg);
  }
  return r.data;
}

// ── УДАЛИТЬ PASSCODE ──────────────────────────────────────────────────────────
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

  if (r.data.errcode && r.data.errcode !== 0) {
    throw new Error('TTLock error ' + r.data.errcode + ': ' + r.data.errmsg);
  }
  return r.data;
}

// ── СПИСОК ПАРОЛЕЙ ЗАМКА ──────────────────────────────────────────────────────
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
  if (r.data.errcode && r.data.errcode !== 0) {
    throw new Error('TTLock error ' + r.data.errcode + ': ' + r.data.errmsg);
  }
  return r.data.list || [];
}

// ── СПИСОК ВСЕХ ЗАМКОВ АККАУНТА ───────────────────────────────────────────────
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
  if (r.data.errcode && r.data.errcode !== 0) {
    throw new Error('TTLock error ' + r.data.errcode + ': ' + r.data.errmsg);
  }
  return r.data.list || [];
}

// ── ГЛАВНАЯ ФУНКЦИЯ: СОЗДАТЬ КОД ДЛЯ АПАРТАМЕНТА ────────────────────────────
// apartment: piral_1 / piral_2 / grande / salvador
// checkinDate / checkoutDate: 'YYYY-MM-DD'
// hasSpa: boolean
// customCode: опционально (если не указан — генерируем)
async function createGuestCode(apartment, checkinDate, checkoutDate, hasSpa, customCode) {
  var code = customCode || generateCode();
  var times = getCodeTimes(checkinDate, checkoutDate);
  var lockKeys = APT_LOCKS[apartment] || [apartment];
  var results = [];

  // Основные замки
  for (var i = 0; i < lockKeys.length; i++) {
    var lockKey = lockKeys[i];
    var lock = LOCKS[lockKey];
    if (!lock || !lock.lockId) {
      results.push({ lock: lockKey, success: false, error: 'Lock ID не настроен' });
      continue;
    }
    try {
      var r = await createPasscode(lock.lockId, code, times.startDate, times.endDate,
        'Guest ' + checkinDate);
      results.push({ lock: lockKey, name: lock.name, success: true, keyboardPwdId: r.keyboardPwdId });
    } catch(e) {
      results.push({ lock: lockKey, name: lock.name, success: false, error: e.message });
    }
  }

  // Спа-замки (если есть задание spa)
  if (hasSpa && SPA_LOCKS[apartment]) {
    var spaKeys = Array.isArray(SPA_LOCKS[apartment]) ? SPA_LOCKS[apartment] : [SPA_LOCKS[apartment]];
    for (var j = 0; j < spaKeys.length; j++) {
      var spaLock = LOCKS[spaKeys[j]];
      if (!spaLock || !spaLock.lockId) continue;
      try {
        var sr = await createPasscode(spaLock.lockId, code, times.startDate, times.endDate,
          'Guest SPA ' + checkinDate);
        results.push({ lock: spaKeys[j], name: spaLock.name, success: true, keyboardPwdId: sr.keyboardPwdId, isSpa: true });
      } catch(e) {
        results.push({ lock: spaKeys[j], name: spaLock.name, success: false, error: e.message, isSpa: true });
      }
    }
  }

  return {
    code:       code,
    codeDisplay: formatCodeForDisplay(code),
    apartment:  apartment,
    checkin:    checkinDate,
    checkout:   checkoutDate,
    validFrom:  times.startStr,
    validTo:    times.endStr,
    hasSpa:     hasSpa,
    results:    results,
    allOk:      results.every(function(r){ return r.success; }),
  };
}

module.exports = {
  LOCKS,
  APT_LOCKS,
  SPA_LOCKS,
  generateCode,
  formatCodeForDisplay,
  getCodeTimes,
  createPasscode,
  deletePasscode,
  getPasscodes,
  getLocks,
  createGuestCode,
  getToken,
};
