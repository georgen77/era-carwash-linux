require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

const TOKEN = process.env.TELEGRAM_TOKEN;
const BOT_SECRET = process.env.BOT_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const IRINA_CHAT_ID = String(process.env.IRINA_CHAT_ID || '');
const EMMA_CHAT_ID = String(process.env.EMMA_CHAT_ID || '');
const OWNER_CHAT_ID = String(process.env.OWNER_CHAT_ID || '');
const ALBERT_CHAT_ID = String(process.env.ALBERT_CHAT_ID || '283232453');
const LAUNDRY_GROUP_ID = String(process.env.LAUNDRY_GROUP_ID || '-4932651198');
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const TASK_TYPES_FILE = './task_types.json';

// ── TTLOCK ────────────────────────────────────────────────────────────────────
var ttlock = null;
var TTLOCK_ENABLED = !!(process.env.TTLOCK_CLIENT_ID && process.env.TTLOCK_USERNAME);
if (TTLOCK_ENABLED) {
  try { ttlock = require('./ttlock'); console.log('[TTLock] Модуль загружен'); }
  catch(e) { console.error('[TTLock] Ошибка загрузки:', e.message); TTLOCK_ENABLED = false; }
} else {
  console.log('[TTLock] Не настроен (добавь TTLOCK_CLIENT_ID и TTLOCK_USERNAME в .env)');
}

const bot = new TelegramBot(TOKEN, { polling: true });

// ── КОНСТАНТЫ ─────────────────────────────────────────────────────
const APT_NAMES = { piral_1: 'Оазис 1', piral_2: 'Оазис 2', grande: 'Гранде', salvador: 'Сальвадор' };
function normalizeApt(apt) {
  if (!apt) return apt;
  var map = {
    'piral': 'piral_1', 'oasis': 'piral_1', 'оазис': 'piral_1',
    'oasis1': 'piral_1', 'оазис1': 'piral_1', 'оазис 1': 'piral_1',
    'oasis2': 'piral_2', 'оазис2': 'piral_2', 'оазис 2': 'piral_2',
    'grande': 'grande', 'гранде': 'grande',
    'salvador': 'salvador', 'сальвадор': 'salvador',
  };
  return map[apt.toLowerCase()] || apt;
}
const APT_SHORT = { piral_1: 'Оаз1', piral_2: 'Оаз2', grande: 'Гран', salvador: 'Сал' };
const APT_DIRTY = { piral_1: 'dirty_linen_piral', piral_2: 'dirty_linen_piral', grande: 'dirty_linen_piral', salvador: 'dirty_linen_salvador' };
const CLEANING_FEE = { piral_1: 35, piral_2: 35, grande: 35, salvador: 35 };

// ── КАТЕГОРИИ РАСХОДОВ ────────────────────────────────────────────
const EXPENSE_CATEGORIES = [
  { name: 'Оплата клининга', keywords: ['клининг','уборк','уборщ','марьян','оля','вика','ольга','cleaner','cleaning','зарплат','выплат'] },
  { name: 'Расходники для гостей', keywords: ['гост','шампун','гель','мыло','туалет','кофе','чай','сахар','amenities','toiletries','посуд','стакан','тарелк'] },
  { name: 'Хозяйственные товары', keywords: ['хозяйств','моющ','чистящ','швабр','тряпк','перчатк','мешок','пакет','губк','порошок','средств','бытов','household'] },
  { name: 'Ремонт и обслуживание', keywords: ['ремонт','сантехник','электрик','мастер','поломк','замен','repair','maintenance','fix'] },
  { name: 'Коммунальные услуги', keywords: ['электричеств','вода','газ','интернет','wifi','коммунал','utilities'] },
  { name: 'Стирка и бельё', keywords: ['стирк','бельё','белье','альберт','прачечн','полотенц','простын','laundry'] },
  { name: 'Маркетинг', keywords: ['реклам','airbnb','holidu','booking','комисс','маркетинг','продвижен'] },
];

function mapExpenseCategory(rawCategory, description) {
  var text = ((rawCategory || '') + ' ' + (description || '')).toLowerCase();
  for (var i = 0; i < EXPENSE_CATEGORIES.length; i++) {
    var cat = EXPENSE_CATEGORIES[i];
    for (var j = 0; j < cat.keywords.length; j++) {
      if (text.includes(cat.keywords[j])) return cat.name;
    }
  }
  // Если не нашли — возвращаем оригинальную категорию или «Прочее»
  return rawCategory || 'Прочее';
}

const LINEN_ITEMS = [
  { key: 'sheets', name: 'Простыни', short: 'Просты' },
  { key: 'duvet_covers', name: 'Пододеяльники', short: 'Пододея' },
  { key: 'pillowcases', name: 'Наволочки', short: 'Наволоч' },
  { key: 'large_towels', name: 'Большие полотенца', short: 'Бол.пол' },
  { key: 'small_towels', name: 'Малые полотенца', short: 'Мал.пол' },
  { key: 'kitchen_towels', name: 'Кухонные полотенца', short: 'Кух.пол' },
  { key: 'rugs', name: 'Коврики', short: 'Коврики' },
  { key: 'beach_mat', name: 'Пляж.коврики', short: 'Пляж.кор' },
  { key: 'mattress_pad', name: 'Наматрасники', short: 'Наматрас' }
];

// Предметы для отправки Альберту
const ALBERT_ITEMS = [
  { key: 'sheet_set', name: 'Комплект постели', short: 'Компл.пост' },
  { key: 'towel_set', name: 'Комплект полотенец', short: 'Компл.пол' },
  { key: 'sheet', name: 'Простынь', short: 'Простынь' },
  { key: 'duvet_cover', name: 'Пододеяльник', short: 'Пododеял' },
  { key: 'large_towel', name: 'Большое полотенце', short: 'Бол.пол' },
  { key: 'small_towel', name: 'Малое полотенце', short: 'Мал.пол' },
  { key: 'pillowcase', name: 'Наволочка', short: 'Наволоч' },
  { key: 'kitchen_towel', name: 'Кух.полотенце', short: 'Кух.пол' },
  { key: 'bath_mat', name: 'Коврик', short: 'Коврик' },
  { key: 'mattress_pad', name: 'Наматрасник', short: 'Наматрас' },
  { key: 'stain_small', name: 'Пятно малое', short: 'Пятно мал' },
  { key: 'stain_large', name: 'Пятно сложное', short: 'Пятно слож' }
];

const sessions = {};
let scheduleCache = [];
let lastBookingCheck = new Date().toISOString();

// ── ПЕРСИСТЕНТНЫЙ СПИСОК УВЕДОМЛЁННЫХ БРОНЕЙ ─────────────────────
const SEEN_BOOKINGS_FILE = './seen_bookings.json';
let seenBookingIds = new Set();
try {
  if (fs.existsSync(SEEN_BOOKINGS_FILE)) {
    var seenArr = JSON.parse(fs.readFileSync(SEEN_BOOKINGS_FILE, 'utf8'));
    seenBookingIds = new Set(seenArr);
    console.log('[seen] Загружено', seenBookingIds.size, 'виденных броней');
  }
} catch(e) { console.error('[seen] Ошибка загрузки:', e.message); }

function saveSeenBookings() {
  try { fs.writeFileSync(SEEN_BOOKINGS_FILE, JSON.stringify([...seenBookingIds]), 'utf8'); } catch(e) {}
}
// Очистка старых записей раз в сутки (оставляем только последние 500)
function pruneSeenBookings() {
  if (seenBookingIds.size > 500) {
    var arr = [...seenBookingIds];
    seenBookingIds = new Set(arr.slice(arr.length - 400));
    saveSeenBookings();
    console.log('[seen] Очистка: осталось', seenBookingIds.size);
  }
}

// ── ПЕРЕМЕЩЕНИЯ БЕЛЬЯ — 10-МИНУТНОЕ ОКНО РЕДАКТИРОВАНИЯ ───────────
var linenPendingNotify = {}; // chatId -> { timer, movementIds, msg, apt, booking }

async function scheduleLinenAdminNotify(chatId, aptName, firstName, itemsText, bookingLine, movementIds) {
  // Отменяем предыдущий таймер если есть
  if (linenPendingNotify[chatId] && linenPendingNotify[chatId].timer) {
    clearTimeout(linenPendingNotify[chatId].timer);
  }
  var data = { movementIds: movementIds, aptName: aptName, firstName: firstName, itemsText: itemsText, bookingLine: bookingLine };
  var timer = setTimeout(async function() {
    try {
      var d = linenPendingNotify[chatId];
      if (!d) return;
      delete linenPendingNotify[chatId];
      var adminMsg = '🧺 *Грязное бельё отмечено*\n' +
        '━━━━━━━━━━━━━━━━\n' +
        '🏠 *Апартамент:* ' + d.aptName + '\n' +
        '👤 *Уборщица:* ' + d.firstName + '\n' +
        d.bookingLine +
        '━━━━━━━━━━━━━━━━\n' +
        '📋 *Перемещено:*' + (d.itemsText || ' —') + '\n' +
        '━━━━━━━━━━━━━━━━\n' +
        '✅ _Записано в историю_';
      await notifyAdmins(adminMsg);
    } catch(e) { console.error('[linen notify]', e.message); }
  }, 10 * 60 * 1000); // 10 минут
  linenPendingNotify[chatId] = Object.assign(data, { timer: timer });
}

// ── ДАННЫЕ ГОСТЕВЫХ СООБЩЕНИЙ (хранятся в памяти) ───────────────
var guestMsgStore = {}; // key -> {apt, code, checkin, checkout}
function gmStore(apt, code, checkin, checkout) {
  var key = apt.slice(0,3) + code + (checkin||'').slice(5,10).replace('-','') + (checkout||'').slice(5,10).replace('-','');
  guestMsgStore[key] = { apt: apt, code: code, checkin: checkin, checkout: checkout };
  return key;
}

// ── ГОЛОСОВЫЕ НАСТРОЙКИ TTS ─────────────────────────────────────
const TTS_VOICES = ['alloy', 'nova', 'echo', 'shimmer', 'onyx', 'fable'];
const TTS_VOICE_NAMES = { alloy: 'Alloy (нейтральный)', nova: 'Nova (женский, мягкий)', echo: 'Echo (мужской)', shimmer: 'Shimmer (женский, тёплый)', onyx: 'Onyx (мужской, глубокий)', fable: 'Fable (выразительный)' };
const TTS_SETTINGS_FILE = './tts_settings.json';
var ttsSettings = { voice: 'nova', enabled: true };
try { if (fs.existsSync(TTS_SETTINGS_FILE)) ttsSettings = JSON.parse(fs.readFileSync(TTS_SETTINGS_FILE, 'utf8')); } catch(e) {}
function saveTtsSettings() { try { fs.writeFileSync(TTS_SETTINGS_FILE, JSON.stringify(ttsSettings), 'utf8'); } catch(e) {} }

async function textToSpeech(text) {
  try {
    if (!OPENAI_KEY || !ttsSettings.enabled) return null;
    // Очищаем текст от markdown символов
    var clean = text.replace(/[*_`#]/g, '').replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1').trim();
    // Ограничиваем длину для TTS
    if (clean.length > 1000) clean = clean.slice(0, 1000) + '...';
    var resp = await axios.post('https://api.openai.com/v1/audio/speech', {
      model: 'tts-1-hd',
      voice: ttsSettings.voice || 'nova',
      speed: 0.95,
      input: clean,
      response_format: 'mp3'
    }, {
      headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json' },
      responseType: 'arraybuffer',
      timeout: 30000
    });
    return Buffer.from(resp.data);
  } catch(e) { console.error('[TTS] Error:', e.message); return null; }
}

// ── ТИПЫ ЗАДАНИЙ ──────────────────────────────────────────────────
const DEFAULT_TASK_TYPES = [
  { key: 'guests', name: 'Гостей', type: 'number' },
  { key: 'beds', name: 'Кроватей', type: 'number' },
  { key: 'spa', name: 'Спа', type: 'boolean' },
  { key: 'crib', name: 'Детская кроватка', type: 'boolean' },
  { key: 'highchair', name: 'Детский стульчик', type: 'boolean' },
  { key: 'extra_linen', name: 'Доп. бельё', type: 'boolean' },
  { key: 'extra_towels', name: 'Доп. полотенца', type: 'boolean' },
];

function loadTaskTypes() {
  try { if (fs.existsSync(TASK_TYPES_FILE)) return JSON.parse(fs.readFileSync(TASK_TYPES_FILE, 'utf8')); } catch(e) {}
  return DEFAULT_TASK_TYPES.slice();
}
function saveTaskTypes(types) { try { fs.writeFileSync(TASK_TYPES_FILE, JSON.stringify(types, null, 2), 'utf8'); } catch(e) {} }
if (!fs.existsSync(TASK_TYPES_FILE)) saveTaskTypes(DEFAULT_TASK_TYPES);

// ── ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ───────────────────────────────────────
function isAdmin(id) { return id === IRINA_CHAT_ID || id === EMMA_CHAT_ID || id === OWNER_CHAT_ID; }
function isAlbert(id) { return id === ALBERT_CHAT_ID; }
function isLaundryGroup(id) { return String(id) === LAUNDRY_GROUP_ID; }
function isAdminOrAlbert(id) { return isAdmin(id) || isAlbert(id); }
function getAdmins() { return [IRINA_CHAT_ID, EMMA_CHAT_ID, OWNER_CHAT_ID].filter(function(id) { return id && id !== 'undefined'; }); }
function isGroup(msg) { return msg.chat.type === 'group' || msg.chat.type === 'supergroup'; }

async function api(action, data) {
  try {
    const res = await axios.post(
      SUPABASE_URL + '/functions/v1/bot-api',
      Object.assign({ action: action }, data || {}),
      { headers: { 'x-bot-secret': BOT_SECRET, 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    return res.data;
  } catch(e) {
    var detail = e.message;
    if (e.response && e.response.data) {
      detail += ' | ' + JSON.stringify(e.response.data);
    }
    throw new Error(detail);
  }
}

// ── ЗАГРУЗКА ФОТО В SUPABASE STORAGE ЧЕРЕЗ BOT-API ──────────────
async function uploadReceiptToStorage(imageBuffer, fileName) {
  try {
    var base64 = imageBuffer.toString('base64');
    var r = await api('upload_receipt', { image_base64: base64, file_name: fileName });
    if (r && r.url) return r.url;
    return null;
  } catch(e) {
    console.error('[storage] Upload error:', e.message);
    return null;
  }
}

async function logMsg(msg, direction, msgType) {
  try { await api('log_message', { chat_id: String(msg.chat.id), user_name: msg.from ? (msg.from.username || '') : '', user_first_name: msg.from ? (msg.from.first_name || '') : '', message_text: msg.text || msg.caption || '', message_type: msgType || 'text', direction: direction || 'incoming' }); } catch(e) {}
}

async function notifyAdmins(text, opts) {
  for (var i = 0; i < getAdmins().length; i++) { try { await bot.sendMessage(getAdmins()[i], text, Object.assign({ parse_mode: 'Markdown' }, opts || {})); } catch(e) {} }
}
async function notifyIrina(text, opts) { if (IRINA_CHAT_ID) { try { await bot.sendMessage(IRINA_CHAT_ID, text, Object.assign({ parse_mode: 'Markdown' }, opts || {})); } catch(e) {} } }

function fmtDate(d) { if (!d) return '?'; return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function fmtDateShort(d) { if (!d) return '?'; return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }); }
function fmtTime(d) { if (!d) return '?'; return new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }
function fmtSource(s) { if (!s) return ''; var src = String(s).toLowerCase(); if (src.includes('holidu')) return '[H]'; if (src.includes('airbnb')) return '[A]'; return ''; }
function truncateName(name, maxLen) { if (!name) return 'своб'; return name.length > maxLen ? name.slice(0, maxLen - 1) + '…' : name; }

// ── ПОИСК СЛОТА ПО АПАРТУ И ДАТЕ (заезд ИЛИ выезд) ─────────────
function findSlot(cache, apartment, date) {
  if (!date || !apartment) return null;
  var d = date.slice(0,10);
  // Сначала по дате выезда (основная)
  var slot = cache.find(function(s){ return s.apartment === apartment && s.checkout_date && s.checkout_date.slice(0,10) === d; });
  if (slot) return slot;
  // Потом по дате заезда (если админ назвал дату заезда)
  slot = cache.find(function(s){ return s.apartment === apartment && s.checkin_date && s.checkin_date.slice(0,10) === d; });
  if (slot) return slot;
  // Потом ищем активную бронь (дата попадает внутрь периода)
  slot = cache.find(function(s){ return s.apartment === apartment && s.checkin_date && s.checkout_date && s.checkin_date.slice(0,10) <= d && s.checkout_date.slice(0,10) >= d; });
  return slot || null;
}

// ── РАСЧЁТ ГОСТЕЙ ДЛЯ УБОРЩИЦЫ ──────────────────────────────────
// Правило: если следующий заезд в этот апарт ≤ 3 дней — стелить на
// кол-во гостей из следующей брони. Иначе — 4 по умолчанию.
function getGuestsForCleaner(slot, allSlots) {
  var checkout = slot.checkout_date ? slot.checkout_date.slice(0,10) : null;
  if (!checkout) return slot.next_guests || slot.guests_count || 4;
  var apt = slot.apartment;
  // Найти следующую бронь этого апарта у которой checkin_date > checkout
  var next = null;
  var minGap = Infinity;
  (allSlots || []).forEach(function(s) {
    if (s.apartment !== apt) return;
    if (!s.checkin_date) return;
    var ci = s.checkin_date.slice(0,10);
    if (ci <= checkout) return; // не следующий
    var gapDays = Math.round((new Date(ci) - new Date(checkout)) / (1000*60*60*24));
    if (gapDays < minGap) { minGap = gapDays; next = s; }
  });
  if (next && minGap <= 3) {
    return next.guests_count || next.next_guests || 4;
  }
  return 4; // по умолчанию
}

function fmtInstructions(text) {
  if (!text) return '';
  var lines;
  try { var arr = JSON.parse(text); if (Array.isArray(arr)) { lines = arr.map(function(t) { return t.type === 'number' ? t.name + ': ' + (t.value || 1) : t.name; }); } else lines = [text]; }
  catch(e) { lines = text.split('\n').map(function(l) { return l.trim(); }).filter(Boolean); }
  return lines.map(function(l, i) { return (i + 1) + '. ' + l; }).join('\n');
}

function tasksToText(tasks) {
  return tasks.filter(function(t) { return t.enabled; }).map(function(t) {
    return t.type === 'number' ? t.name + ': ' + (t.value || 1) : t.name;
  }).join('\n');
}

function tasksToJson(tasks) {
  // Сохраняем все включённые задания с полем enabled:true для Lovable
  return JSON.stringify(tasks.filter(function(t) { return t.enabled; }).map(function(t) {
    return { key: t.key, name: t.name, type: t.type, enabled: true, value: t.value };
  }));
}
// Полный массив всех заданий (для assign_booking_tasks)
function tasksToFullJson(tasks) {
  return JSON.stringify(tasks.map(function(t) {
    return { key: t.key, name: t.name, type: t.type, enabled: !!t.enabled, value: t.value };
  }));
}

function initTasksFromSlot(slot) {
  var taskTypes = loadTaskTypes();
  var tasks = taskTypes.map(function(tt) { return { key: tt.key, name: tt.name, type: tt.type, enabled: false, value: tt.type === 'number' ? 1 : undefined }; });
  if (!slot || !slot.special_instructions) return tasks;
  try {
    var saved = JSON.parse(slot.special_instructions);
    if (Array.isArray(saved)) {
      saved.forEach(function(s) {
        var found = tasks.find(function(t) { return t.key === s.key; });
        if (found) { found.enabled = true; if (s.value !== undefined) found.value = s.value; }
        else tasks.push({ key: s.key, name: s.name, type: s.type || 'boolean', enabled: true, value: s.value });
      });
    }
  } catch(e) {}
  return tasks;
}

// ── МЕНЮ ─────────────────────────────────────────────────────────
const mainMenuCleaner = { reply_markup: { keyboard: [['📅 Расписание и запись'], ['📋 Мои смены', '🧺 Грязное бельё'], ['🧹 Начать уборку', '✅ Уборка окончена'], ['❓ Помощь']], resize_keyboard: true } };

const mainMenuAdmin = { reply_markup: { keyboard: [
  ['📅 Расписание', '🔍 Найти', '📊 Отчёты'],
  ['💰 Финансы'],
  ['🔄 Визит Альберта', '🚚 Альберт забрал', '✨ Альберт привёз'],
  ['📦 Остатки', '📊 История', '💰 Взаиморасчёты'],
  ['❓ Помощь']
], resize_keyboard: true } };

const mainMenuAlbert = { reply_markup: { keyboard: [
  ['🔄 Визит Альберта'],
  ['📊 История', '💰 Взаиморасчёты'],
  ['📦 Остатки', '❓ Помощь']
], resize_keyboard: true } };

const groupMenu = { reply_markup: { keyboard: [['📅 Расписание и запись', '❓ Помощь']], resize_keyboard: true } };

const laundryGroupMenu = { reply_markup: { keyboard: [
  ['🔄 Визит Альберта'],
  ['🚚 Альберт забрал', '✨ Альберт привёз'],
  ['📊 История', '💰 Взаиморасчёты', '📦 Остатки']
], resize_keyboard: true } };

function getMenu(chatIdStr) {
  if (isAlbert(chatIdStr)) return mainMenuAlbert;
  if (isAdmin(chatIdStr)) return mainMenuAdmin;
  return mainMenuCleaner;
}

// ── ФОРМА ЗАДАНИЯ ─────────────────────────────────────────────────
function buildTaskForm(session) {
  var tasks = session.tasks; var label = session.slotLabel || '';
  var text = '📋 Задание для уборщицы\n' + label + '\n\nВыбери что нужно подготовить:';
  var buttons = [];
  tasks.forEach(function(task, i) {
    if (task.type === 'number') {
      if (task.enabled) {
        buttons.push([{ text: '✅ ' + task.name + ':', callback_data: 'tg_' + i }, { text: '🔴 −', callback_data: 'td_' + i }, { text: String(task.value || 1), callback_data: 'noop' }, { text: '🟢 +', callback_data: 'ti_' + i }]);
      } else {
        buttons.push([{ text: '◻️ ' + task.name, callback_data: 'tg_' + i }]);
      }
    } else {
      buttons.push([{ text: (task.enabled ? '✅ ' : '◻️ ') + task.name, callback_data: 'tg_' + i }]);
    }
  });
  buttons.push([{ text: '⚙️ Настройки', callback_data: 'tset' }, { text: '❌ Отмена', callback_data: 'tcancel' }, { text: '✅ Сохранить', callback_data: 'tsave' }]);
  return { text: text, buttons: buttons };
}

function buildSettingsForm(taskTypes) {
  var text = '⚙️ Настройки заданий\n\nСписок (нажми 🗑 чтобы удалить):';
  var buttons = taskTypes.map(function(tt, i) {
    return [{ text: tt.name + (tt.type === 'number' ? ' (число)' : ''), callback_data: 'noop' }, { text: '🗑', callback_data: 'sdel_' + i }];
  });
  buttons.push([{ text: '➕ Добавить задание', callback_data: 'sadd' }]);
  buttons.push([{ text: '◀️ Назад', callback_data: 'sback' }]);
  return { text: text, buttons: buttons };
}

// ── ФОРМА БЕЛЬЁ АЛЬБЕРТУ ─────────────────────────────────────────
function buildAlbertLinenForm(items, title) {
  var text = title + '\nУкажи количество:';
  var buttons = ALBERT_ITEMS.slice(0, 10).map(function(item) {
    var qty = items[item.key] || 0;
    return [
      { text: '🔴 −', callback_data: 'alm_' + item.key },
      { text: item.short + ':' + qty, callback_data: 'noop' },
      { text: '🟢 +', callback_data: 'alp_' + item.key }
    ];
  });
  buttons.push([{ text: '✅ Подтвердить', callback_data: 'albert_confirm' }, { text: '❌ Отмена', callback_data: 'albert_cancel' }]);
  return { text: text, buttons: buttons };
}

function formatAlbertItems(items) {
  var lines = [];
  ALBERT_ITEMS.forEach(function(item) {
    if (items[item.key] && items[item.key] > 0) lines.push('• ' + item.name + ': ' + items[item.key]);
  });
  return lines.join('\n');
}

// ── AI ПАРСИНГ СООБЩЕНИЯ АЛЬБЕРТА ────────────────────────────────
async function parseAlbertMessage(text) {
  try {
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: 'Альберт работает в прачечной. Он написал сообщение о том что постирал и привёз бельё.\n\nВозможные предметы:\nsheet_set = комплект постели (простынь+пододеяльник+2 наволочки)\ntowel_set = комплект полотенец (2 больших+2 малых)\nsheet = простынь\nduvet_cover = пододеяльник\nlarge_towel = большое полотенце\nsmall_towel = малое полотенце\npillowcase = наволочка\nkitchen_towel = кухонное полотенце\nbath_mat = коврик\nmattress_pad = наматрасник\nstain_small = пятно малое\nstain_large = пятно сложное\n\nСообщение Альберта:\n"' + text + '"\n\nВерни ТОЛЬКО JSON:\n{"type":"delivery","items":{"sheet_set":5,"towel_set":7},"notes":""}\nили {"type":"pickup","notes":""}\nили {"type":"other","notes":"текст"}' }]
    }, { headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } });
    return JSON.parse(response.data.content[0].text.replace(/```json|```/g, '').trim());
  } catch(e) { return { type: 'other', notes: text }; }
}

// ── AI ПОМОЩНИК ───────────────────────────────────────────────────
async function aiHelper(question, userRole) {
  try {
    var context = userRole === 'albert'
      ? 'Ты помощник для Альберта — владельца прачечной Piña Colada. Он работает с ERA Apartments через Telegram бота. Отвечай коротко и по делу.'
      : 'Ты помощник-консьерж для команды ERA Apartments (Ирочка, Эммочка, Георгий). Отвечаешь на вопросы о том как пользоваться ботом и приложением. Всегда объясняй КОНКРЕТНО — голосом или кнопкой, и что именно сказать/нажать.';

    var botInfo = userRole === 'albert'
      ? '\n\nВозможности для Альберта:\n' +
        '🚚 Забрал бельё — фиксируй когда забираешь грязное (выбери откуда: Пераль, Сальвадор, оба)\n' +
        '✨ Привёз чистое — фиксируй возврат (форма предзаполнена из остатков)\n' +
        '📦 Остатки — сколько вещей у тебя сейчас по нашим данным\n' +
        '📊 История — все движения за 2 месяца\n' +
        '💰 Взаиморасчёты — наш расчёт vs твои счета, загрузи presupuesto\n' +
        '❓ Вопрос — просто напиши любой вопрос текстом'
      : '\n\n━━━ ГОЛОСОВЫЕ КОМАНДЫ 🎤 ━━━\n' +
        'Держи кнопку микрофона в Telegram и говори. Бот поймёт и выполнит.\n\n' +

        '📅 РАСПИСАНИЕ:\n' +
        '• "Что сегодня?" / "Что завтра?" / "Расписание на неделю"\n' +
        '• "Покажи брони за июль" / "Брони с 15 апреля по 1 мая"\n' +
        '• "Расписание Сальвадора" / "Свободные смены без уборщицы"\n' +
        '• "Следующий заезд в Гранде"\n\n' +

        '🧹 УПРАВЛЕНИЕ УБОРКАМИ:\n' +
        '• "Замени уборщицу 13 июля Сальвадор на Олю"\n' +
        '• "Добавь спа и кроватку на Гранде 5 июля"\n' +
        '• "Убери детский стульчик с Оазис 1 12 апреля"\n' +
        '• "Гранде 5 июля гостей 12"\n' +
        '• "Следующая смена Марьяны" / "Сколько смен у Оли за прошлый месяц"\n' +
        '• "Кому мы должны за уборки" / "Кто сейчас убирает"\n\n' +

        '💰 ФИНАНСЫ:\n' +
        '• "Расход 150 евро клининг моющие средства"\n' +
        '• "Доход 450 евро аренда Airbnb Гранде"\n' +
        '• "Расходы за прошлый месяц" / "Расходы на клининг за апрель"\n' +
        '• "Касса Эммочки за этот месяц" / "Общая касса за июнь"\n' +
        '• "Финансовая сводка за прошлый месяц"\n' +
        '• "Итоги марта" / "Доходы vs расходы за этот месяц"\n\n' +

        '🧺 БЕЛЬЁ И АЛЬБЕРТ:\n' +
        '• "Остатки у Альберта" / "Что у нас на стирке"\n' +
        '• "Взаиморасчёты с Альбертом" / "Сколько мы должны Альберту"\n' +
        '• "Стирка за прошлый месяц" / "История визитов Альберта"\n' +
        '• "Остатки белья по всем локациям"\n' +
        '• "Движение белья за прошлый месяц"\n\n' +

        '🔐 ЗАМКИ (TTLock):\n' +
        '• "Создай код для Сальвадора с 15 по 20 августа"\n' +
        '• "Создай код 4821 для Гранде с 1 по 5 июля"\n' +
        '• "Какой код у Оазиса 1"\n' +
        '• "Удали код Сальвадора"\n\n' +

        '📋 ЗАДАЧИ:\n' +
        '• "Создай задачу купить моющие срок 15 апреля"\n' +
        '• "Список открытых задач" / "Сколько задач осталось"\n\n' +

        '📊 АНАЛИТИКА (умный поиск):\n' +
        '• "Как у нас дела в целом?"\n' +
        '• "Есть ли что-то срочное на этой неделе?"\n' +
        '• "Какой апартамент загружен больше всего?"\n' +
        '• Любой свободный вопрос — бот сам найдёт ответ\n\n' +

        '━━━ КНОПКИ МЕНЮ ━━━\n' +
        '📅 Расписание — выезды на 30 дней + кнопки Заменить/Задание/Удалить\n' +
        '🏊 Спа — все брони где заказано спа или кроватка\n' +
        '📋 Задания — брони с назначенными заданиями\n' +
        '📅 Период — брони за любой период (календарь или текстом)\n' +
        '🔄 Визит Альберта — полный цикл: привёз + забрал\n' +
        '💰 Взаиморасчёты — баланс с Альбертом, загрузить счёт\n\n' +

        '━━━ КАК ЗАНЕСТИ ИСТОРИЧЕСКИЕ ДАННЫЕ ━━━\n' +
        'Голосом: "Оазис 1 бронь с 6 по 10 апреля доход 320 евро Airbnb"\n' +
        'Или через приложение ERA: Финансы → Касса → + Приход\n\n' +

        'При любом вопросе отвечай: что именно сказать голосом ИЛИ какую кнопку нажать.';

    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: context + botInfo + '\n\nВопрос: ' + question + '\n\nОтветь коротко, конкретно, на русском. Используй эмодзи.' }]
    }, { headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } });
    return response.data.content[0].text;
  } catch(e) { return 'Не могу ответить прямо сейчас. Попробуй позже.'; }
}

// ── УВЕДОМЛЕНИЕ О НОВОЙ БРОНИ ─────────────────────────────────────
async function notifyNewBooking(booking) {
  var apt = APT_NAMES[booking.apartment] || booking.apartment;
  var src = fmtSource(booking.source);
  var gapText = (booking.gap_days !== null && booking.gap_days !== undefined && booking.gap_days >= 0 && booking.gap_days <= 60)
    ? '\n⏱ Gap до заезда: *' + booking.gap_days + ' дней*'
    : '';
  var text = '🆕 Новая бронь ' + (src ? src : '') + '\n\n🏠 *' + apt + '*\n📅 Заезд: ' + fmtDateShort(booking.checkin_date) + ' · Выезд: ' + fmtDateShort(booking.checkout_date) + '\n👥 ' + (booking.guests_count || '?') + ' гостей' + gapText;
  var admins = getAdmins();
  for (var i = 0; i < admins.length; i++) {
    try {
      await bot.sendMessage(admins[i], text, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [
          [{ text: '📋 Назначить задание', callback_data: 'nb_assign_' + booking.id }],
          [{ text: '💰 Указать стоимость', callback_data: 'inc_add_' + booking.id }]
        ]}
      });
    } catch(e) {}
  }
  // Автосоздание кода замка если TTLock настроен и есть обе даты
  if (TTLOCK_ENABLED && booking.checkin_date && booking.checkout_date) {
    try {
      await autoCreateLockCode(booking);
    } catch(e) { console.error('[TTLock auto]', e.message); }
  }
}

// ── TTLOCK: АВТОСОЗДАНИЕ КОДА ДЛЯ НОВОЙ БРОНИ ────────────────────────────────
async function autoCreateLockCode(booking) {
  var hasSpa = false;
  if (booking.tasks) {
    try {
      var tasks = typeof booking.tasks === 'string' ? JSON.parse(booking.tasks) : booking.tasks;
      hasSpa = Array.isArray(tasks) && tasks.some(function(t){ return t.key === 'spa' && t.enabled; });
    } catch(e) {}
  }
  var result = await ttlock.createGuestCode(booking.apartment, booking.checkin_date, booking.checkout_date, hasSpa, null);
  await notifyLockCode(result, booking);
  return result;
}

// ── TTLOCK: УВЕДОМЛЕНИЕ О КОДЕ ────────────────────────────────────────────────
async function notifyLockCode(result, booking) {
  var apt = APT_NAMES[result.apartment] || result.apartment;
  var text = '🔐 *Код для гостей*\n\n';
  text += '🏠 *' + apt + '*\n';
  text += '📅 Заезд: ' + fmtDateShort(result.checkin) + ' · Выезд: ' + fmtDateShort(result.checkout) + '\n\n';
  text += '🔑 *Код: ' + result.codeDisplay + '*\n\n';
  text += '⏰ Действует:\n';
  text += '  С: ' + result.validFrom + '\n';
  text += '  По: ' + result.validTo + '\n\n';

  var successes = result.results.filter(function(r){ return r.success; });
  var failures  = result.results.filter(function(r){ return !r.success; });

  if (successes.length > 0) {
    text += '✅ Замки настроены:\n';
    successes.forEach(function(r){ text += '  • ' + r.name + (r.isSpa?' 🏊':'') + '\n'; });
  }
  if (failures.length > 0) {
    text += '❌ Ошибки:\n';
    failures.forEach(function(r){ text += '  • ' + r.name + ': ' + r.error + '\n'; });
  }

  var aptKey = result.apartment;
  var checkin = booking ? booking.checkin_date : result.checkin;
  var checkout = booking ? booking.checkout_date : result.checkout;
  var lockBase = aptKey + '_' + (checkin||'') + '_' + (checkout||'');

  var inlineButtons = [
    [
      { text: '🔄 Новый код', callback_data: 'lock_new_' + lockBase },
      { text: '✏️ Свой код', callback_data: 'lock_custom_' + lockBase },
      { text: '🗑 Удалить', callback_data: 'lock_del_' + aptKey }
    ],
    [
      { text: '⏰ Продлить код', callback_data: 'lock_extend_' + aptKey + '_' + result.codeDisplay }
    ],
    [
      { text: '📋 Инструкция гостям', callback_data: 'gm_show_' + aptKey + '|' + result.codeDisplay + '|' + (checkin||'') + '|' + (checkout||'') }
    ]
  ];

  if (IRINA_CHAT_ID) {
    try { await bot.sendMessage(IRINA_CHAT_ID, text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: inlineButtons } }); } catch(e) {}
  }
  if (OWNER_CHAT_ID) {
    try { await bot.sendMessage(OWNER_CHAT_ID, text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: inlineButtons } }); } catch(e) {}
  }
}


// ── ШАБЛОНЫ СООБЩЕНИЙ ДЛЯ ГОСТЕЙ ────────────────────────────────
// ── НАСТРОЙКИ АПАРТАМЕНТОВ (сохраняются в файле) ──────────────────
const APT_SETTINGS_FILE = './apt_settings.json';
var aptSettings = {
  piral_1:  { wifi_name: 'ERA_Oasis1',   wifi_pass: 'era12345', address: 'Carrer del Pintor Pinazo 1, Valencia', extra: '' },
  piral_2:  { wifi_name: 'ERA_Oasis2',   wifi_pass: 'era12345', address: 'Carrer del Pintor Pinazo 1, Valencia', extra: '' },
  grande:   { wifi_name: 'ERA_Grande',   wifi_pass: 'era12345', address: 'Carrer del Pintor Pinazo 1, Valencia', extra: '' },
  salvador: { wifi_name: 'ERA_Salvador', wifi_pass: 'era12345', address: 'Avinguda del Salvador 12, Valencia',   extra: '' },
};
// Код Альберта — один для всех замков
var albertCode = '8282';
try { var _as = JSON.parse(require('fs').readFileSync('./apt_settings.json','utf8')); if (_as.albert_code) albertCode = _as.albert_code; } catch(e) {}
try { if (fs.existsSync(APT_SETTINGS_FILE)) { var loaded = JSON.parse(fs.readFileSync(APT_SETTINGS_FILE,'utf8')); Object.assign(aptSettings, loaded); } } catch(e) {}
function saveAptSettings() { try { fs.writeFileSync(APT_SETTINGS_FILE, JSON.stringify(aptSettings, null, 2), 'utf8'); } catch(e) {} }

function buildGuestMessage(apt, code, validFrom, validTo, lang) {
  var aptName = APT_NAMES[apt] || apt;
  var s = aptSettings[apt] || {};
  var wifi = { name: s.wifi_name || 'ERA_WiFi', pass: s.wifi_pass || 'era12345' };
  var addr = s.address || 'Valencia';
  var extra = s.extra || '';
  var checkin = validFrom ? validFrom.replace('T', ' ').slice(0, 16) : '';
  var checkout = validTo ? validTo.replace('T', ' ').slice(0, 16) : '';

  var msgs = {
    en: '🏠 *Welcome to ' + aptName + '!*\n\n' +
        '📍 Address: ' + addr + '\n\n' +
        '🔑 *Door code: ' + code + '#*\n' +
        '_(The # key is the UNLOCKING key on the keypad)_\n' +
        '⏰ Valid from: ' + checkin + '\n' +
        '⏰ Valid until: ' + checkout + '\n\n' +
        '📶 *WiFi:*\n' +
        '  Network: ' + wifi.name + '\n' +
        '  Password: ' + wifi.pass + '\n\n' +
        '🏊 Spa & pool: included in your booking\n' +
        '🧺 Towels & linen: provided\n' +
        '☕ Kitchen fully equipped\n\n' +
        '📞 Any questions? Just message us here!\n' +
        'Enjoy your stay! 🌟',

    es: '🏠 *¡Bienvenido/a a ' + aptName + '!*\n\n' +
        '📍 Dirección: ' + addr + '\n\n' +
        '🔑 *Código de entrada: ' + code + '#*\n' +
        '_(La tecla # es la tecla de APERTURA del teclado)_\n' +
        '⏰ Válido desde: ' + checkin + '\n' +
        '⏰ Válido hasta: ' + checkout + '\n\n' +
        '📶 *WiFi:*\n' +
        '  Red: ' + wifi.name + '\n' +
        '  Contraseña: ' + wifi.pass + '\n\n' +
        '🏊 Spa y piscina: incluidos en su reserva\n' +
        '🧺 Toallas y ropa de cama: proporcionadas\n' +
        '☕ Cocina totalmente equipada\n\n' +
        '📞 ¿Alguna pregunta? ¡Escríbanos aquí!\n' +
        '¡Disfrute su estancia! 🌟',

    de: '🏠 *Willkommen in ' + aptName + '!*\n\n' +
        '📍 Adresse: ' + addr + '\n\n' +
        '🔑 *Türcode: ' + code + '#*\n' +
        '_(Die #-Taste ist die ÖFFNUNGS-Taste auf dem Tastenfeld)_\n' +
        '⏰ Gültig ab: ' + checkin + '\n' +
        '⏰ Gültig bis: ' + checkout + '\n\n' +
        '📶 *WLAN:*\n' +
        '  Netzwerk: ' + wifi.name + '\n' +
        '  Passwort: ' + wifi.pass + '\n\n' +
        '🏊 Spa & Pool: im Preis inbegriffen\n' +
        '🧺 Handtücher & Bettwäsche: vorhanden\n' +
        '☕ Voll ausgestattete Küche\n\n' +
        '📞 Fragen? Schreiben Sie uns hier!\n' +
        'Genießen Sie Ihren Aufenthalt! 🌟',

    fr: '🏠 *Bienvenue à ' + aptName + '!*\n\n' +
        '📍 Adresse: ' + addr + '\n\n' +
        '🔑 *Code entrée: ' + code + '#*\n' +
        '_(La touche # est la touche de DÉVERROUILLAGE du clavier)_\n' +
        '⏰ Valide à partir de: ' + checkin + '\n' +
        '⏰ Valide jusqu au: ' + checkout + '\n\n' +
        '📶 *WiFi:*\n' +
        '  Réseau: ' + wifi.name + '\n' +
        '  Mot de passe: ' + wifi.pass + '\n\n' +
        '🏊 Spa et piscine: inclus dans votre reservation\n' +
        '🧺 Serviettes & linge: fournis\n' +
        '☕ Cuisine entièrement équipée\n\n' +
        '📞 Des questions? Écrivez-nous ici!\n' +
        'Profitez de votre séjour! 🌟',

    ru: '🏠 *Добро пожаловать в ' + aptName + '!*\n\n' +
        '📍 Адрес: ' + addr + '\n\n' +
        '🔑 *Код входа: ' + code + '#*\n' +
        '_(Символ # — это кнопка ОТКРЫТИЯ на панели)_\n' +
        '⏰ Действует с: ' + checkin + '\n' +
        '⏰ Действует до: ' + checkout + '\n\n' +
        '📶 *WiFi:*\n' +
        '  Сеть: ' + wifi.name + '\n' +
        '  Пароль: ' + wifi.pass + '\n\n' +
        '🏊 Спа и бассейн: включены в бронирование\n' +
        '🧺 Полотенца и постельное бельё: предоставляются\n' +
        '☕ Полностью оборудованная кухня\n\n' +
        '📞 Вопросы? Напишите нам здесь!\n' +
        'Приятного отдыха! 🌟',

    ua: '🏠 *Ласкаво просимо до ' + aptName + '!*\n\n' +
        '📍 Адреса: ' + addr + '\n\n' +
        '🔑 *Код входу: ' + code + '#*\n' +
        '_(Символ # — це кнопка ВІДКРИТТЯ на панелі)_\n' +
        '⏰ Діє з: ' + checkin + '\n' +
        '⏰ Діє до: ' + checkout + '\n\n' +
        '📶 *WiFi:*\n' +
        '  Мережа: ' + wifi.name + '\n' +
        '  Пароль: ' + wifi.pass + '\n\n' +
        '🏊 Спа та басейн: включені в бронювання\n' +
        '🧺 Рушники та постільна білизна: надаються\n' +
        '☕ Повністю обладнана кухня\n\n' +
        '📞 Питання? Напишіть нам тут!\n' +
        'Приємного відпочинку! 🌟',
  };
  return msgs[lang] || msgs.en;
}

// ── УВЕДОМЛЕНИЕ ЭММОЧКЕ НАКАНУНЕ ЗАЕЗДА (gap 3+) ──────────────────
async function notifyEmmaPreparation(booking) {
  if (!booking.tasks || !booking.tasks_assigned) return;
  var apt = APT_NAMES[booking.apartment] || booking.apartment;
  var tasks;
  try { tasks = typeof booking.tasks === 'string' ? JSON.parse(booking.tasks) : booking.tasks; } catch(e) { return; }
  var enabledTasks = Array.isArray(tasks) ? tasks.filter(function(t) { return t.enabled; }) : [];
  if (enabledTasks.length === 0) return;

  // Вычислить что нужно скорректировать от стандарта (4 гостя, спа закрыта)
  var corrections = [];
  var removedItems = {};
  enabledTasks.forEach(function(t) {
    if (t.key === 'guests' && t.value !== 4) {
      var diff = 4 - (t.value || 4);
      corrections.push('👥 Гостей: ' + t.value + ' (сейчас 4)');
      if (diff > 0) {
        corrections.push('→ Убрать: ' + diff + ' компл. постели, ' + diff + ' бол. + ' + diff + ' мал. полотенца');
        removedItems.sheet_set = diff; removedItems.large_towel = diff; removedItems.small_towel = diff;
      }
    } else if (t.key === 'spa') { corrections.push('🏊 Спа: открыть'); }
    else if (t.key === 'crib') { corrections.push('🛏 Детская кроватка: поставить'); }
    else if (t.key === 'highchair') { corrections.push('🪑 Детский стульчик: поставить'); }
    else if (t.key === 'beds') { corrections.push('🛏 Кроватей: ' + t.value); }
  });

  if (corrections.length === 0) return;

  var text = '🏠 *' + apt + '* · Завтра заезд\n📅 ' + fmtDateShort(booking.checkin_date) + ' — ' + fmtDateShort(booking.checkout_date) + ' · ' + (booking.guests_count || '?') + ' гостей\n\n';
  text += 'Апарт сейчас стандартно (4 гостя, спа закрыта).\nЭммочка, нужно скорректировать:\n\n';
  text += corrections.join('\n');

  var confirmButtons = [[{ text: '✅ Всё готово', callback_data: 'emma_done_' + booking.id }]];
  if (EMMA_CHAT_ID) {
    try {
      await bot.sendMessage(EMMA_CHAT_ID, text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: confirmButtons } });
    } catch(e) {}
  }
  // Инфо остальным
  var infoText = 'ℹ️ *' + apt + '* · Завтра заезд ' + fmtDateShort(booking.checkin_date) + '\nЭммочка подготавливает апарт для ' + (booking.guests_count || '?') + ' гостей';
  if (IRINA_CHAT_ID) { try { await bot.sendMessage(IRINA_CHAT_ID, infoText, { parse_mode: 'Markdown' }); } catch(e) {} }
  if (OWNER_CHAT_ID) { try { await bot.sendMessage(OWNER_CHAT_ID, infoText, { parse_mode: 'Markdown' }); } catch(e) {} }
}

// ── ФОРМА БЕЛЬЁ (уборщицы) ────────────────────────────────────────
function showLinenForm(apt, linenData) {
  if (!linenData) linenData = {};
  var buttons = LINEN_ITEMS.map(function(item) {
    var qty = linenData[item.key] || 0;
    return [{ text: '🔴 −', callback_data: 'lm_' + apt + '_' + item.key }, { text: item.short + ':' + qty, callback_data: 'noop' }, { text: '🟢 +', callback_data: 'lp_' + apt + '_' + item.key }];
  });
  buttons.push([{ text: '✅ Отправить', callback_data: 'linen_submit_' + apt }, { text: '❌ Отмена', callback_data: 'linen_cancel' }]);
  return { text: 'Бельё — ' + (APT_NAMES[apt] || apt) + '\nУкажи количество:', buttons: buttons };
}

// ── КОМАНДЫ ───────────────────────────────────────────────────────
bot.onText(/\/start(?:\s+(.+))?/, async function(msg, match) {
  var chatId = msg.chat.id; var chatIdStr = String(chatId);
  var param = match && match[1] ? match[1].trim() : '';
  logMsg(msg, 'incoming', 'text');
  if (isLaundryGroup(chatIdStr)) {
    bot.sendMessage(chatId, '👋 ERA Laundry Bot\nИспользуйте кнопки ниже:', laundryGroupMenu);
    return;
  }
  if (isAlbert(chatIdStr)) {
    bot.sendMessage(chatId, '👋 Привет, Альберт!\n\nЯ помогу отслеживать движение белья.\n\nЕсли что-то непонятно — просто напиши вопрос!', mainMenuAlbert);
    return;
  }
  if (isGroup(msg)) { bot.sendMessage(chatId, 'Привет! Для полного меню напиши мне в личку @ERAGROUPlinen_bot', groupMenu); return; }
  
  // Deep link handling — открываем нужный раздел
  if (param === 'schedule') {
    // Имитируем нажатие кнопки расписание
    msg.text = '📅 Расписание и запись';
    return bot.emit('message', msg);
  }
  if (param === 'myshifts') {
    msg.text = '📋 Мои смены';
    return bot.emit('message', msg);
  }
  if (param.startsWith('su_')) {
    // Запись на смену
    var fakeQuery = { id: 'dl_' + Date.now(), from: msg.from, message: { chat: msg.chat, message_id: 0 }, data: param, chat_instance: '0' };
    return bot.emit('callback_query', fakeQuery);
  }
  
  bot.sendMessage(chatId, 'Привет! Я бот ERA Apartments.\nВыбери действие:', getMenu(chatIdStr));
});

bot.onText(/\/myid/, function(msg) {
  logMsg(msg, 'incoming', 'text');
  bot.sendMessage(msg.chat.id, 'Твой chat ID: ' + msg.chat.id + '\nИмя: ' + msg.from.first_name);
});

bot.onText(/\/голос|\/voice_settings|\/settings/, async function(msg) {
  var chatId = msg.chat.id; var chatIdStr = String(chatId);
  if (!isAdmin(chatIdStr)) return;
  var buttons = TTS_VOICES.map(function(v) {
    var isCurrent = v === ttsSettings.voice;
    return [{ text: (isCurrent ? '✅ ' : '') + TTS_VOICE_NAMES[v], callback_data: 'tts_voice_' + v }];
  });
  buttons.push([
    { text: ttsSettings.enabled ? '🔊 Голос: ВКЛ' : '🔇 Голос: ВЫКЛ', callback_data: 'tts_toggle' }
  ]);
  bot.sendMessage(chatId, '🎙 *Настройки голоса:*\n\nТекущий: *' + TTS_VOICE_NAMES[ttsSettings.voice] + '*',
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
});

bot.onText(/\/version|\/ver/, function(msg) {
  var chatId = msg.chat.id; var chatIdStr = String(chatId);
  if (!isAdmin(chatIdStr)) return;
  bot.sendMessage(chatId,
    '🤖 *ERA Bot v90*\n\n' +
    '📋 *Последние изменения:*\n' +
    '• v66 — продление кода Альберта голосом, фикс /version\n' +
    '• v65 — нормализация апартаментов (piral→piral_1 и т.д.)\n' +
    '• v64 — голосовое продление кодов замков\n' +
    '• v63 — гибкое продление: минуты/часы/дни/дата\n' +
    '• v62 — продление кода кнопками\n' +
    '• v61 — настройки замков и WiFi в ⚙️ Настройки\n' +
    '• v60 — инструкция гостям на 6 языках\n' +
    '• v59 — кнопка 🔑 Код в расписании\n' +
    '• v58 — TTS HD качество, mp3\n' +
    '• v57 — фикс TTS формата opus\n' +
    '• v56 — голосовые ответы на запросы\n' +
    '• v54 — шапка при замене уборщицы\n' +
    '• v52 — настройки голоса в Помощь→Настройки\n' +
    '• v50 — чек: сравнение сумм голос vs чек\n' +
    '• v44 — меню Финансы, кнопка 💰 в расписании',
    { parse_mode: 'Markdown' }
  );
});

// ── КНОПКА 💰 ФИНАНСЫ ────────────────────────────────────────────
bot.onText(/💰 Финансы/, async function(msg) {
  var chatId = msg.chat.id; var chatIdStr = String(chatId);
  if (!isAdmin(chatIdStr)) return;
  bot.sendMessage(chatId, '💰 *Финансы:*', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
    [{ text: '💵 Доходы за период', callback_data: 'fin_income' }, { text: '📉 Расходы за период', callback_data: 'fin_expenses' }],
    [{ text: '📊 Баланс (доходы − расходы)', callback_data: 'fin_balance' }],
    [{ text: '➕ Добавить доход', callback_data: 'fin_add_income' }, { text: '➕ Добавить расход', callback_data: 'fin_add_expense' }],
    [{ text: '📈 Итоги месяца', callback_data: 'fin_month_summary' }, { text: '🔮 Прогноз', callback_data: 'fin_forecast' }]
  ]}});
});

// ── КНОПКА 🔍 НАЙТИ ──────────────────────────────────────────────
bot.onText(/🔍 Найти/, async function(msg) {
  var chatId = msg.chat.id; var chatIdStr = String(chatId);
  if (!isAdmin(chatIdStr)) return;
  bot.sendMessage(chatId, '🔍 *Что ищем?*', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
    [{ text: '📅 По периоду', callback_data: 'find_period' }],
    [{ text: '🏊 Со спа / кроваткой', callback_data: 'find_spa' }, { text: '📋 С заданиями', callback_data: 'find_tasks' }],
    [{ text: '💰 Без стоимости', callback_data: 'find_no_income' }, { text: '🔮 Будущие брони', callback_data: 'find_future' }],
    [{ text: '❓ Помощь', callback_data: 'find_help' }]
  ]}});
});

// ── КНОПКА 📊 ОТЧЁТЫ ─────────────────────────────────────────────
bot.onText(/📊 Отчёты/, async function(msg) {
  var chatId = msg.chat.id; var chatIdStr = String(chatId);
  if (!isAdmin(chatIdStr)) return;
  var text = '📊 *Доступные отчёты:*\n\n' +
    '*💰 Финансовые:*\n' +
    '• «доход за апрель» / «доход за этот месяц»\n' +
    '• «доход по апартаментам за март»\n' +
    '• «доходы против расходов за этот месяц»\n' +
    '• «средняя стоимость ночи»\n' +
    '• «лучший месяц за всё время»\n' +
    '• «сравни апрель с мартом»\n' +
    '• «доход по источникам» (Airbnb vs Holidu)\n\n' +
    '*📅 По бронированиям:*\n' +
    '• «загруженность апартаментов за май»\n' +
    '• «будущие брони с суммами»\n' +
    '• «брони без стоимости»\n' +
    '• «средняя длина брони»\n' +
    '• «простои между бронями»\n' +
    '• «количество броней за квартал»\n\n' +
    '*🧹 Операционные:*\n' +
    '• «расходы на клининг за месяц»\n' +
    '• «расходы на стирку за март»\n' +
    '• «долг уборщицам сегодня»\n\n' +
    '*📈 Сводные и аналитика:*\n' +
    '• «итоги месяца» / «итоги апреля»\n' +
    '• «финансовая сводка за квартал»\n' +
    '• «прогноз дохода на май»\n' +
    '• «топ апартамент за всё время»\n' +
    '• «сезонность — какой месяц лучший»\n' +
    '• «ROI за этот год»\n\n' +
    '_Все отчёты — голосом или текстом!_';
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

// ── КОМАНДА /спа ──────────────────────────────────────────────────
bot.onText(/\/спа|🏊 Спа/, async function(msg) {
  var chatId = msg.chat.id; var chatIdStr = String(chatId);
  if (!isAdmin(chatIdStr)) return;
  try {
    var r = await api('get_bookings_with_spa');
    if (!r.data || r.data.length === 0) return bot.sendMessage(chatId, '🏊 Нет броней со спа или кроваткой', getMenu(chatIdStr));
    var text = '🏊 Брони со спа / детской кроваткой:\n\n';
    var buttons = [];
    r.data.forEach(function(b) {
      var apt = APT_NAMES[b.apartment] || b.apartment;
      var tasks = b.tasks || {};
      var icons = '';
      if (tasks.find && tasks.find(function(t) { return t.key === 'spa' && t.enabled; })) icons += '🏊';
      if (tasks.find && tasks.find(function(t) { return t.key === 'crib' && t.enabled; })) icons += '🛏';
      text += apt + ' · ' + fmtDateShort(b.checkin_date) + '–' + fmtDateShort(b.checkout_date) + ' · ' + (b.guests_count || '?') + 'г ' + icons + '\n';
      buttons.push([
        { text: apt + ' ' + fmtDateShort(b.checkin_date) + ' ' + icons, callback_data: 'noop' },
        { text: '✏️', callback_data: 'nb_assign_' + b.id }
      ]);
    });
    bot.sendMessage(chatId, text, { reply_markup: { inline_keyboard: buttons } });
  } catch(e) { bot.sendMessage(chatId, 'Ошибка: ' + e.message, getMenu(chatIdStr)); }
});

// ── КОМАНДА /задания ──────────────────────────────────────────────
bot.onText(/\/задания|📋 Задания/, async function(msg) {
  var chatId = msg.chat.id; var chatIdStr = String(chatId);
  if (!isAdmin(chatIdStr)) return;
  try {
    var r = await api('get_bookings_with_tasks');
    if (!r.data || r.data.length === 0) return bot.sendMessage(chatId, '📋 Нет броней с заданиями', getMenu(chatIdStr));
    var text = '📋 Все задания:\n\n';
    r.data.forEach(function(b) {
      var apt = APT_NAMES[b.apartment] || b.apartment;
      text += '*' + apt + '* · ' + fmtDateShort(b.checkin_date) + '–' + fmtDateShort(b.checkout_date) + '\n';
      text += fmtInstructions(JSON.stringify(b.tasks)) + '\n\n';
    });
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch(e) { bot.sendMessage(chatId, 'Ошибка: ' + e.message, getMenu(chatIdStr)); }
});

// ── УМНЫЙ ПАРСИНГ ДАТ ────────────────────────────────────────────
var MONTHS_RU = {
  'января':1,'февраля':2,'марта':3,'апреля':4,'мая':5,'июня':6,
  'июля':7,'августа':8,'сентября':9,'октября':10,'ноября':11,'декабря':12,
  'январь':1,'февраль':2,'март':3,'апрель':4,'май':5,'июнь':6,
  'июль':7,'август':8,'сентябрь':9,'октябрь':10,'ноябрь':11,'декабрь':12
};
var MONTH_NAMES_RU = ['','январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
var CYR = '[а-яёa-z]+'; // для регулярок по русскому тексту

function padZ(n) { return String(n).padStart(2,'0'); }
function lastDayOf(year, month) { return new Date(year, month, 0).getDate(); }
function isoDate(y, m, d) { return y + '-' + padZ(m) + '-' + padZ(d); }

function parsePeriodDates(text) {
  var now = new Date();
  var year = now.getFullYear();
  var todayStr = isoDate(year, now.getMonth()+1, now.getDate());
  // Нормализуем: нижний регистр, ё→е, множественные пробелы
  var lower = text.trim().toLowerCase()
    .replace(/ё/g,'е')
    .replace(/\s+/g,' ')
    .trim();

  // ── 1. ЧИСЛОВЫЕ ФОРМАТЫ ─────────────────────────────────────────
  var clean = lower.replace(/\//g,'.').replace(/[—–]/g,'-');
  // 20.04-15.05 / 20.04.2026-15.05.2026
  var m = clean.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\s*-\s*(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/);
  if (m) {
    var y1=m[3]?parseInt(m[3]):year, y2=m[6]?parseInt(m[6]):year;
    var mo1=parseInt(m[2]), mo2=parseInt(m[5]);
    if (!m[6] && mo2<mo1) y2++;
    return { from:isoDate(y1,mo1,parseInt(m[1])), to:isoDate(y2,mo2,parseInt(m[4])), label:m[1]+'.'+padZ(mo1)+' — '+m[4]+'.'+padZ(mo2) };
  }
  // Одна дата 20.04
  m = clean.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/);
  if (m) {
    var y=m[3]?parseInt(m[3]):year;
    var d=isoDate(y,parseInt(m[2]),parseInt(m[1]));
    return { from:d, to:d, label:m[1]+'.'+m[2]+(m[3]?'.'+m[3]:'') };
  }

  // ── 2. КЛЮЧЕВЫЕ СЛОВА ────────────────────────────────────────────

  // сегодня / завтра
  if (lower==='сегодня') return { from:todayStr, to:todayStr, label:'сегодня' };
  if (lower==='завтра') {
    var t=new Date(now); t.setDate(t.getDate()+1);
    var d=isoDate(t.getFullYear(),t.getMonth()+1,t.getDate());
    return { from:d, to:d, label:'завтра' };
  }

  // N дней: "10 дней" / "на 5 дней"
  m = lower.match(/(\d+)\s+дн/);
  if (m) {
    var end=new Date(now); end.setDate(end.getDate()+parseInt(m[1]));
    return { from:todayStr, to:isoDate(end.getFullYear(),end.getMonth()+1,end.getDate()), label:m[1]+' дней' };
  }

  // эта/текущая неделя
  if (/^(эт|текущ)/.test(lower) && lower.includes('недел')) {
    var dow=now.getDay()||7;
    var mon=new Date(now); mon.setDate(now.getDate()-dow+1);
    var sun=new Date(mon); sun.setDate(mon.getDate()+6);
    return { from:isoDate(mon.getFullYear(),mon.getMonth()+1,mon.getDate()), to:isoDate(sun.getFullYear(),sun.getMonth()+1,sun.getDate()), label:'эта неделя' };
  }

  // следующая неделя (без цифры)
  if (lower.includes('следующ') && lower.includes('недел') && !/\d/.test(lower)) {
    var dow=now.getDay()||7;
    var mon=new Date(now); mon.setDate(now.getDate()-dow+8);
    var sun=new Date(mon); sun.setDate(mon.getDate()+6);
    return { from:isoDate(mon.getFullYear(),mon.getMonth()+1,mon.getDate()), to:isoDate(sun.getFullYear(),sun.getMonth()+1,sun.getDate()), label:'следующая неделя' };
  }

  // N недель: "следующие 2 недели" / "за 3 недели" / "две недели"
  if (lower.includes('недел')) {
    m = lower.match(/(\d+)\s+недел/);
    var wn = m ? parseInt(m[1]) : lower.includes('дв') ? 2 : lower.includes('тр') ? 3 : lower.includes('четыр') ? 4 : 0;
    if (wn > 0) {
      var end=new Date(now); end.setDate(now.getDate()+wn*7);
      return { from:todayStr, to:isoDate(end.getFullYear(),end.getMonth()+1,end.getDate()), label:wn+' недели' };
    }
  }

  // этот/текущий месяц / за этот месяц
  if ((lower.startsWith('эт') || lower.startsWith('текущ') || lower.startsWith('за эт') || lower.startsWith('за текущ')) && lower.includes('месяц')) {
    var mo=now.getMonth()+1;
    return { from:isoDate(year,mo,1), to:isoDate(year,mo,lastDayOf(year,mo)), label:MONTH_NAMES_RU[mo] };
  }

  // до конца месяца / до конца этого месяца
  if (lower.includes('до конца') && (lower.includes('месяц') || !lower.match(/[а-я]{4,}/g) )) {
    var mo=now.getMonth()+1;
    return { from:todayStr, to:isoDate(year,mo,lastDayOf(year,mo)), label:'до конца '+MONTH_NAMES_RU[mo] };
  }

  // "за апрель" / "за май" — "за" + название месяца
  if (lower.startsWith('за ')) {
    var afterZa = lower.slice(3).trim();
    if (MONTHS_RU[afterZa]) {
      var mo = MONTHS_RU[afterZa]; var y = year; if (mo < now.getMonth()+1) y++;
      return { from:isoDate(y,mo,1), to:isoDate(y,mo,lastDayOf(y,mo)), label:'за '+MONTH_NAMES_RU[mo] };
    }
  }

  // следующий месяц (без цифры)
  if (lower.includes('следующ') && lower.includes('месяц') && !/\d/.test(lower)) {
    var mo=now.getMonth()+2; var y=year; if (mo>12){mo=1;y++;}
    return { from:isoDate(y,mo,1), to:isoDate(y,mo,lastDayOf(y,mo)), label:MONTH_NAMES_RU[mo] };
  }

  // N месяцев: "следующие 2 месяца" / "три месяца"
  if (lower.includes('месяц')) {
    m = lower.match(/(\d+)\s+месяц/);
    var mn = m ? parseInt(m[1]) : lower.includes('дв') ? 2 : lower.includes('тр') ? 3 : lower.includes('четыр') ? 4 : 0;
    if (mn > 0) {
      var end=new Date(year,now.getMonth()+mn,now.getDate());
      return { from:todayStr, to:isoDate(end.getFullYear(),end.getMonth()+1,end.getDate()), label:mn+' месяца' };
    }
  }

  // ── 3. НАЧАЛО/СЕРЕДИНА/КОНЕЦ ─────────────────────────────────────
  // "с середины мая по середину июня" / "с начала апреля по конец августа"
  var getBoundDay = function(word, mo, y) {
    if (word.startsWith('нач')) return 1;
    if (word.startsWith('сер')) return 15;
    if (word.startsWith('кон')) return lastDayOf(y, mo);
    return 1;
  };
  var isBound = function(w) { return w.startsWith('нач')||w.startsWith('сер')||w.startsWith('кон'); };

  // Ищем паттерн: ГРАНИЦА МЕСЯЦ ... ГРАНИЦА МЕСЯЦ
  var parts = lower.replace(/[,;]/g,' ').split(/\s+/);
  var boundPairs = [];
  for (var i=0; i<parts.length-1; i++) {
    if (isBound(parts[i]) && MONTHS_RU[parts[i+1]]) {
      boundPairs.push({ bound: parts[i], month: MONTHS_RU[parts[i+1]], name: parts[i+1] });
    }
  }
  if (boundPairs.length >= 2) {
    var bp1=boundPairs[0], bp2=boundPairs[boundPairs.length-1];
    var y1=year, y2=year; if (bp2.month < bp1.month) y2++;
    return {
      from: isoDate(y1, bp1.month, getBoundDay(bp1.bound, bp1.month, y1)),
      to:   isoDate(y2, bp2.month, getBoundDay(bp2.bound, bp2.month, y2)),
      label: bp1.bound+' '+bp1.name+' — '+bp2.bound+' '+bp2.name
    };
  }
  if (boundPairs.length === 1) {
    var bp=boundPairs[0]; var y1=year; if (bp.month < now.getMonth()+1) y1++;
    var d1=getBoundDay(bp.bound, bp.month, y1);
    return { from:isoDate(y1,bp.month,d1), to:isoDate(y1,bp.month,lastDayOf(y1,bp.month)), label:bp.bound+' '+bp.name };
  }

  // ── 4. ПОИСК МЕСЯЦЕВ ─────────────────────────────────────────────
  // Ищем все упомянутые месяцы по порядку позиции в тексте
  var foundMonths = [];
  var sortedKeys = Object.keys(MONTHS_RU).sort(function(a,b){return b.length-a.length;});
  var lw = lower;
  sortedKeys.forEach(function(k) {
    var idx = lw.indexOf(k);
    if (idx !== -1 && !foundMonths.find(function(f){return f.month===MONTHS_RU[k];})) {
      foundMonths.push({ month:MONTHS_RU[k], pos:idx, name:k });
      lw = lw.slice(0,idx)+' '.repeat(k.length)+lw.slice(idx+k.length);
    }
  });
  foundMonths.sort(function(a,b){return a.pos-b.pos;});

  if (foundMonths.length >= 2) {
    var fm1=foundMonths[0], fm2=foundMonths[foundMonths.length-1];
    var y1=year, y2=year; if (fm2.month < fm1.month) y2++;
    // Проверяем числа перед месяцами: "25 апреля 15 мая"
    var nb1=lower.slice(Math.max(0,fm1.pos-4),fm1.pos).match(/(\d{1,2})\s*$/);
    var nb2=lower.slice(Math.max(0,fm2.pos-4),fm2.pos).match(/(\d{1,2})\s*$/);
    if (nb1 && nb2) {
      var d1=parseInt(nb1[1]), d2=parseInt(nb2[1]);
      if (fm2.month < fm1.month || (fm2.month===fm1.month && d2<d1)) y2++;
      return { from:isoDate(y1,fm1.month,d1), to:isoDate(y2,fm2.month,d2), label:d1+' '+fm1.name+' — '+d2+' '+fm2.name };
    }
    return { from:isoDate(y1,fm1.month,1), to:isoDate(y2,fm2.month,lastDayOf(y2,fm2.month)), label:MONTH_NAMES_RU[fm1.month]+' — '+MONTH_NAMES_RU[fm2.month] };
  }

  if (foundMonths.length === 1) {
    var fm=foundMonths[0]; var y=year; if (fm.month < now.getMonth()+1) y++;
    // Паттерн "с 1 по 10 июля" / "1-10 июля" / "1 по 10 июля"
    var twoNums = lower.match(/(\d{1,2})\s*(?:по|до|-)\s*(\d{1,2})\s+(?:июля|июня|мая|апреля|марта|февраля|января|августа|сентября|октября|ноября|декабря|июль|июнь|май|апрель|март|февраль|январь|август|сентябрь|октябрь|ноябрь|декабрь)/);
    if (twoNums) {
      var d1=parseInt(twoNums[1]), d2=parseInt(twoNums[2]);
      return { from:isoDate(y,fm.month,d1), to:isoDate(y,fm.month,d2), label:d1+'-'+d2+' '+fm.name };
    }
    var nb=lower.slice(Math.max(0,fm.pos-4),fm.pos).match(/(\d{1,2})\s*$/);
    if (nb) {
      var d=parseInt(nb[1]);
      return { from:isoDate(y,fm.month,d), to:isoDate(y,fm.month,lastDayOf(y,fm.month)), label:d+' '+fm.name };
    }
    return { from:isoDate(y,fm.month,1), to:isoDate(y,fm.month,lastDayOf(y,fm.month)), label:MONTH_NAMES_RU[fm.month] };
  }

  return null;
}

// ── КОМАНДА /период ───────────────────────────────────────────────
// ── КАЛЕНДАРНЫЙ ПИКЕР ────────────────────────────────────────────
function buildDatePicker(year, month, mode, selectedFrom) {
  var DAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  var monthNames = ['','Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  var firstDay = new Date(year, month-1, 1).getDay();
  firstDay = (firstDay+6)%7;
  var daysInMonth = lastDayOf(year, month);
  var today = new Date();
  var todayStr = isoDate(today.getFullYear(), today.getMonth()+1, today.getDate());
  var title = (mode==='from' ? '📅 Начало периода:' : '📅 Конец периода:') + '\n' + monthNames[month] + ' ' + year;
  var buttons = [];
  var prevM = month-1, prevY = year; if (prevM<1){prevM=12;prevY--;}
  var nextM = month+1, nextY = year; if (nextM>12){nextM=1;nextY++;}
  var sfx = selectedFrom ? '_'+selectedFrom : '';
  buttons.push([
    { text: '◀', callback_data: 'dp_nav_'+prevY+'_'+prevM+'_'+mode+sfx },
    { text: monthNames[month]+' '+year, callback_data: 'noop' },
    { text: '▶', callback_data: 'dp_nav_'+nextY+'_'+nextM+'_'+mode+sfx }
  ]);
  buttons.push(DAYS.map(function(d){ return { text: d, callback_data: 'noop' }; }));
  var row = [];
  for (var i=0; i<firstDay; i++) row.push({ text: ' ', callback_data: 'noop' });
  for (var day=1; day<=daysInMonth; day++) {
    var dateStr = isoDate(year, month, day);
    var label = String(day);
    if (dateStr === todayStr) label = '·'+day+'·';
    if (selectedFrom && dateStr === selectedFrom) label = '['+day+']';
    row.push({ text: label, callback_data: 'dp_pick_'+dateStr+'_'+mode+sfx });
    if (row.length===7) { buttons.push(row); row=[]; }
  }
  while (row.length>0 && row.length<7) row.push({ text: ' ', callback_data: 'noop' });
  if (row.length) buttons.push(row);
  buttons.push([{ text: '❌ Отмена', callback_data: 'dp_cancel' }]);
  return { text: title, buttons: buttons };
}

bot.onText(/\/период (.+)|📅 Период/, async function(msg, match) {
  var chatId = msg.chat.id; var chatIdStr = String(chatId);
  if (!isAdmin(chatIdStr)) return;
  if (!match || !match[1]) {
    var now = new Date();
    var todayStr = isoDate(now.getFullYear(), now.getMonth()+1, now.getDate());
    var thisMonthEnd = isoDate(now.getFullYear(), now.getMonth()+1, lastDayOf(now.getFullYear(), now.getMonth()+1));
    var nextMo = now.getMonth()+2 > 12 ? 1 : now.getMonth()+2;
    var nextMoY = now.getMonth()+2 > 12 ? now.getFullYear()+1 : now.getFullYear();
    sessions[chatId] = { step: 'period_menu' };
    var quickButtons = [
      [
        { text: '📆 Сегодня', callback_data: 'dp_quick_today' },
        { text: '📆 Эта неделя', callback_data: 'dp_quick_week' }
      ],
      [
        { text: '📆 Этот месяц', callback_data: 'dp_quick_month' },
        { text: '📆 След. месяц', callback_data: 'dp_quick_nextmonth' }
      ],
      [
        { text: '📆 2 недели', callback_data: 'dp_quick_2weeks' },
        { text: '📆 3 месяца', callback_data: 'dp_quick_3months' }
      ],
      [{ text: '🗓 Выбрать даты вручную', callback_data: 'dp_open_calendar' }],
      [{ text: '⌨️ Ввести текстом', callback_data: 'dp_text_input' }]
    ];
    bot.sendMessage(chatId, '📅 Выбери период:', { reply_markup: { inline_keyboard: quickButtons } });
    return;
  }
  await showPeriodBookings(chatId, chatIdStr, match[1]);
});


// ── ФОРМАТИРОВАНИЕ БРОНИ В ПЕРИОД ────────────────────────────────
function formatBookingEntry(b) {
  var apt = APT_NAMES[b.apartment] || b.apartment;
  var src = fmtSource(b.source);
  var tasks = b.tasks;
  var icons = '', taskLines = [];
  var guestsFromTask = null;
  if (tasks) {
    try {
      var arr = typeof tasks === 'string' ? JSON.parse(tasks) : tasks;
      if (Array.isArray(arr)) {
        arr.forEach(function(t) {
          if (!t.enabled) return;
          if (t.key === 'spa') { icons += '🏊'; taskLines.push('Спа'); }
          else if (t.key === 'crib') { icons += '🛏'; taskLines.push('Детская кроватка'); }
          else if (t.key === 'highchair') { icons += '🪑'; taskLines.push('Детский стульчик'); }
          else if (t.key === 'guests' && t.value) { guestsFromTask = t.value; taskLines.push('Гостей: '+t.value); }
          else if (t.key === 'beds' && t.value) taskLines.push('Кроватей: '+t.value);
          else taskLines.push(t.name + (t.value ? ': '+t.value : ''));
        });
      }
    } catch(e) {}
  }
  var guests = guestsFromTask || b.next_guests || b.guests_count;
  var line = (src ? src+' ' : '') + '*' + apt + '*';
  line += '  ' + fmtDateShort(b.checkin_date) + '→' + fmtDateShort(b.checkout_date);
  if (guests) line += '  👥' + guests;
  if (icons) line += '  ' + icons;
  line += '\n';
  if (b.cleaner_name) line += '  🧹 ' + b.cleaner_name + '\n';
  if (taskLines.length) line += '  📋 ' + taskLines.join(', ') + '\n';
  if (b.comment) line += '  💬 _' + b.comment + '_\n';
  return line;
}

function buildBookingButtons(b) {
  var apt = APT_NAMES[b.apartment] || b.apartment;
  var src = fmtSource(b.source);
  var guests = b.guests_count || b.next_guests || '?';
  var cleanerShort = b.cleaner_name ? b.cleaner_name.split(' ')[0] : '❌';
  var cleaner = ' · 🧹' + cleanerShort;
  var label = (src ? src+' ' : '') + apt + ' · ' + fmtDateShort(b.checkin_date) + '→' + fmtDateShort(b.checkout_date) + ' · ' + guests + 'г' + cleaner;
  // Две строки: заголовок брони + кнопки действий
  return [
    [{ text: label, callback_data: 'noop' }],
    [
      { text: '📋 Задание', callback_data: 'nb_assign_' + b.id },
      { text: '💰 Стоимость', callback_data: 'inc_add_' + b.id },
      { text: '🔑 Код', callback_data: 'lock_new_' + b.apartment + '_' + (b.checkin_date||'') + '_' + (b.checkout_date||'') },
      { text: '💬', callback_data: 'bk_comment_' + b.id }
    ]
  ];
}

async function showPeriodBookings(chatId, chatIdStr, periodStr) {
  try {
    var dates = parsePeriodDates(periodStr);
    if (!dates) {
      bot.sendMessage(chatId,
        '❓ Не могу распознать период.\n\n' +
        'Попробуй:\n' +
        '• 20.04-15.05\n• апрель май\n• следующая неделя\n' +
        '• следующие 2 месяца\n• с середины мая по середину июня\n' +
        '• за апрель / за май / этот месяц'
      );
      return;
    }
    await showPeriodBookingsDates(chatId, chatIdStr, dates.from, dates.to, dates.label);
  } catch(e) { bot.sendMessage(chatId, 'Ошибка: ' + e.message, getMenu(chatIdStr)); }
}

// Показ броней по готовым датам (из пикера или парсера)
// ── ФОРМАТИРОВАНИЕ БРОНИ ПО ДАТЕ/ПЕРИОДУ (3 секции) ─────────────
function buildDateSummary(allBookings, dateFrom, dateTo, label) {
  var checkins = [], checkouts = [], inProgress = [];
  allBookings.forEach(function(b) {
    var ci = b.checkin_date ? b.checkin_date.slice(0,10) : null;
    var co = b.checkout_date ? b.checkout_date.slice(0,10) : null;
    if (!ci || !co) return;
    var isCheckin  = ci >= dateFrom && ci <= dateTo;
    var isCheckout = co >= dateFrom && co <= dateTo;
    var isActive   = ci <= dateTo && co >= dateFrom;
    if (isCheckin)  checkins.push(b);
    if (isCheckout) checkouts.push(b);
    if (isActive && !isCheckin && !isCheckout) inProgress.push(b);
  });

  var isSingleDay = dateFrom === dateTo;
  var dateLabel = isSingleDay
    ? dateFrom.slice(8)+'.'+dateFrom.slice(5,7)
    : dateFrom.slice(8)+'.'+dateFrom.slice(5,7)+' — '+dateTo.slice(8)+'.'+dateTo.slice(5,7);

  var text = '📅 *' + (label || dateLabel) + '*\n\n';
  var total = checkins.length + checkouts.length + inProgress.length;
  if (total === 0) { return text + '🟢 Броней нет — всё свободно'; }

  function fmtB(b) {
    var apt = APT_NAMES[b.apartment] || b.apartment;
    var src = fmtSource(b.source);
    var guests = b.guests_count || b.next_guests || '?';
    var cleaner = b.cleaner_name ? ' · 🧹 ' + b.cleaner_name : '';
    var task = b.special_instructions ? ' 📋' : '';
    return (src ? src+' ' : '') + '*' + apt + '* · ' + fmtDateShort(b.checkin_date) + '→' + fmtDateShort(b.checkout_date) + ' · ' + guests + 'г' + cleaner + task + '\n';
  }

  if (checkins.length > 0) {
    text += '🟢 *Заезды (' + checkins.length + '):*\n';
    checkins.forEach(function(b) { text += '  ' + fmtB(b); });
    text += '\n';
  }
  if (checkouts.length > 0) {
    text += '🔴 *Выезды (' + checkouts.length + '):*\n';
    checkouts.forEach(function(b) { text += '  ' + fmtB(b); });
    text += '\n';
  }
  if (inProgress.length > 0) {
    text += '🔵 *В процессе (' + inProgress.length + '):*\n';
    inProgress.forEach(function(b) { text += '  ' + fmtB(b); });
    text += '\n';
  }
  return text;
}

async function showPeriodBookingsDates(chatId, chatIdStr, dateFrom, dateTo, label) {
  try {
    var r = await api('get_bookings_by_period', { date_from: dateFrom, date_to: dateTo });
    var allBookings = r.data || [];

    // Заголовок с секциями
    var summaryText = buildDateSummary(allBookings, dateFrom, dateTo, label);
    if (allBookings.length === 0) {
      bot.sendMessage(chatId, summaryText, { parse_mode: 'Markdown' }); return;
    }
    bot.sendMessage(chatId, summaryText, { parse_mode: 'Markdown' });

    // Кнопки для каждой брони
    var sorted = allBookings.slice().sort(function(a,b){ return a.checkin_date > b.checkin_date ? 1 : -1; });
    var chunks = []; for (var i=0; i<sorted.length; i+=6) chunks.push(sorted.slice(i,i+6));
    chunks.forEach(function(chunk) {
      var buttons = [];
      chunk.forEach(function(b) {
        var rows = buildBookingButtons(b);
        rows.forEach(function(row) { buttons.push(row); });
        buttons.push([{ text: '─────────────', callback_data: 'noop' }]);
      });
      bot.sendMessage(chatId, '📌 *Действия:*', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
    });
  } catch(e) { bot.sendMessage(chatId, 'Ошибка: '+e.message, getMenu(chatIdStr)); }
}




// ── 📅 РАСПИСАНИЕ ─────────────────────────────────────────────────
bot.onText(/📅 Расписание и запись|📅 Расписание/, async function(msg) {
  if (isGroup(msg)) {
    bot.sendMessage(msg.chat.id, '📅 Открой расписание в личном чате:', { reply_markup: { inline_keyboard: [[{ text: '📅 Расписание и запись', url: 'https://t.me/ERAGROUPlinen_bot?start=schedule' }]] }});
    return;
  }
  var chatId = msg.chat.id; var chatIdStr = String(chatId); var inGroup = isGroup(msg);
  if (isLaundryGroup(chatIdStr)) return;
  try {
    var r = await api('get_schedule');
    if (!r.data || r.data.length === 0) return bot.sendMessage(chatId, 'Нет уборок на ближайшие 30 дней', inGroup ? groupMenu : getMenu(chatIdStr));
    var today = new Date(); var todayStr = today.toISOString().split('T')[0];
    var in30Str = new Date(today.getTime() + 30*24*60*60*1000).toISOString().split('T')[0];
    var upcoming = r.data.filter(function(s) { if (!s.checkout_date) return false; var d = s.checkout_date.slice(0,10); return d >= todayStr && d <= in30Str; });
    scheduleCache = r.data;
    if (upcoming.length === 0) return bot.sendMessage(chatId, 'Нет уборок на ближайшие 30 дней', inGroup ? groupMenu : getMenu(chatIdStr));

    if (inGroup) {
      var text = 'Расписание выездов (30 дней):\n\n'; var byApt = {};
      upcoming.forEach(function(s) { if (!byApt[s.apartment]) byApt[s.apartment] = []; byApt[s.apartment].push(s); });
      for (var apt in byApt) {
        text += (APT_NAMES[apt] || apt) + ':\n';
        byApt[apt].forEach(function(sl) { var ci = sl.checkin_date ? ' (заехали ' + fmtDateShort(sl.checkin_date) + ')' : ''; var gForCleaner = getGuestsForCleaner(sl, r.data); text += '  • ' + (fmtSource(sl.source) ? fmtSource(sl.source)+' ' : '') + fmtDate(sl.checkout_date) + ci + ' · ' + gForCleaner + ' г · ' + (sl.cleaner_name||'свободно') + '\n'; });
        text += '\n';
      }
      bot.sendMessage(chatId, text + 'Для записи напиши в личку'); return;
    }

    if (isAdmin(chatIdStr)) {
      var buttons = [];
      upcoming.forEach(function(s) {
        var guests = s.next_guests||s.guests_count||'?';
        var aptName = APT_NAMES[s.apartment]||s.apartment;
        var aptShort = APT_SHORT[s.apartment]||s.apartment;
        var cleanerFull = s.cleaner_name||'свободно';
        var isToday = s.checkout_date && s.checkout_date.slice(0,10) === todayStr;
        var src = fmtSource(s.source) || '';
        var srcFull = s.source ? (s.source.includes('airbnb')?'Airbnb':s.source.includes('holidu')?'Holidu':s.source.includes('booking')?'Booking':'Прямая') : '—';
        var hasTask = s.special_instructions ? ' 📋' : '';
        var income = s.income_amount ? ' 💰'+s.income_amount+'€' : '';
        // Заголовок смены — полная информация
        var headerParts = [
          (isToday ? '🔴 СЕГОДНЯ · ' : '') + aptName,
          '📅 Заезд: '+fmtDateShort(s.checkin_date||s.checkout_date)+' · Выезд: '+fmtDateShort(s.checkout_date),
          '👥 '+guests+' г · 🧹 '+cleanerFull,
          src ? '📱 '+srcFull : '',
        ].filter(Boolean).join(' · ');
        buttons.push([{ text: headerParts + income + hasTask, callback_data: 'noop' }]);
        buttons.push([
          { text: '🔄 Заменить', callback_data: 'rep_'+s.id },
          { text: '📋 Задание', callback_data: 'nt_'+s.id },
          { text: '💰', callback_data: 'inc_add_'+s.id },
          { text: '🔑', callback_data: 'lock_new_'+s.apartment+'|'+(s.checkin_date||'')+'|'+(s.checkout_date||'') },
          { text: '🗑', callback_data: 'del_'+s.id }
        ]);
      });
      bot.sendMessage(chatId, '📅 *Расписание на 30 дней:*', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } }); return;
    }

    // Уборщица
    var buttons = upcoming.map(function(s) {
      var guests = getGuestsForCleaner(s, r.data); var aptShort = APT_SHORT[s.apartment]||s.apartment;
      var cleanerShort = truncateName(s.cleaner_name||'свободно',8); var dateShort = fmtDateShort(s.checkout_date);
      var isToday = s.checkout_date.slice(0,10) === todayStr; var src = fmtSource(s.source);
      if (isToday) {
        // Уборщицы могут записаться на сегодня если ещё нет уборщицы и время до 12:00
        var nowHour = new Date().getHours();
        var noCleanerYet = !s.cleaner_name;
        if (noCleanerYet && nowHour < 12) {
          var signupCb = s.apartment === 'grande' ? 'gc_'+s.id : 'su_'+s.id;
          return [{ text: (src?src+' ':'')+aptShort+' '+dateShort+' · свободно (СЕГОДНЯ!)', callback_data: signupCb }];
        }
        return [{ text: '🔒 '+(src?src+' ':'')+aptShort+' '+dateShort+' · '+cleanerShort+' (сегодня)', callback_data: 'noop' }];
      }
      var signupCb = s.apartment === 'grande' ? 'gc_'+s.id : 'su_'+s.id;
      return [{ text: (src?src+' ':'')+aptShort+' '+dateShort+' · '+guests+'г · '+cleanerShort, callback_data: signupCb }];
    });
    bot.sendMessage(chatId, 'Выбери уборку:', { reply_markup: { inline_keyboard: buttons } });
  } catch(e) { console.error('[schedule]', e.message); bot.sendMessage(chatId, 'Ошибка расписания: '+e.message, getMenu(chatIdStr)); }
});

// ── 📋 МОИ СМЕНЫ ──────────────────────────────────────────────────
bot.onText(/📋 Мои смены/, async function(msg) {
  if (isGroup(msg)) return;
  var chatId = msg.chat.id; var firstName = msg.from.first_name || 'Уборщица';
  try {
    var r = await api('get_my_assignments', { chat_id: String(chatId) });
    if (!r.data || r.data.length === 0) return bot.sendMessage(chatId, firstName+', нет смен.', getMenu(String(chatId)));
    var text = 'Смены — '+firstName+'\n\n';
    var upcoming = r.data.filter(function(a) { return ['assigned','confirmed','in_progress'].includes(a.status); });
    var past = r.data.filter(function(a) { return ['completed','paid'].includes(a.status); });
    if (upcoming.length > 0) { text += 'Предстоящие:\n'; upcoming.forEach(function(a) { text += '• '+fmtDate(a.cleaning_date)+' · '+(APT_NAMES[a.apartment]||a.apartment)+(a.special_instructions?' 📋':'')+'\n'; }); text += '\n'; }
    if (past.length > 0) { text += 'Выполненные:\n'; past.forEach(function(a) { var apt = APT_NAMES[a.apartment]||a.apartment||'?'; var fee = a.payment_amount||CLEANING_FEE[a.apartment]||35; text += '• '+fmtDate(a.cleaning_date)+' · '+apt+'\n  '+(a.started_at?fmtTime(a.started_at):'—')+'–'+(a.finished_at?fmtTime(a.finished_at):'—')+' · '+fee+'EUR · '+(a.status==='paid'?'выдано':'не выдано')+'\n'; }); }
    bot.sendMessage(chatId, text, getMenu(String(chatId)));
  } catch(e) { bot.sendMessage(chatId, 'Ошибка: '+e.message, getMenu(String(chatId))); }
});

// ── 🧹 НАЧАТЬ УБОРКУ ──────────────────────────────────────────────
bot.onText(/🧹 Начать уборку/, async function(msg) {
  if (isGroup(msg)) { bot.sendMessage(msg.chat.id, 'Для управления уборкой напиши мне в личку @ERAGROUPlinen_bot'); return; }
  var chatId = msg.chat.id;
  try {
    var r = await api('get_my_assignments', { chat_id: String(chatId) });
    var active = r.data ? r.data.filter(function(a) { return a.status === 'assigned'; }) : [];
    if (active.length === 0) return bot.sendMessage(chatId, 'Нет записанных уборок.', getMenu(String(chatId)));
    var buttons = active.map(function(a) { return [{ text: (APT_NAMES[a.apartment]||a.apartment)+' · '+fmtDate(a.cleaning_date)+(a.special_instructions?' 📋':''), callback_data: 'st_'+a.id }]; });
    bot.sendMessage(chatId, 'Какую уборку начинаешь?', { reply_markup: { inline_keyboard: buttons } });
  } catch(e) { bot.sendMessage(chatId, 'Ошибка: '+e.message, getMenu(String(chatId))); }
});

// ── ✅ УБОРКА ОКОНЧЕНА ────────────────────────────────────────────
bot.onText(/✅ Уборка окончена/, async function(msg) {
  if (isGroup(msg)) { bot.sendMessage(msg.chat.id, 'Для управления уборкой напиши мне в личку @ERAGROUPlinen_bot'); return; }
  var chatId = msg.chat.id;
  try {
    var r = await api('get_my_assignments', { chat_id: String(chatId) });
    var active = r.data ? r.data.filter(function(a) { return a.status === 'in_progress'; }) : [];
    if (active.length === 0) return bot.sendMessage(chatId, 'Нет активных уборок.', getMenu(String(chatId)));
    var buttons = active.map(function(a) { return [{ text: (APT_NAMES[a.apartment]||a.apartment)+' · '+fmtDate(a.cleaning_date), callback_data: 'fn_'+a.id }]; });
    bot.sendMessage(chatId, 'Какую уборку завершаешь?', { reply_markup: { inline_keyboard: buttons } });
  } catch(e) { bot.sendMessage(chatId, 'Ошибка: '+e.message, getMenu(String(chatId))); }
});

// ── 🧺 ГРЯЗНОЕ БЕЛЬЁ ──────────────────────────────────────────────
bot.onText(/🧺 Грязное бельё/, function(msg) {
  if (isGroup(msg)) { bot.sendMessage(msg.chat.id, 'Напиши мне в личку @ERAGROUPlinen_bot\nИли текстом: o1 простыни 2 полотенца 4'); return; }
  var chatId = msg.chat.id; var chatIdStr = String(chatId);
  sessions[chatId] = { step: 'linen_form', linen: {} };
  // Автоопределение апартамента из активной смены уборщицы
  var todayStr = new Date().toISOString().split('T')[0];
  var activeSlot = scheduleCache.find(function(s) {
    return String(s.cleaner_telegram_id) === chatIdStr && s.checkout_date && s.checkout_date.slice(0,10) === todayStr;
  });
  if (activeSlot) {
    sessions[chatId].apt = activeSlot.apartment;
    bot.sendMessage(chatId, '🧺 Грязное бельё\n\n🏠 Апартамент: *' + APT_NAMES[activeSlot.apartment] + '*\n\nВведи количество:', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
      [{ text: '❌ Другой апартамент', callback_data: 'la_change' }]
    ]}});
    return;
  }
  var buttons = Object.keys(APT_NAMES).map(function(id) { return [{ text: APT_NAMES[id], callback_data: 'la_'+id }]; });
  bot.sendMessage(chatId, 'Грязное бельё\n\nВыбери апартамент:', { reply_markup: { inline_keyboard: buttons } });
});


// ── 🔄 ВИЗИТ АЛЬБЕРТА ────────────────────────────────────────────
bot.onText(/🔄 Визит Альберта/, function(msg) {
  var chatId = msg.chat.id; var chatIdStr = String(chatId);
  if (!isAdminOrAlbert(chatIdStr) && !isLaundryGroup(chatIdStr)) return;
  sessions[chatId] = { step: 'albert_visit_location', visit: {} };
  var buttons = [
    [{ text: '🏠 Пераль (Оаз1+Оаз2)', callback_data: 'av_loc_piral' }],
    [{ text: '🏠 Сальвадор', callback_data: 'av_loc_salvador' }],
    [{ text: '🏠 Оба (Пераль + Сальвадор)', callback_data: 'av_loc_both' }],
    [{ text: '❌ Отмена', callback_data: 'albert_cancel' }]
  ];
  bot.sendMessage(chatId, '🔄 *Визит Альберта*\n🍍 Piña Colada → 🌿 ERA\n\nОткуда забирает грязное?', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
});

// ── 🚚 АЛЬБЕРТ ЗАБРАЛ ────────────────────────────────────────────
bot.onText(/🚚 Альберт забрал|🚚 Забрал бельё/, function(msg) {
  var chatId = msg.chat.id; var chatIdStr = String(chatId);
  if (!isAdminOrAlbert(chatIdStr) && !isLaundryGroup(chatIdStr)) return;
  sessions[chatId] = { step: 'albert_pickup', items: {} };
  var buttons = [
    [{ text: 'Пераль грязное', callback_data: 'apick_piral' }, { text: 'Сальвадор грязное', callback_data: 'apick_salvador' }],
    [{ text: 'Оба (Пераль + Сальвадор)', callback_data: 'apick_both' }],
    [{ text: '❌ Отмена', callback_data: 'albert_cancel' }]
  ];
  bot.sendMessage(chatId, '🚚 Альберт забрал\n\nОткуда забрал грязное бельё?', { reply_markup: { inline_keyboard: buttons } });
});

// ── ✨ АЛЬБЕРТ ПРИВЁЗ ────────────────────────────────────────────
bot.onText(/✨ Альберт привёз|✨ Привёз чистое/, async function(msg) {
  var chatId = msg.chat.id; var chatIdStr = String(chatId);
  if (!isAdminOrAlbert(chatIdStr) && !isLaundryGroup(chatIdStr)) return;
  // Предзаполняем из баланса Альберта
  // Маппинг ключей базы → ключи формы Альберта
  var BALANCE_TO_ALBERT = {
    'sheets': 'sheet', 'duvet_covers': 'duvet_cover',
    'pillowcases': 'pillowcase', 'large_towels': 'large_towel',
    'small_towels': 'small_towel', 'kitchen_towels': 'kitchen_towel',
    'rugs': 'bath_mat', 'beach_mat': 'bath_mat',
    'mattress_pad': 'mattress_pad',
    // уже правильные ключи
    'sheet_set': 'sheet_set', 'towel_set': 'towel_set',
    'sheet': 'sheet', 'duvet_cover': 'duvet_cover',
    'large_towel': 'large_towel', 'small_towel': 'small_towel',
    'pillowcase': 'pillowcase', 'kitchen_towel': 'kitchen_towel',
    'bath_mat': 'bath_mat', 'stain_small': 'stain_small', 'stain_large': 'stain_large'
  };
  var preItems = {};
  try {
    var balR = await api('get_albert_balance');
    if (balR.data && balR.data.items) {
      Object.keys(balR.data.items).forEach(function(k) {
        var qty = balR.data.items[k];
        if (qty > 0) {
          var mapped = BALANCE_TO_ALBERT[k] || k;
          preItems[mapped] = (preItems[mapped] || 0) + qty;
        }
      });
    }
  } catch(e) { console.error('[albert prefill]', e.message); }
  var hasBalance = Object.keys(preItems).length > 0;
  sessions[chatId] = { step: 'albert_delivery_items', items: preItems };
  var title = '✨ Альберт привёз чистое\n' + (hasBalance ? 'Предзаполнено из остатков — скорректируй если нужно:' : 'Укажи что привёз:');
  var form = buildAlbertLinenForm(preItems, title);
  bot.sendMessage(chatId, form.text, { reply_markup: { inline_keyboard: form.buttons } });
});


// ── МАППИНГ КЛЮЧЕЙ БЕЛЬЯ ─────────────────────────────────────────
var LINEN_KEY_NAMES = {
  'sheet_set':'Комплект постели','towel_set':'Комплект полотенец',
  'sheets':'Простыни','sheet':'Простынь',
  'duvet_covers':'Пододеяльники','duvet_cover':'Пододеяльник',
  'pillowcases':'Наволочки','pillowcase':'Наволочка',
  'large_towels':'Большие полотенца','large_towel':'Большое полотенце',
  'small_towels':'Малые полотенца','small_towel':'Малое полотенце',
  'kitchen_towels':'Кух. полотенца','kitchen_towel':'Кух. полотенце',
  'rugs':'Коврики','bath_mat':'Коврик','beach_mat':'Пляжные коврики',
  'mattress_pad':'Наматрасники','stain_small':'Пятно малое','stain_large':'Пятно сложное'
};
function ruName(key) {
  if (LINEN_KEY_NAMES[key]) return LINEN_KEY_NAMES[key];
  var ai = ALBERT_ITEMS.find(function(i){return i.key===key;});
  return ai ? ai.name : key;
}

// ── 📦 ОСТАТКИ ───────────────────────────────────────────────────
bot.onText(/📦 Остатки/, async function(msg) {
  var chatId = msg.chat.id; var chatIdStr = String(chatId);
  if (!isAdminOrAlbert(chatIdStr) && !isLaundryGroup(chatIdStr)) return;
  try {
    var r = await api('get_albert_balance');
    if (!r.data) return bot.sendMessage(chatId, '📦 Нет данных об остатках', getMenu(chatIdStr));
    var items = r.data.items || {};
    var hasItems = Object.keys(items).some(function(k){ return items[k] > 0; });
    var text = '📦 *Остатки у Альберта:*\n\n';
    if (!hasItems) {
      text += 'Бельё отсутствует или всё уже доставлено.';
    } else {
      Object.keys(items).forEach(function(key) {
        var qty = items[key];
        if (qty > 0) text += '• ' + ruName(key) + ': ' + qty + ' шт\n';
      });
    }
    if (r.data.calculated_cost && r.data.calculated_cost > 0) {
      text += '\n💰 Расчётная стоимость: *' + r.data.calculated_cost.toFixed(2) + ' EUR* (с НДС)';
    }
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch(e) { bot.sendMessage(chatId, 'Ошибка: '+e.message); }
});

// ── 📊 ИСТОРИЯ ───────────────────────────────────────────────────
bot.onText(/📊 История/, async function(msg) {
  var chatId = msg.chat.id; var chatIdStr = String(chatId);
  if (!isAdminOrAlbert(chatIdStr) && !isLaundryGroup(chatIdStr)) return;
  try {
    var r = await api('get_albert_visits', { limit: 15 });
    var visits = (r.data || []);
    if (visits.length === 0) {
      return bot.sendMessage(chatId, '📊 История визитов пуста.\nИспользуй кнопку "🔄 Визит Альберта" для записи.', getMenu(chatIdStr));
    }
    var text = '📊 *Визиты Альберта:*\n\n';
    var buttons = [];
    visits.forEach(function(v, i) {
      var dt = v.visited_at ? new Date(v.visited_at) : new Date(v.created_at);
      var dateStr = fmtDateShort(dt.toISOString()) + ' ' + fmtTime(dt.toISOString());
      var cost = v.delivered_cost ? v.delivered_cost.toFixed(2) + ' EUR' : '—';
      text += '🍍 *' + dateStr + '*\n';
      text += '💰 Постирано: ' + cost + '\n\n';
      buttons.push([{ text: '📋 ' + dateStr + ' — ' + cost, callback_data: 'av_detail_' + v.id.slice(0,8) }]);
    });
    // Итого за период
    var total = visits.reduce(function(sum, v){ return sum + (v.delivered_cost||0); }, 0);
    if (total > 0) text += '\n💰 *Итого: ' + total.toFixed(2) + ' EUR*';
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
  } catch(e) {
    // Fallback to old history
    try {
      var today = new Date();
      var r2 = await api('get_laundry_monthly_summary', { year: today.getFullYear(), month: today.getMonth() + 1 });
      if (!r2.data) return bot.sendMessage(chatId, 'Нет данных');
      var text = '📊 История за 2 месяца:\n\n';
      (r2.data.movements || []).forEach(function(m) {
        var icon = m.type === 'incoming' ? '✨' : '🚚';
        text += icon + ' ' + fmtDateShort(m.date) + ' · ' + (m.type === 'incoming' ? 'Привёз' : 'Забрал');
        if (m.calculated_cost) text += ' · ' + m.calculated_cost.toFixed(2) + '€';
        text += '\n';
      });
      bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    } catch(e2) { bot.sendMessage(chatId, 'Ошибка: '+e2.message); }
  }
});

// ── 💰 ВЗАИМОРАСЧЁТЫ ─────────────────────────────────────────────
bot.onText(/💰 Взаиморасчёты/, async function(msg) {
  var chatId = msg.chat.id; var chatIdStr = String(chatId);
  if (!isAdminOrAlbert(chatIdStr) && !isLaundryGroup(chatIdStr)) return;
  try {
    var today = new Date();
    var r = await api('get_laundry_monthly_summary', { year: today.getFullYear(), month: today.getMonth() + 1 });
    var inv = await api('get_laundry_invoices');
    // Пробуем получить финансовый баланс
    var finBal = null;
    try { var fb = await api('get_financial_balance'); finBal = fb.data; } catch(e) {}
    var text = '💰 *Взаиморасчёты с Альбертом*\n🍍 Piña Colada ↔ 🌿 ERA\n' + today.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) + '\n\n';
    if (finBal) {
      var nomBal = finBal.nominal_balance || 0;
      var factBal = finBal.factual_balance || 0;
      text += '🧾 *Номинальный долг ERA:* ' + (nomBal >= 0 ? '+' : '') + nomBal.toFixed(2) + ' EUR\n';
      text += '   (счета: ' + (finBal.total_invoiced||0).toFixed(2) + ' − оплачено: ' + (finBal.total_paid||0).toFixed(2) + ')\n\n';
      text += '📊 *Фактический долг ERA:* ' + (factBal >= 0 ? '+' : '') + factBal.toFixed(2) + ' EUR\n';
      text += '   (постирано: ' + (finBal.total_factual||0).toFixed(2) + ' − оплачено: ' + (finBal.total_paid||0).toFixed(2) + ')\n\n';
      var diff = nomBal - factBal;
      if (Math.abs(diff) > 1) text += '⚠️ Расхождение: ' + diff.toFixed(2) + ' EUR\n';
      if (nomBal < 0) text += '\n💚 ERA в плюсе — аванс ' + Math.abs(nomBal).toFixed(2) + ' EUR\n';
    } else {
      text += '📊 Наш учёт: *' + ((r.data && r.data.total_cost) ? r.data.total_cost.toFixed(2) : '0.00') + ' EUR*\n';
    }
    var lastInv = inv.data && inv.data[0];
    if (lastInv) {
      text += '🧾 Последний счёт Альберта: *' + lastInv.invoice_amount.toFixed(2) + ' EUR*\n';
      var diff = Math.abs((lastInv.difference || 0));
      if (diff > 5) text += '⚠️ Расхождение: *' + diff.toFixed(2) + ' EUR*\n';
    }
    var buttons = [];
    if (isAdmin(chatIdStr)) {
      buttons.push([{ text: '📤 Загрузить счёт Альберта', callback_data: 'inv_upload' }]);
      buttons.push([{ text: '💳 Отметить оплату', callback_data: 'inv_pay' }]);
    }
    if (isAlbert(chatIdStr)) {
      buttons.push([{ text: '💳 Отметить оплату (только для ERA)', callback_data: 'noop' }]);
      buttons.push([{ text: '📤 Загрузить presupuesto/factura', callback_data: 'inv_albert_upload' }]);
    }
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: buttons.length ? { inline_keyboard: buttons } : undefined });
  } catch(e) { bot.sendMessage(chatId, 'Ошибка: '+e.message); }
});

// ── ❓ ПОМОЩЬ ─────────────────────────────────────────────────────
var HELP_ALBERT = [
  '👋 *Альберт, вот как работать со мной:*',
  '',
  '🚚 *Забрал бельё*',
  'Нажми когда забираешь грязное бельё.',
  'Выбери откуда: Пераль, Сальвадор или оба.',
  '',
  '✨ *Привёз чистое*',
  'Нажми когда привозишь постиранное.',
  'Форма откроется уже заполненная — проверь и скорректируй количество.',
  '',
  '📦 *Остатки*',
  'Сколько вещей у тебя сейчас по нашим данным и расчётная стоимость.',
  '',
  '📊 *История*',
  'Все движения белья за последние 2 месяца — когда забирал, когда привозил.',
  '',
  '💰 *Взаиморасчёты*',
  'Наш расчёт стоимости за период. Здесь можно загрузить presupuesto или счёт.',
  '',
  '❓ *Вопросы*',
  'Просто напиши вопрос своими словами — я отвечу!'
].join('\n');

var HELP_ADMIN = [
  '👋 *Инструкция для администратора*',
  '',
  '📅 *Расписание и запись*',
  'Показывает все выезды гостей на ближайшие 30 дней.',
  'Значки [A] = Airbnb, [H] = Holidu.',
  'Кнопки под каждым слотом:',
  '• 🔄 Заменить — назначить/поменять уборщицу',
  '• 📋 Задание — указать что нужно подготовить (спа, кроватка, кол-во гостей)',
  '• 🗑 Удалить — удалить этот слот',
  '',
  '📋 *Мои смены*',
  'Список предстоящих и выполненных уборок.',
  '',
  '🧺 *Грязное бельё*',
  'Отметить грязное бельё после уборки (по апартаменту).',
  '',
  '🧹 *Начать уборку* / ✅ *Уборка окончена*',
  'Фиксируем начало и конец уборки. После окончания Эммочка получает кнопку ЗП выдана.',
  '',
  '🏊 *Спа*',
  'Список всех будущих броней где заказана спа или детская кроватка.',
  'Можно изменить прямо из списка.',
  '',
  '📋 *Задания*',
  'Все брони у которых есть назначенные задания.',
  '',
  '📅 *Период*',
  'Список всех броней за выбранный период.',
  'Можно ввести текстом: "апрель", "следующая неделя", "с 20.04 по 15.05"',
  'Или выбрать через удобный календарь.',
  '',
  '🚚 *Альберт забрал*',
  'Фиксируем что Альберт забрал грязное бельё. Выбираем откуда.',
  '',
  '✨ *Альберт привёз*',
  'Фиксируем возврат чистого. Форма предзаполнена из его остатков.',
  '',
  '📦 *Остатки*',
  'Сколько белья сейчас у Альберта и его расчётная стоимость.',
  '',
  '📊 *История*',
  'История всех движений с Альбертом за 2 месяца.',
  '',
  '💰 *Взаиморасчёты*',
  'Наш учёт стоимости vs счёт Альберта. Загрузить счёт или отметить оплату.',
  '',
  '❓ *Вопросы*',
  'Просто напиши вопрос — я отвечу!'
].join('\n');

bot.onText(/❓ Помощь|\/help|\/помощь/, function(msg) {
  var chatId = msg.chat.id; var chatIdStr = String(chatId);
  if (isAlbert(chatIdStr)) {
    bot.sendMessage(chatId, HELP_ALBERT, { parse_mode: 'Markdown' }); return;
  }
  if (isAdmin(chatIdStr)) {
    var half = HELP_ADMIN.indexOf('\n🚚 *Альберт забрал*');
    if (half > 0) {
      bot.sendMessage(chatId, HELP_ADMIN.slice(0, half), { parse_mode: 'Markdown' });
      setTimeout(function(){
        bot.sendMessage(chatId, HELP_ADMIN.slice(half), { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
          [{ text: '⚙️ Настройки', callback_data: 'settings_menu' }]
        ]}});
      }, 500);
    } else {
      bot.sendMessage(chatId, HELP_ADMIN, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
        [{ text: '⚙️ Настройки', callback_data: 'settings_menu' }]
      ]}});
    }
    return;
  }
  var text = 'ERA Apartments Bot\n\n📅 Расписание — выезды гостей\n📋 Мои смены — твои уборки\n🧺 Грязное бельё — отчёт по белью\n🧹 Начать уборку — нажми когда пришла\n✅ Уборка окончена — нажми когда закончила\n\nЕсли непонятно — просто напиши вопрос!';
  bot.sendMessage(chatId, text, getMenu(chatIdStr));
});

// ── КНОПКИ ВЗАИМОРАСЧЁТОВ ─────────────────────────────────────────
// inv_upload: загрузить счёт Альберта (сумма + файл)
// inv_pay: отметить оплату (сумма + файл)
// inv_albert_upload: Альберт загружает presupuesto

// ── ФОТО ─────────────────────────────────────────────────────────

// ── ДОКУМЕНТЫ (PDF и другие файлы) ───────────────────────────────
// Извлекаем сумму из PDF через Claude AI

// ── ФОТО ─────────────────────────────────────────────────────────
bot.on('photo', async function(msg) {
  var chatId = msg.chat.id; var chatIdStr = String(chatId);
  var firstName = msg.from.first_name || 'Пользователь';
  var caption = msg.caption || '';
  if (isGroup(msg) && !isLaundryGroup(chatIdStr)) return;

  // Фото в сессиях оплаты/счёта
  if (sessions[chatId] && ['inv_upload_file','inv_pay_file','albert_doc_upload','await_payment_photo'].includes(sessions[chatId].step)) {
    var photoId = msg.photo[msg.photo.length-1].file_id;
    var sess = sessions[chatId];
    try {
      var fileInfo = await bot.getFile(photoId);
      var fileUrl = 'https://api.telegram.org/file/bot' + TOKEN + '/' + fileInfo.file_path;
      if (sess.step === 'inv_upload_file' || sess.step === 'await_payment_photo') {
        // Фото счёта — просим ввести сумму
        sessions[chatId] = { step: 'inv_upload_amount', fileUrl: fileUrl, fileName: 'фото' };
        bot.sendMessage(chatId, 'Фото получено!\nВведи сумму счёта (например: 191.72):', { parse_mode: 'Markdown' });
      } else if (sess.step === 'inv_pay_file') {
        await api('save_albert_payment', { amount: sess.amount, date: new Date().toISOString().split('T')[0], description: caption || 'Оплата Альберту', file_url: fileUrl });
        bot.sendMessage(chatId, '✅ Оплата *' + sess.amount + ' EUR* записана!', { parse_mode: 'Markdown' });
        await notifyAdmins('💸 Оплата Альберту: *' + sess.amount + ' EUR*', { parse_mode: 'Markdown' });
        sessions[chatId] = null;
      } else if (sess.step === 'albert_doc_upload') {
        bot.sendMessage(chatId, '✅ Документ получен! Спасибо.', getMenu(chatIdStr));
        await notifyAdmins('📄 Альберт загрузил документ' + (caption ? ': ' + caption : ''), { parse_mode: 'Markdown' });
        sessions[chatId] = null;
      }
    } catch(e) { bot.sendMessage(chatId, 'Ошибка: ' + e.message, getMenu(chatIdStr)); }
    return;
  }

  if (isLaundryGroup(chatIdStr)) return;
  if (isGroup(msg)) return;

  // Обычное фото — отправляем администраторам
  try {
    var photo = msg.photo[msg.photo.length-1];
    var cap = 'Фото от ' + firstName + (caption ? '\n' + caption : '');
    var admins = getAdmins();
    for (var i = 0; i < admins.length; i++) { try { await bot.sendPhoto(admins[i], photo.file_id, { caption: cap }); } catch(e) {} }
    bot.sendMessage(chatId, 'Фото отправлено!', getMenu(chatIdStr));
  } catch(e) { bot.sendMessage(chatId, 'Ошибка: ' + e.message, getMenu(chatIdStr)); }
});

// ── ДОКУМЕНТЫ (PDF) ───────────────────────────────────────────────
async function parseInvoicePDF(fileUrl) {
  try {
    var resp = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    var base64 = Buffer.from(resp.data).toString('base64');
    var aiResp = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-haiku-4-5-20251001', max_tokens: 400,
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: 'Find in this invoice: the total amount to pay (TOTAL A PAGAR or TOTAL factura), invoice number, billing period. Return ONLY valid JSON: {"amount": 129.61, "invoice_number": "04.03", "period_from": "02/03/2026", "period_to": "19/03/2026"}. If amount not found return {"amount": null}' }
      ]}]
    }, { headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } });
    return JSON.parse(aiResp.data.content[0].text.replace(/```json|```/g,'').trim());
  } catch(e) { console.error('[parseInvoicePDF]', e.message); return { amount: null }; }
}

bot.on('document', async function(msg) {
  var chatId = msg.chat.id; var chatIdStr = String(chatId);
  if (!isAdmin(chatIdStr) && !isAlbert(chatIdStr)) return;
  var doc = msg.document; if (!doc) return;
  var sess = sessions[chatId];
  var relevantSteps = ['inv_upload_file', 'inv_pay_file', 'albert_doc_upload'];
  if (!sess || !relevantSteps.includes(sess.step)) return;
  var caption = msg.caption || '';
  try {
    var fileInfo = await bot.getFile(doc.file_id);
    var fileUrl = 'https://api.telegram.org/file/bot' + TOKEN + '/' + fileInfo.file_path;
    var fileName = doc.file_name || 'документ';

    if (sess.step === 'inv_upload_file') {
      await bot.sendMessage(chatId, '⏳ Анализирую счёт...');
      var parsed = await parseInvoicePDF(fileUrl);
      var invAmount = parsed.amount;
      var invNumber = parsed.invoice_number || ('INV-' + new Date().toISOString().slice(0,10));
      var parseD = function(s) { if (!s) return null; var p = s.split('/'); return p.length===3 ? p[2]+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0') : null; };
      var periodFrom = parseD(parsed.period_from) || new Date(new Date().setDate(1)).toISOString().split('T')[0];
      var periodTo = parseD(parsed.period_to) || new Date().toISOString().split('T')[0];
      if (invAmount) {
        sessions[chatId] = { step: 'inv_confirm', fileUrl: fileUrl, fileName: fileName, amount: invAmount, invNumber: invNumber, periodFrom: periodFrom, periodTo: periodTo };
        var txt = 'Распознано из файла:\n\nСумма к оплате: *' + invAmount + ' EUR*\n';
        if (invNumber) txt += 'Счёт №' + invNumber + '\n';
        txt += 'Период: ' + periodFrom + ' — ' + periodTo + '\n\nВсё верно?';
        bot.sendMessage(chatId, txt, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
          [{ text: '✅ Сохранить', callback_data: 'inv_confirm_save' }, { text: '✏️ Изменить сумму', callback_data: 'inv_confirm_edit' }],
          [{ text: '❌ Отмена', callback_data: 'albert_cancel' }]
        ]}});
      } else {
        sessions[chatId] = { step: 'inv_upload_amount', fileUrl: fileUrl, fileName: fileName };
        bot.sendMessage(chatId, 'Файл получен.\nНе удалось определить сумму автоматически.\nВведи сумму вручную (например: *191.72*):', { parse_mode: 'Markdown' });
      }
    } else if (sess.step === 'inv_pay_file') {
      await api('save_albert_payment', { amount: sess.amount, date: new Date().toISOString().split('T')[0], description: caption || 'Оплата Альберту', file_url: fileUrl });
      bot.sendMessage(chatId, '✅ Оплата *' + sess.amount + ' EUR* записана!\n📄 ' + fileName, { parse_mode: 'Markdown' });
      await notifyAdmins('💸 Оплата Альберту: *' + sess.amount + ' EUR*\n📄 ' + fileName, { parse_mode: 'Markdown' });
      sessions[chatId] = null;
    } else if (sess.step === 'albert_doc_upload') {
      bot.sendMessage(chatId, '✅ Документ получен! Спасибо, Альберт.\n📄 ' + fileName, getMenu(chatIdStr));
      await notifyAdmins('📄 Альберт загрузил документ: *' + fileName + '*' + (caption ? '\n' + caption : ''), { parse_mode: 'Markdown' });
      sessions[chatId] = null;
    }
  } catch(e) { console.error('[document]', e.message); bot.sendMessage(chatId, 'Ошибка: ' + e.message, getMenu(chatIdStr)); }
});

// ── CALLBACK QUERY ────────────────────────────────────────────────

// Богатое уведомление о записи уборщицы
async function notifyCleanerSignup(firstName, aptName, slotData, now) {
  var dateStr = slotData && slotData.checkout_date ? fmtDate(slotData.checkout_date) : '?';
  var checkinStr = slotData && slotData.checkin_date ? fmtDateShort(slotData.checkin_date) : null;
  var guests = slotData && (slotData.next_guests || slotData.guests_count) ? (slotData.next_guests || slotData.guests_count) : null;
  var tasks = slotData && slotData.special_instructions ? fmtInstructions(slotData.special_instructions) : null;
  var nowTime = now || new Date();
  var text = '📝 *' + firstName + '* записалась на уборку\n\n';
  text += '🏠 ' + aptName + '\n';
  if (checkinStr) {
    text += '📅 Заезд: *' + checkinStr + '* · Выезд: *' + dateStr + '*\n';
  } else {
    text += '📅 Выезд: *' + dateStr + '*\n';
  }
  if (guests) text += '👥 Гостей: ' + guests + '\n';
  if (tasks) text += '\n📋 Задания:\n' + tasks + '\n';
  text += '\n🕐 Записалась: ' + fmtTime(nowTime) + ' ' + fmtDate(nowTime.toISOString());
  await notifyAdmins(text, { parse_mode: 'Markdown' });
}

bot.on('callback_query', async function(query) {
  // Пересылаем действия Эммочки владельцу
  if (EMMA_CHAT_ID && String(query.from.id) === String(EMMA_CHAT_ID) && OWNER_CHAT_ID) {
    var emmaAction = query.data || '';
    var emmaTime = new Date().toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    try {
      bot.sendMessage(OWNER_CHAT_ID, '💼 *Эммочка* · ' + emmaTime + '\n`' + emmaAction + '`', { parse_mode: 'Markdown' });
    } catch(e) {}
  }
  var chatId = query.message.chat.id; var chatIdStr = String(chatId);
  var data = query.data; var firstName = query.from.first_name || 'Пользователь';
  bot.answerCallbackQuery(query.id).catch(function(){});
  if (data === 'noop') return;


  // ── ГОЛОСОВЫЕ КОМАНДЫ ──
  if (data === 'vc_confirm') {
    var sess = sessions[chatId];
    if (!sess || sess.step !== 'voice_confirm') {
      bot.sendMessage(chatId, '⚠️ Сессия устарела — повтори голосовую команду.', getMenu(chatIdStr));
      return;
    }
    sessions[chatId] = null;
    await executeVoiceCommand(chatId, chatIdStr, sess.cmd);
    return;
  }
  if (data === 'vc_cancel') {
    sessions[chatId] = null;
    bot.sendMessage(chatId, '❌ Отменено', getMenu(chatIdStr));
    return;
  }
  if (data === 'vc_edit') {
    var sess = sessions[chatId];
    if (!sess || sess.step !== 'voice_confirm') {
      bot.sendMessage(chatId, '⚠️ Сессия устарела — повтори голосовую команду.', getMenu(chatIdStr));
      return;
    }
    sess.step = 'voice_edit';
    bot.sendMessage(chatId, '✏️ Введи команду текстом:');
    return;
  }

  // ── ПИКЕР ДАТ ──
  if (data === 'dp_cancel') { sessions[chatId] = null; bot.sendMessage(chatId, 'Отменено', getMenu(chatIdStr)); return; }
  if (data === 'dp_text_input') {
    sessions[chatId] = { step: 'set_period' };
    try { await bot.editMessageText('Введи период текстом:\n\n20.04-15.05\nапрель май\nследующая неделя\nследующие 2 месяца\nс середины мая по середину июня\nза апрель / этот месяц', { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'dp_cancel' }]] } }); } catch(e) {}
    return;
  }
  if (data === 'dp_open_calendar') {
    var now = new Date();
    var form = buildDatePicker(now.getFullYear(), now.getMonth()+1, 'from', null);
    try { await bot.editMessageText(form.text, { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: form.buttons } }); } catch(e) {}
    return;
  }
  if (data.startsWith('dp_quick_')) {
    var quick = data.slice(9); var now = new Date(); var y = now.getFullYear(); var mo = now.getMonth()+1;
    var dates = null;
    if (quick === 'today') { var d = isoDate(y,mo,now.getDate()); dates = { from:d, to:d, label:'сегодня' }; }
    else if (quick === 'week') { var dow=now.getDay()||7; var mon=new Date(now); mon.setDate(now.getDate()-dow+1); var sun=new Date(mon); sun.setDate(mon.getDate()+6); dates={from:isoDate(mon.getFullYear(),mon.getMonth()+1,mon.getDate()),to:isoDate(sun.getFullYear(),sun.getMonth()+1,sun.getDate()),label:'эта неделя'}; }
    else if (quick === 'month') { dates={from:isoDate(y,mo,1),to:isoDate(y,mo,lastDayOf(y,mo)),label:MONTH_NAMES_RU[mo]}; }
    else if (quick === 'nextmonth') { var nm=mo+1>12?1:mo+1; var ny=mo+1>12?y+1:y; dates={from:isoDate(ny,nm,1),to:isoDate(ny,nm,lastDayOf(ny,nm)),label:MONTH_NAMES_RU[nm]}; }
    else if (quick === '2weeks') { var end=new Date(now); end.setDate(now.getDate()+14); dates={from:isoDate(y,mo,now.getDate()),to:isoDate(end.getFullYear(),end.getMonth()+1,end.getDate()),label:'2 недели'}; }
    else if (quick === '3months') { var end=new Date(y,now.getMonth()+3,now.getDate()); dates={from:isoDate(y,mo,now.getDate()),to:isoDate(end.getFullYear(),end.getMonth()+1,end.getDate()),label:'3 месяца'}; }
    else if (quick === 'prevweek') { var dow=now.getDay()||7; var mon=new Date(now); mon.setDate(now.getDate()-dow-6); var sun=new Date(mon); sun.setDate(mon.getDate()+6); dates={from:isoDate(mon.getFullYear(),mon.getMonth()+1,mon.getDate()),to:isoDate(sun.getFullYear(),sun.getMonth()+1,sun.getDate()),label:'прошлая неделя'}; }
    else if (quick === 'nextweek') { var dow2=now.getDay()||7; var mon2=new Date(now); mon2.setDate(now.getDate()-dow2+8); var sun2=new Date(mon2); sun2.setDate(mon2.getDate()+6); dates={from:isoDate(mon2.getFullYear(),mon2.getMonth()+1,mon2.getDate()),to:isoDate(sun2.getFullYear(),sun2.getMonth()+1,sun2.getDate()),label:'следующая неделя'}; }
    else if (quick === 'prevmonth') { var pm2=mo-1<1?12:mo-1; var pmy2=mo-1<1?y-1:y; dates={from:isoDate(pmy2,pm2,1),to:isoDate(pmy2,pm2,lastDayOf(pmy2,pm2)),label:MONTH_NAMES_RU[pm2]}; }
    else if (quick === 'quarter') { var qStart=Math.floor((mo-1)/3)*3+1; var qEnd=qStart+2>12?12:qStart+2; dates={from:isoDate(y,qStart,1),to:isoDate(y,qEnd,lastDayOf(y,qEnd)),label:'квартал '+Math.ceil(mo/3)}; }
    if (dates) { try { await bot.editMessageText('📅 Загружаю...', { chat_id: chatId, message_id: query.message.message_id }); } catch(e) {} await showPeriodBookingsDates(chatId, chatIdStr, dates.from, dates.to, dates.label); }
    return;
  }
  if (data.startsWith('dp_nav_')) {
    var parts = data.slice(7).split('_'); var py=parseInt(parts[0]),pm=parseInt(parts[1]),pmode=parts[2]; var psel=parts.length>3?parts.slice(3).join('_'):null;
    var form = buildDatePicker(py,pm,pmode,psel);
    try { await bot.editMessageText(form.text, { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: form.buttons } }); } catch(e) {}
    return;
  }
  if (data.startsWith('dp_pick_')) {
    var rest=data.slice(8); var datePart=rest.slice(0,10); var remainder=rest.slice(11);
    var underIdx=remainder.indexOf('_'); var pmode=underIdx===-1?remainder:remainder.slice(0,underIdx); var psel=underIdx===-1?null:remainder.slice(underIdx+1);
    if (pmode==='from') {
      var d=new Date(datePart+'T00:00:00'); var form=buildDatePicker(d.getFullYear(),d.getMonth()+1,'to',datePart);
      try { await bot.editMessageText(form.text, { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: form.buttons } }); } catch(e) {}
    } else {
      var fromDate=psel; var toDate=datePart; if (fromDate>toDate) { var tmp=fromDate; fromDate=toDate; toDate=tmp; }
      try { await bot.editMessageText('📅 Загружаю...', { chat_id: chatId, message_id: query.message.message_id }); } catch(e) {}
      var fmtS=function(s){return s.slice(8)+'.'+s.slice(5,7);}; await showPeriodBookingsDates(chatId,chatIdStr,fromDate,toDate,fmtS(fromDate)+' — '+fmtS(toDate));
    }
    return;
  }

  // ── ГРАНДЕ ──
  if (data.startsWith('gc_')) { var slotId=data.slice(3); bot.sendMessage(chatId,'Гранде — выбери какую часть:',{reply_markup:{inline_keyboard:[[{text:'🏠 Оазис 1',callback_data:'sgr1_'+slotId},{text:'🏠 Оазис 2',callback_data:'sgr2_'+slotId}],[{text:'❌ Отмена',callback_data:'noop'}]]}}); return; }
  if (data.startsWith('sgr1_')) { var slotId=data.slice(5); try{var r=await api('assign_cleaner',{slot_id:slotId,cleaner_name:firstName,cleaner_telegram_id:chatIdStr,sub_apartment:'piral_1'});if(r.error)bot.sendMessage(chatId,'⚠️ '+r.error,getMenu(chatIdStr));else{bot.sendMessage(chatId,'✅ Записана!\nГранде / Оазис 1',getMenu(chatIdStr));var cachedSlot=scheduleCache.find(function(s){return String(s.id)===String(slotId);});await notifyCleanerSignup(firstName, 'Гранде / Оазис 1', Object.assign({},cachedSlot||{},r.data||{}), new Date());}}catch(e){bot.sendMessage(chatId,'❌ '+e.message,getMenu(chatIdStr));} return; }
  if (data.startsWith('sgr2_')) { var slotId=data.slice(5); try{var r=await api('assign_cleaner',{slot_id:slotId,cleaner_name:firstName,cleaner_telegram_id:chatIdStr,sub_apartment:'piral_2'});if(r.error)bot.sendMessage(chatId,'⚠️ '+r.error,getMenu(chatIdStr));else{bot.sendMessage(chatId,'✅ Записана!\nГранде / Оазис 2',getMenu(chatIdStr));var cachedSlot=scheduleCache.find(function(s){return String(s.id)===String(slotId);});await notifyCleanerSignup(firstName, 'Гранде / Оазис 2', Object.assign({},cachedSlot||{},r.data||{}), new Date());}}catch(e){bot.sendMessage(chatId,'❌ '+e.message,getMenu(chatIdStr));} return; }
  if (data.startsWith('su_')) {
    var slotId = data.slice(3);
    var inGroup = query.message && (query.message.chat.type === 'group' || query.message.chat.type === 'supergroup');
    try {
      var r = await api('assign_cleaner', { slot_id: slotId, cleaner_name: firstName, cleaner_telegram_id: chatIdStr });
      if (r.error) {
        bot.sendMessage(chatId, '⚠️ ' + r.error, inGroup ? {} : getMenu(chatIdStr));
      } else {
        var aptName = r.data ? (APT_NAMES[r.data.apartment]||r.data.apartment) : '?';
        var cleanDate = r.data ? fmtDateShort(r.data.cleaning_date) : '';
        if (inGroup) {
          bot.sendMessage(query.message.chat.id,
            '✅ *' + firstName + '* записалась на ' + aptName + ' · ' + cleanDate + '!',
            { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[
              { text: '📋 Посмотреть мои смены в личном кабинете', url: 'https://t.me/ERAGROUPlinen_bot?start=myshifts' }
            ]]}});
        } else {
          bot.sendMessage(chatId, '✅ Записана!\n' + aptName + ' · ' + cleanDate, getMenu(chatIdStr));
        }
        var cachedSlot = scheduleCache.find(function(s){ return String(s.id) === String(slotId); });
        await notifyCleanerSignup(firstName, aptName, Object.assign({}, cachedSlot || {}, r.data || {}), new Date());
      }
    } catch(e) { bot.sendMessage(chatId, '❌ ' + e.message, inGroup ? {} : getMenu(chatIdStr)); }
    return;
  }

  // ── ЗАМЕНИТЬ УБОРЩИЦУ ──
  if (data.startsWith('rep_')) {
    if (!isAdmin(chatIdStr)) return;
    var slotId = data.slice(4);
    sessions[chatId] = { step: 'replace_cleaner_manual', slotId: slotId };
    // Находим слот в кэше для отображения информации
    var repSlot = scheduleCache.find(function(s){ return s.id === slotId; });
    var repLabel = repSlot
      ? '🏠 ' + (APT_NAMES[repSlot.apartment]||repSlot.apartment) + ' · 📅 ' + fmtDateShort(repSlot.checkout_date) + (repSlot.cleaner_name ? ' · 🧹 ' + repSlot.cleaner_name : ' · свободно')
      : 'смена';
    var manualMsg = await bot.sendMessage(chatId, '🔄 *Замена уборщицы*\n' + repLabel + '\n\nЗагружаю список...', { parse_mode: 'Markdown' });
    try {
      var r = await api('get_cleaners');
      var cleaners = (r.data || []).filter(function(c){ return c.name; });
      if (cleaners.length > 0) {
        sessions[chatId].cleaners = cleaners;
        var buttons = cleaners.map(function(c, i) {
          return [{ text: c.name, callback_data: 'sc_'+slotId+'_'+i }];
        });
        buttons.push([{ text: '✏️ Другое имя', callback_data: 'rm_'+slotId }, { text: '❌ Отмена', callback_data: 'rcancel' }]);
        try { await bot.editMessageText('🔄 *Замена уборщицы*\n' + repLabel + '\n\nВыбери новую уборщицу:', { chat_id: chatId, message_id: manualMsg.message_id, parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } }); } catch(e) {
          bot.sendMessage(chatId, '🔄 *Замена уборщицы*\n' + repLabel + '\n\nВыбери новую уборщицу:', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
        }
      } else {
        try { await bot.editMessageText('🔄 *Замена уборщицы*\n' + repLabel + '\n\nВведи имя вручную:', { chat_id: chatId, message_id: manualMsg.message_id, parse_mode: 'Markdown' }); } catch(e) {}
      }
    } catch(e) { console.error('[get_cleaners]', e.message); }
    return;
  }
  if (data.startsWith('sc_')) {
    if (!isAdmin(chatIdStr)) return;
    var parts = data.slice(3).split('_');
    var slotId = parts[0];
    var idx = parseInt(parts[1]);
    // Берём уборщицу из сессии по индексу
    var cleaner = sessions[chatId] && sessions[chatId].cleaners && sessions[chatId].cleaners[idx];
    var name = cleaner ? cleaner.name : parts[1] || '';
    var tgId = cleaner ? (cleaner.telegram_id || '') : '';
    try {
      await api('replace_cleaner', { slot_id: slotId, new_cleaner_name: name, cleaner_name: name, cleaner_telegram_id: tgId });
      bot.sendMessage(chatId, '✅ Назначена: ' + name, getMenu(chatIdStr));
      sessions[chatId] = null;
    } catch(e) { bot.sendMessage(chatId, 'Ошибка: ' + e.message, getMenu(chatIdStr)); }
    return;
  }
  if (data.startsWith('rm_')) { if(!isAdmin(chatIdStr))return; sessions[chatId]={step:'replace_cleaner_manual',slotId:data.slice(3)}; bot.sendMessage(chatId,'Введи имя уборщицы:'); return; }
  if (data==='rcancel') { sessions[chatId]=null; bot.sendMessage(chatId,'Отменено',getMenu(chatIdStr)); return; }

  // ── ЗАДАНИЕ — форма ──
  if (data.startsWith('nt_')) {
    if (!isAdmin(chatIdStr)) return; var slotId=data.slice(3);
    var cached=scheduleCache.find(function(s){return s.id===slotId;});
    var tasks=initTasksFromSlot(cached||{});
    sessions[chatId]={step:'task_form',slotId:slotId,slotLabel:(cached?(APT_NAMES[cached.apartment]||cached.apartment):'?')+' · '+(cached?fmtDateShort(cached.checkout_date):'?'),tasks:tasks};
    var form=buildTaskForm(sessions[chatId]); bot.sendMessage(chatId,form.text,{reply_markup:{inline_keyboard:form.buttons}}); return;
  }
  if (data.startsWith('nb_assign_')) {
    if (!isAdmin(chatIdStr)) return;
    var bookingId = data.slice(10);
    var existingTasks = loadTaskTypes().map(function(tt){ return {key:tt.key,name:tt.name,type:tt.type,enabled:false,value:tt.type==='number'?1:undefined}; });
    var slotLabel = 'Бронь';
    try {
      // Используем get_booking_by_id для получения данных брони по ID
      var br = await api('get_booking_by_id', { booking_id: bookingId });
      if (!br.data) br = await api('get_next_booking_for_apt', { booking_id: bookingId });
      if (br.data) {
        var bd = br.data;
        slotLabel = (APT_NAMES[bd.apartment]||bd.apartment) + ' · ' + fmtDateShort(bd.checkin_date) + '→' + fmtDateShort(bd.checkout_date);
        // Предзаполняем из существующих tasks
        if (bd.tasks) {
          try {
            var saved = typeof bd.tasks === 'string' ? JSON.parse(bd.tasks) : bd.tasks;
            if (Array.isArray(saved) && saved.length > 0) {
              existingTasks = existingTasks.map(function(tt) {
                var s = saved.find(function(x){ return x.key === tt.key; });
                if (s && s.enabled) { tt.enabled = true; if (s.value !== undefined) tt.value = s.value; }
                return tt;
              });
            }
          } catch(e) {}
        }
        // Предзаполняем гостей из next_guests или guests_count
        var gTask = existingTasks.find(function(t){ return t.key === 'guests'; });
        if (gTask && (bd.next_guests || bd.guests_count)) {
          gTask.enabled = true;
          gTask.value = parseInt(bd.next_guests || bd.guests_count) || 1;
        }
        // Сохраняем gap_days для дальнейшего использования
        sessions[chatId] = sessions[chatId] || {};
        sessions[chatId].gap_days = bd.gap_days || 0;
      }
    } catch(e) { console.error('[nb_assign]', e.message); }
    sessions[chatId] = Object.assign(sessions[chatId]||{}, { step: 'task_form', bookingId: bookingId, slotLabel: slotLabel, tasks: existingTasks });
    var form = buildTaskForm(sessions[chatId]);
    bot.sendMessage(chatId, form.text, { reply_markup: { inline_keyboard: form.buttons } });
    return;
  }
  if (data.startsWith('tg_')) { if(!sessions[chatId]||sessions[chatId].step!=='task_form')return; var idx=parseInt(data.slice(3)); var task=sessions[chatId].tasks[idx]; if(!task)return; task.enabled=!task.enabled; if(task.enabled&&task.type==='number'&&!task.value)task.value=1; var form=buildTaskForm(sessions[chatId]); try{await bot.editMessageText(form.text,{chat_id:chatId,message_id:query.message.message_id,reply_markup:{inline_keyboard:form.buttons}});}catch(e){} return; }
  if (data.startsWith('ti_')||data.startsWith('td_')) { if(!sessions[chatId]||sessions[chatId].step!=='task_form')return; var isPlus=data.startsWith('ti_'); var idx=parseInt(data.slice(3)); var task=sessions[chatId].tasks[idx]; if(!task)return; task.value=Math.max(1,Math.min(20,(task.value||1)+(isPlus?1:-1))); var form=buildTaskForm(sessions[chatId]); try{await bot.editMessageText(form.text,{chat_id:chatId,message_id:query.message.message_id,reply_markup:{inline_keyboard:form.buttons}});}catch(e){} return; }
  if (data==='tsave') {
    if(!isAdmin(chatIdStr)||!sessions[chatId]||sessions[chatId].step!=='task_form')return;
    var sess=sessions[chatId]; var jsonVal=tasksToJson(sess.tasks); var textVal=tasksToText(sess.tasks);
    try {
      if(sess.slotId){
        // Извлекаем next_guests из задания если есть
        var updateData = { slot_id: sess.slotId, special_instructions: jsonVal||'' };
        var guestsTask = sess.tasks.find(function(t){return t.key==='guests' && t.enabled;});
        if(guestsTask && guestsTask.value) updateData.next_guests = guestsTask.value;
        await api('update_slot', updateData);
        var cached=scheduleCache.find(function(s){return s.id===sess.slotId;});
        if(cached){
          cached.special_instructions=jsonVal;
          if(guestsTask && guestsTask.value) cached.next_guests=guestsTask.value;
        }
      }
      else if(sess.bookingId){
        var fullTasks = JSON.parse(tasksToFullJson(sess.tasks)||'[]');
        var gTask2 = sess.tasks.find(function(t){return t.key==='guests'&&t.enabled;});
        await api('assign_booking_tasks',{
          booking_id:sess.bookingId,
          tasks:fullTasks,
          gap_days:sess.gap_days||0,
          next_guests: gTask2 ? gTask2.value : undefined
        });
      }
      bot.sendMessage(chatId,textVal?'✅ Задание сохранено!\n\n'+fmtInstructions(jsonVal):'✅ Задание очищено.',getMenu(chatIdStr));
    } catch(e){bot.sendMessage(chatId,'Ошибка: '+e.message,getMenu(chatIdStr));}
    sessions[chatId]=null; return;
  }
  if (data==='tcancel'){sessions[chatId]=null;bot.sendMessage(chatId,'Отменено',getMenu(chatIdStr));return;}
  if (data==='tset'){if(!isAdmin(chatIdStr))return;var taskTypes=loadTaskTypes();var form=buildSettingsForm(taskTypes);try{await bot.editMessageText(form.text,{chat_id:chatId,message_id:query.message.message_id,reply_markup:{inline_keyboard:form.buttons}});}catch(e){bot.sendMessage(chatId,form.text,{reply_markup:{inline_keyboard:form.buttons}});}if(sessions[chatId])sessions[chatId].step='task_settings';return;}
  if (data.startsWith('sdel_')){if(!isAdmin(chatIdStr))return;var idx=parseInt(data.slice(5));var tt=loadTaskTypes();if(idx>=0&&idx<tt.length){tt.splice(idx,1);saveTaskTypes(tt);}var form=buildSettingsForm(tt);try{await bot.editMessageText(form.text,{chat_id:chatId,message_id:query.message.message_id,reply_markup:{inline_keyboard:form.buttons}});}catch(e){}return;}
  if (data==='sadd'){if(!isAdmin(chatIdStr))return;if(sessions[chatId])sessions[chatId].step='task_add';bot.sendMessage(chatId,'Введи название задания.\nДля числового добавь (число) в конце.\nПример: Гостей (число)');return;}
  if (data==='sback'){if(!sessions[chatId]||!sessions[chatId].slotId){sessions[chatId]=null;bot.sendMessage(chatId,'Главное меню',getMenu(chatIdStr));return;}sessions[chatId].step='task_form';var form=buildTaskForm(sessions[chatId]);try{await bot.editMessageText(form.text,{chat_id:chatId,message_id:query.message.message_id,reply_markup:{inline_keyboard:form.buttons}});}catch(e){bot.sendMessage(chatId,form.text,{reply_markup:{inline_keyboard:form.buttons}});}return;}

  // ── КОММЕНТАРИЙ К БРОНИ ──
  if (data.startsWith('bk_comment_')){if(!isAdmin(chatIdStr))return;sessions[chatId]={step:'bk_comment',bookingId:data.slice(11)};bot.sendMessage(chatId,'Введи комментарий для этой брони:\n(или напиши "удалить")');return;}

  // ── УДАЛИТЬ СЛОТ ──
  if (data.startsWith('del_')){if(!isAdmin(chatIdStr))return;try{await api('delete_slot',{slot_id:data.slice(4)});bot.sendMessage(chatId,'🗑 Смена удалена.');}catch(e){bot.sendMessage(chatId,'Ошибка: '+e.message);}return;}

  // ── НАЧАТЬ УБОРКУ ──
  if (data.startsWith('st_')) {
    var assignId=data.slice(3);
    try {
      var r=await api('start_cleaning',{assignment_id:assignId});
      var apt=r.data?(APT_NAMES[r.data.apartment]||r.data.apartment):'?';
      var notes=r.data?r.data.special_instructions:null;
      var nextBooking=null;
      try{var nb=await api('get_cleaning_tasks_for_slot',{slot_id:assignId});nextBooking=nb.data;}catch(e){}
      var startMsg='🧹 Уборка начата!\n'+apt+'\n\nУдачи!';
      if(notes)startMsg+='\n\n📋 Не забываем:\n'+fmtInstructions(notes);
      if(nextBooking&&nextBooking.gap_days<=2&&nextBooking.tasks){var arr=typeof nextBooking.tasks==='string'?JSON.parse(nextBooking.tasks):nextBooking.tasks;var et=Array.isArray(arr)?arr.filter(function(t){return t.enabled;}).map(function(t){return t.type==='number'?t.name+': '+t.value:t.name;}).join('\n'):'';if(et)startMsg+='\n\n🏠 Для следующих гостей ('+fmtDateShort(nextBooking.checkin_date)+'):\n'+et;}
      bot.sendMessage(chatId,startMsg,getMenu(chatIdStr));
      await notifyIrina('🧹 '+firstName+' начала уборку\n'+apt);
    } catch(e){bot.sendMessage(chatId,'Ошибка: '+e.message,getMenu(chatIdStr));}
    return;
  }

  // ── ЗАВЕРШИТЬ УБОРКУ ──
  if (data.startsWith('fn_')) {
    var assignId=data.slice(3);
    try {
      var r=await api('finish_cleaning',{assignment_id:assignId});
      var apt=r.data?(APT_NAMES[r.data.apartment]||r.data.apartment):'?';
      var fee=r.data?(r.data.payment_amount||CLEANING_FEE[r.data.apartment]||35):35;
      var cleaningDate=r.data?fmtDate(r.data.cleaning_date):'?';
      var notes=r.data?r.data.special_instructions:null;
      var nextBooking=null;
      try{var nb=await api('get_cleaning_tasks_for_slot',{slot_id:assignId});nextBooking=nb.data;}catch(e){}
      var finishMsg='✅ Уборка завершена!\n'+apt+'\n\nСпасибо! Эммочка скоро выдаст '+fee+'EUR.';
      if(notes)finishMsg+='\n\n🔍 Проверь:\n'+fmtInstructions(notes);
      if(nextBooking&&nextBooking.gap_days<=2&&nextBooking.tasks){var arr=typeof nextBooking.tasks==='string'?JSON.parse(nextBooking.tasks):nextBooking.tasks;var et=Array.isArray(arr)?arr.filter(function(t){return t.enabled;}).map(function(t,i){return(i+1)+'. '+(t.type==='number'?t.name+': '+t.value:t.name);}).join('\n'):'';if(et)finishMsg+='\n\n✅ Проверь для следующих гостей:\n'+et;}
      // Проверяем было ли отмечено бельё в эту смену
      var linenReported = linenPendingNotify[chatId] || sessions[chatId] && sessions[chatId].linenDoneApt;
      if (!linenReported) {
        // Бельё не отмечено — предлагаем заполнить
        if (r.data && r.data.apartment) {
          var cleanApt = r.data.apartment;
          finishMsg += '\n\n🧺 *Не забудь отметить грязное бельё!*';
          bot.sendMessage(chatId, finishMsg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
            [{ text: '🧺 Отметить грязное бельё', callback_data: 'la_' + cleanApt }],
            [{ text: '✅ Бельё уже отмечено', callback_data: 'linen_already_done' }]
          ]}, ...getMenu(chatIdStr) });
        } else {
          bot.sendMessage(chatId, finishMsg, getMenu(chatIdStr));
        }
      } else {
        bot.sendMessage(chatId, finishMsg, getMenu(chatIdStr));
      }
      var adminText='✅ '+firstName+' завершила уборку\n'+apt+' · '+cleaningDate+'\nК выплате: '+fee+'EUR';
      if(OWNER_CHAT_ID){try{await bot.sendMessage(OWNER_CHAT_ID,adminText);}catch(e){}}
      if(IRINA_CHAT_ID){try{await bot.sendMessage(IRINA_CHAT_ID,adminText);}catch(e){}}
      if(EMMA_CHAT_ID){try{await bot.sendMessage(EMMA_CHAT_ID,'💰 '+firstName+' завершила уборку\n'+apt+' · '+cleaningDate+'\nСумма: *'+fee+' EUR*',{parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'✅ ЗП выдана — '+fee+'EUR',callback_data:'pay_'+assignId+'_'+fee}]]}});}catch(e){}}
    } catch(e){bot.sendMessage(chatId,'Ошибка: '+e.message,getMenu(chatIdStr));}
    return;
  }

  // ── ЗП ──
  if (data.startsWith('pay_')) {
    if(chatIdStr!==EMMA_CHAT_ID)return;
    var parts=data.slice(4).split('_'); var assignId=parts[0]; var fee=parseFloat(parts[1])||35;
    try {
      var r=await api('confirm_payment',{assignment_id:assignId,amount:fee});
      var apt=r.data?(APT_NAMES[r.data.apartment]||r.data.apartment):'?'; var cleanerName=r.data?(r.data.cleaner_name||'Уборщица'):'Уборщица'; var cleaningDate=r.data?fmtDate(r.data.cleaning_date):'?'; var now=new Date();
      try{await api('create_expense',{amount:fee,description:'Оплата клининга: Уборка '+apt+' · '+cleaningDate,contractor:cleanerName,apartment:apt,cleaning_date:r.data?r.data.cleaning_date:null,created_at:now.toISOString()});}catch(expErr){}
      try{await bot.editMessageText('✅ ЗП выдана!\n'+cleanerName+' · '+apt+' · '+cleaningDate+'\n'+fee+' EUR · '+fmtTime(now),{chat_id:chatId,message_id:query.message.message_id});}catch(e){}
      var paidText='💸 ЗП выдана\n'+cleanerName+' · '+apt+' · '+cleaningDate+'\n'+fee+' EUR';
      if(IRINA_CHAT_ID){try{await bot.sendMessage(IRINA_CHAT_ID,paidText);}catch(e){}}
      if(OWNER_CHAT_ID){try{await bot.sendMessage(OWNER_CHAT_ID,paidText+'\nРасход создан ✅');}catch(e){}}
    } catch(e){bot.sendMessage(chatId,'Ошибка: '+e.message);}
    return;
  }

  // ── ЭММОЧКА ПОДТВЕРДИЛА ПОДГОТОВКУ ──
  if (data.startsWith('emma_done_')) {
    try{await api('emma_confirmed_preparation',{booking_id:data.slice(10),confirmed_tasks:{},removed_items:{}});bot.sendMessage(chatId,'✅ Апарт подготовлен!',getMenu(chatIdStr));await notifyAdmins('✅ Эммочка подготовила апарт к следующему заезду',{parse_mode:'Markdown'});}catch(e){bot.sendMessage(chatId,'Ошибка: '+e.message);}
    return;
  }


  // ── ВИЗИТ АЛЬБЕРТА — выбор локации ──────────────────────────────
  if (data.startsWith('av_loc_')) {
    var loc = data.slice(7); // piral / salvador / both
    var locs = loc === 'both' ? ['dirty_linen_piral','dirty_linen_salvador'] :
               loc === 'piral' ? ['dirty_linen_piral'] : ['dirty_linen_salvador'];
    sessions[chatId] = Object.assign(sessions[chatId]||{}, {
      step: 'albert_visit_brought',
      visit: { from_locations: locs, loc_label: loc==='both'?'Пераль+Сальвадор':loc==='piral'?'Пераль':'Сальвадор' }
    });
    // Предзаполняем "привёз" из остатков у Альберта
    bot.sendMessage(chatId, '⏳ Загружаю остатки...');
    try {
      var balR = await api('get_albert_balance');
      var preItems = {};
      if (balR.data && balR.data.items) {
        Object.keys(balR.data.items).forEach(function(k) {
          var mapped = BALANCE_TO_ALBERT[k] || k;
          var qty = balR.data.items[k];
          if (qty > 0) preItems[mapped] = (preItems[mapped]||0) + qty;
        });
      }
      sessions[chatId].visit.balance_before = balR.data && balR.data.items || {};
      sessions[chatId].visit.brought_items = preItems;
      var hasItems = Object.values(preItems).some(function(v){return v>0;});
      var title = hasItems
        ? '✨ *Шаг 1: Что ПРИВЁЗ постиранного?*\n🍍→🌿 Предзаполнено из остатков у Альберта\nСкорректируй если нужно:'
        : '✨ *Шаг 1: Что ПРИВЁЗ постиранного?*\nУкажи количество:';
      var form = buildAlbertLinenForm(preItems, title);
      bot.sendMessage(chatId, form.text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: form.buttons.map(function(row){
        return row.map(function(btn){
          if(btn.callback_data && btn.callback_data.startsWith('alp_')) return Object.assign({},btn,{callback_data:'avp_'+btn.callback_data.slice(4)});
          if(btn.callback_data && btn.callback_data.startsWith('alm_')) return Object.assign({},btn,{callback_data:'avm_'+btn.callback_data.slice(4)});
          if(btn.callback_data === 'albert_confirm') return Object.assign({},btn,{callback_data:'av_confirm_brought'});
          return btn;
        });
      })} });
    } catch(e) {
      sessions[chatId].visit.brought_items = {};
      var form = buildAlbertLinenForm({}, '✨ *Шаг 1: Что ПРИВЁЗ постиранного?*');
      bot.sendMessage(chatId, form.text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: form.buttons.map(function(row){
        return row.map(function(btn){
          if(btn.callback_data === 'albert_confirm') return Object.assign({},btn,{callback_data:'av_confirm_brought'});
          return btn;
        });
      })} });
    }
    return;
  }

  // ── ВИЗИТ: ➕/➖ для "привёз" ──
  if (data.startsWith('avp_')||data.startsWith('avm_')) {
    var isPlus = data.startsWith('avp_'); var key = data.slice(4);
    if (!sessions[chatId]) sessions[chatId] = { visit: { brought_items: {} } };
    if (!sessions[chatId].visit) sessions[chatId].visit = { brought_items: {} };
    if (!sessions[chatId].visit.brought_items) sessions[chatId].visit.brought_items = {};
    sessions[chatId].visit.brought_items[key] = Math.max(0, (sessions[chatId].visit.brought_items[key]||0) + (isPlus?1:-1));
    var form = buildAlbertLinenForm(sessions[chatId].visit.brought_items, '✨ Что ПРИВЁЗ постиранного:');
    try { await bot.editMessageText(form.text, { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: form.buttons.map(function(row){
      return row.map(function(btn){
        if(btn.callback_data && btn.callback_data.startsWith('alp_')) return Object.assign({},btn,{callback_data:'avp_'+btn.callback_data.slice(4)});
        if(btn.callback_data && btn.callback_data.startsWith('alm_')) return Object.assign({},btn,{callback_data:'avm_'+btn.callback_data.slice(4)});
        if(btn.callback_data === 'albert_confirm') return Object.assign({},btn,{callback_data:'av_confirm_brought'});
        return btn;
      });
    })}}); } catch(e) {}
    return;
  }

  // ── ВИЗИТ: подтвердил "привёз" → переходим к "забрал" ──
  if (data === 'av_confirm_brought') {
    var sess = sessions[chatId];
    if (!sess || !sess.visit) return;
    // Теперь показываем форму "забрал" предзаполненную из грязного
    bot.sendMessage(chatId, '⏳ Загружаю грязное бельё...');
    try {
      var dirtyR = await api('get_albert_dirty_stock', { locations: sess.visit.from_locations });
      var dirtyItems = {};
      if (dirtyR.data && dirtyR.data.items) {
        Object.keys(dirtyR.data.items).forEach(function(k) {
          var mapped = BALANCE_TO_ALBERT[k] || k;
          var qty = dirtyR.data.items[k];
          if (qty > 0) dirtyItems[mapped] = (dirtyItems[mapped]||0) + qty;
        });
      }
      sess.visit.dirty_stock_before = dirtyR.data && dirtyR.data.items || {};
      sess.visit.took_items = dirtyItems;
      sess.step = 'albert_visit_took';
      var hasItems = Object.values(dirtyItems).some(function(v){return v>0;});
      var title = hasItems
        ? '🚚 *Шаг 2: Что ЗАБИРАЕТ грязного?*\n🌿→🍍 Предзаполнено из грязного белья\nСкорректируй если нужно:'
        : '🚚 *Шаг 2: Что ЗАБИРАЕТ грязного?*\nУкажи количество:';
      var form = buildAlbertLinenForm(dirtyItems, title);
      bot.sendMessage(chatId, form.text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: form.buttons.map(function(row){
        return row.map(function(btn){
          if(btn.callback_data && btn.callback_data.startsWith('alp_')) return Object.assign({},btn,{callback_data:'avt_p_'+btn.callback_data.slice(4)});
          if(btn.callback_data && btn.callback_data.startsWith('alm_')) return Object.assign({},btn,{callback_data:'avt_m_'+btn.callback_data.slice(4)});
          if(btn.callback_data === 'albert_confirm') return Object.assign({},btn,{callback_data:'av_confirm_took'});
          return btn;
        });
      })} });
    } catch(e) {
      sess.visit.took_items = {};
      sess.step = 'albert_visit_took';
      var form = buildAlbertLinenForm({}, '🚚 *Шаг 2: Что ЗАБИРАЕТ грязного?*');
      bot.sendMessage(chatId, form.text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: form.buttons.map(function(row){
        return row.map(function(btn){
          if(btn.callback_data === 'albert_confirm') return Object.assign({},btn,{callback_data:'av_confirm_took'});
          return btn;
        });
      })} });
    }
    return;
  }

  // ── ВИЗИТ: ➕/➖ для "забрал" ──
  if (data.startsWith('avt_p_')||data.startsWith('avt_m_')) {
    var isPlus = data.startsWith('avt_p_'); var key = data.slice(6);
    if (!sessions[chatId] || !sessions[chatId].visit) return;
    if (!sessions[chatId].visit.took_items) sessions[chatId].visit.took_items = {};
    sessions[chatId].visit.took_items[key] = Math.max(0, (sessions[chatId].visit.took_items[key]||0) + (isPlus?1:-1));
    var form = buildAlbertLinenForm(sessions[chatId].visit.took_items, '🚚 Что ЗАБИРАЕТ грязного:');
    try { await bot.editMessageText(form.text, { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: form.buttons.map(function(row){
      return row.map(function(btn){
        if(btn.callback_data && btn.callback_data.startsWith('alp_')) return Object.assign({},btn,{callback_data:'avt_p_'+btn.callback_data.slice(4)});
        if(btn.callback_data && btn.callback_data.startsWith('alm_')) return Object.assign({},btn,{callback_data:'avt_m_'+btn.callback_data.slice(4)});
        if(btn.callback_data === 'albert_confirm') return Object.assign({},btn,{callback_data:'av_confirm_took'});
        return btn;
      });
    })}}); } catch(e) {}
    return;
  }

  // ── ВИЗИТ: подтвердил "забрал" → сохраняем и отправляем итог ──
  if (data === 'av_confirm_took') {
    var sess = sessions[chatId];
    if (!sess || !sess.visit) return;
    var visit = sess.visit;
    var now = new Date();
    var dateTimeStr = fmtDate(now.toISOString()) + ' · ' + fmtTime(now);
    try {
      // Сохраняем визит
      var r = await api('save_albert_visit', {
        brought_items: visit.brought_items || {},
        took_items: visit.took_items || {},
        from_locations: visit.from_locations || [],
        dirty_stock_before: visit.dirty_stock_before || {},
        balance_before: visit.balance_before || {}
      });
      var broughtCost = r.data && r.data.brought_cost || 0;
      var balanceAfter = r.data && r.data.balance_after || {};
      var dirtyRemainder = r.data && r.data.dirty_remainder || {};
      var broughtRemainder = r.data && r.data.brought_remainder || {};

      // Формируем итоговое сообщение
      var msg = '\U0001f504 *\u0412\u0438\u0437\u0438\u0442 \u0410\u043b\u044c\u0431\u0435\u0440\u0442\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043d*\n';
      msg += '\U0001f34d Pi\u00f1a Colada \u2194 \U0001f33f ERA\n';
      msg += '\U0001f4c5 ' + dateTimeStr + '\n\n';

      var broughtList = formatAlbertItems(visit.brought_items || {});
      msg += '\u2728 *\u041f\u0420\u0418\u0412\u0401\u0417 \u043f\u043e\u0441\u0442\u0438\u0440\u0430\u043d\u043d\u043e\u0433\u043e:*\n';
      msg += (broughtList || '\u041d\u0438\u0447\u0435\u0433\u043e \u043d\u0435 \u043f\u0440\u0438\u0432\u0451\u0437') + '\n';
      if (broughtCost > 0) msg += '\U0001f4b0 \u0421\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c: *' + broughtCost.toFixed(2) + ' EUR* (\u0441 \u041d\u0414\u0421)\n';

      var hasRemainder = Object.values(broughtRemainder).some(function(v){return v>0;});
      if (hasRemainder) {
        msg += '\u26a0\ufe0f *\u0423 \u0410\u043b\u044c\u0431\u0435\u0440\u0442\u0430 \u043e\u0441\u0442\u0430\u043b\u043e\u0441\u044c (\u043d\u0435 \u0432\u0435\u0440\u043d\u0443\u043b):*\n';
        Object.keys(broughtRemainder).forEach(function(k){
          if (broughtRemainder[k] > 0) {
            var item = ALBERT_ITEMS.find(function(i){return i.key===k;});
            msg += '\u2022 ' + (item?item.name:k) + ': ' + broughtRemainder[k] + ' \u0448\u0442\n';
          }
        });
      }

      msg += '\n\U0001f69a *\u0417\u0410\u0411\u0420\u0410\u041b \u0433\u0440\u044f\u0437\u043d\u043e\u0433\u043e (' + (visit.loc_label||'') + '):*\n';
      var tookList = formatAlbertItems(visit.took_items || {});
      msg += (tookList || '\u041d\u0438\u0447\u0435\u0433\u043e \u043d\u0435 \u0437\u0430\u0431\u0440\u0430\u043b') + '\n';

      var hasDirtyRem = Object.values(dirtyRemainder).some(function(v){return v>0;});
      if (hasDirtyRem) {
        msg += '\u26a0\ufe0f *\u0412 \u0433\u0440\u044f\u0437\u043d\u043e\u043c \u043e\u0441\u0442\u0430\u043b\u043e\u0441\u044c:*\n';
        Object.keys(dirtyRemainder).forEach(function(k){
          if (dirtyRemainder[k] > 0) {
            var item = ALBERT_ITEMS.find(function(i){return i.key===k;});
            msg += '\u2022 ' + (item?item.name:ruName(k)) + ': ' + dirtyRemainder[k] + ' \u0448\u0442\n';
          }
        });
      } else if (Object.values(visit.took_items||{}).some(function(v){return v>0;})) {
        msg += '\u2705 \u0412\u0441\u0451 \u0433\u0440\u044f\u0437\u043d\u043e\u0435 \u0431\u0435\u043b\u044c\u0451 \u0432\u044b\u0432\u0435\u0437\u0435\u043d\o';
      }

      var balKeys = Object.keys(balanceAfter).filter(function(k){return balanceAfter[k]>0;});
      if (balKeys.length > 0) {
        msg += '\n\U0001f4e6 *\u041e\u0441\u0442\u0430\u0442\u043e\u043a \u0443 \u0410\u043b\u044c\u0431\u0435\u0440\u0442\u0430:*\n';
        balKeys.forEach(function(k){
          var item = ALBERT_ITEMS.find(function(i){return i.key===k;});
          msg += '\u2022 ' + (item?item.name:ruName(k)) + ': ' + balanceAfter[k] + ' \u0448\u0442\n';
        });
      }
      if (broughtCost > 0) msg += '\n\U0001f4ca *\u0424\u0430\u043a\u0442. \u0434\u043e\u043b\u0433 ERA +' + broughtCost.toFixed(2) + ' EUR*';

      // Отправляем итог всем
      await notifyAdmins(msg, { parse_mode: 'Markdown' });
      bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
      // Если Альберт — отправляем и ему тоже (если он не текущий чат)
      if (!isAlbert(chatIdStr) && ALBERT_CHAT_ID) {
        try { await bot.sendMessage(ALBERT_CHAT_ID, msg, { parse_mode: 'Markdown' }); } catch(e) {}
      }

      // Уведомление Ирочке о распределении если что-то привёз
      var broughtHas = Object.values(visit.brought_items||{}).some(function(v){return v>0;});
      if (broughtHas && IRINA_CHAT_ID) {
        var iMsg = '\u2728 \u0410\u043b\u044c\u0431\u0435\u0440\u0442 \u043f\u0440\u0438\u0432\u0451\u0437 \u043f\u043e\u0441\u0442\u0438\u0440\u0430\u043d\u043d\u043e\u0435!\n\n' + formatAlbertItems(visit.brought_items) + '\n\n\u0420\u0430\u0441\u043f\u0440\u0435\u0434\u0435\u043b\u0438 \u043f\u043e \u0430\u043f\u0430\u0440\u0442\u0430\u043c\u0435\u043d\u0442\u0430\u043c:';
        try { await bot.sendMessage(IRINA_CHAT_ID, iMsg, { reply_markup: { inline_keyboard: [
          [{ text: 'На Пераль (Оаз1+Оаз2)', callback_data: 'dist_piral' }, { text: 'На Сальвадор', callback_data: 'dist_salvador' }],
          [{ text: '✅ Всё распределила', callback_data: 'dist_done' }]
        ]}}); } catch(e) {}
      }

    } catch(e) {
      bot.sendMessage(chatId, 'Ошибка при сохранении визита: ' + e.message, getMenu(chatIdStr));
    }
    sessions[chatId] = null;
    return;
  }

  // ── ВИЗИТ: детали конкретного визита ──
  // ── ВИЗИТ: детали конкретного визита ──
  if (data.startsWith('av_detail_')) {
    var visitIdShort = data.slice(10);
    try {
      var r = await api('get_albert_visits', { limit: 50 });
      var visit = (r.data||[]).find(function(v){ return v.id && v.id.startsWith(visitIdShort); });
      if (!visit) return bot.sendMessage(chatId, 'Визит не найден');
      var dt = new Date(visit.visited_at || visit.created_at);
      var msg2 = '🔄 *Визит Альберта*\n🍍 Piña Colada ↔ 🌿 ERA\n📅 ' + fmtDate(dt.toISOString()) + ' · ' + fmtTime(dt.toISOString()) + '\n\n';
      var del = visit.delivered_items || {};
      var delList = formatAlbertItems(del);
      msg2 += '✨ *Привёз постиранное:*\n' + (delList || 'нет данных') + '\n';
      if (visit.delivered_cost) msg2 += '💰 Стоимость: *' + parseFloat(visit.delivered_cost).toFixed(2) + ' EUR*\n';
      var bRem = visit.brought_remainder || {};
      if (Object.values(bRem).some(function(v){return v>0;})) {
        msg2 += '⚠️ Не привёз (остаток у Альберта):\n';
        Object.keys(bRem).forEach(function(k){ if(bRem[k]>0){ var ai=ALBERT_ITEMS.find(function(i){return i.key===k;}); msg2 += '• '+(ai?ai.name:ruName(k))+': '+bRem[k]+' шт\n'; }});
      }
      var pick = visit.picked_items || {};
      var pickList = formatAlbertItems(pick);
      msg2 += '\n🚚 *Забрал грязное:*\n' + (pickList || 'нет данных') + '\n';
      var dRem = visit.dirty_remainder || {};
      if (Object.values(dRem).some(function(v){return v>0;})) {
        msg2 += '⚠️ Осталось в грязном:\n';
        Object.keys(dRem).forEach(function(k){ if(dRem[k]>0){ var ai=ALBERT_ITEMS.find(function(i){return i.key===k;}); msg2 += '• '+(ai?ai.name:ruName(k))+': '+dRem[k]+' шт\n'; }});
      } else if (pickList) { msg2 += '✅ Всё грязное бельё вывезено\n'; }
      var bal = visit.balance_after || {};
      if (Object.values(bal).some(function(v){return v>0;})) {
        msg2 += '\n📦 *Остаток у Альберта после визита:*\n';
        Object.keys(bal).forEach(function(k){ if(bal[k]>0){ var ai=ALBERT_ITEMS.find(function(i){return i.key===k;}); msg2 += '• '+(ai?ai.name:ruName(k))+': '+bal[k]+' шт\n'; }});
      }
      bot.sendMessage(chatId, msg2, { parse_mode: 'Markdown' });
    } catch(e) { bot.sendMessage(chatId, 'Ошибка: ' + e.message); }
    return;
  }

  // ── АЛЬБЕРТ ЗАБРАЛ — выбор откуда ──
  // ── АЛЬБЕРТ ЗАБРАЛ — выбор откуда ──
  if (data.startsWith('apick_')) {
    var from=data.slice(6); var fromLocations=from==='both'?['dirty_linen_piral','dirty_linen_salvador']:from==='piral'?['dirty_linen_piral']:['dirty_linen_salvador'];
    sessions[chatId]=Object.assign(sessions[chatId]||{},{step:'albert_pickup_confirm',fromLocations:fromLocations,items:sessions[chatId]&&sessions[chatId].items||{}});
    var form=buildAlbertLinenForm(sessions[chatId].items||{},'🚚 Что забрал?\nУкажи количество (или оставь 0):');
    try{await bot.editMessageText(form.text,{chat_id:chatId,message_id:query.message.message_id,reply_markup:{inline_keyboard:form.buttons}});}catch(e){bot.sendMessage(chatId,form.text,{reply_markup:{inline_keyboard:form.buttons}});}
    return;
  }

  // ── АЛЬБЕРТ БЕЛЬЁ ➕/➖ ──
  if (data.startsWith('alp_')||data.startsWith('alm_')) {
    var isPlus=data.startsWith('alp_'); var key=data.slice(4);
    if(!sessions[chatId])sessions[chatId]={items:{}};
    if(!sessions[chatId].items)sessions[chatId].items={};
    sessions[chatId].items[key]=Math.max(0,(sessions[chatId].items[key]||0)+(isPlus?1:-1));
    var title=sessions[chatId].step==='albert_delivery_items'?'✨ Альберт привёз чистое\nСкорректируй если нужно:':'🚚 Что забрал?\nУкажи количество:';
    var form=buildAlbertLinenForm(sessions[chatId].items,title);
    try{await bot.editMessageText(form.text,{chat_id:chatId,message_id:query.message.message_id,reply_markup:{inline_keyboard:form.buttons}});}catch(e){}
    return;
  }

  // ── АЛЬБЕРТ ПОДТВЕРЖДЕНИЕ ──
  if (data==='albert_confirm') {
    var sess=sessions[chatId]; if(!sess)return;
    try {
      if(sess.step==='albert_delivery_items'){
        var items=sess.items||{}; var hasItems=Object.values(items).some(function(v){return v>0;});
        if(!hasItems){await api('open_pending_delivery',{date:new Date().toISOString().split('T')[0],type:'incoming',notes:'Ожидает детализации'});bot.sendMessage(chatId,'✅ Зафиксировано: Альберт привёз чистое.',getMenu(chatIdStr));}
        else{
          await api('receive_from_albert',{items:items});
          var text='✅ Альберт привёз чистое!\n\n'+formatAlbertItems(items);
          var costR=null; try{costR=await api('calculate_laundry_cost',{items:items});}catch(e){}
          if(costR&&costR.data)text+='\n\n💰 Стоимость: *'+costR.data.total.toFixed(2)+' EUR* (с НДС)';
          bot.sendMessage(chatId,text,{parse_mode:'Markdown'});
          if(IRINA_CHAT_ID){try{await bot.sendMessage(IRINA_CHAT_ID,'✨ Альберт привёз чистое бельё!\n\n'+formatAlbertItems(items)+'\n\nРаспредели по апартаментам:',{reply_markup:{inline_keyboard:[[{text:'На Сальвадор',callback_data:'dist_salvador'},{text:'На Оазисы',callback_data:'dist_piral'}],[{text:'✅ Распределила',callback_data:'dist_done'}]]}});}catch(e){}}
        }
      } else if(sess.step==='albert_pickup_confirm'){
        var items=sess.items||{};
        await api('send_to_albert',{items:items,from_locations:sess.fromLocations});
        var text='✅ Альберт забрал грязное!\n\n'+(Object.values(items).some(function(v){return v>0;})?formatAlbertItems(items):'(количество не указано)');
        bot.sendMessage(chatId,text,getMenu(chatIdStr));
        await notifyAdmins('🚚 Альберт забрал грязное бельё'+(Object.values(items).some(function(v){return v>0;})?'\n'+formatAlbertItems(items):''),{parse_mode:'Markdown'});
      }
    } catch(e){bot.sendMessage(chatId,'Ошибка: '+e.message,getMenu(chatIdStr));}
    sessions[chatId]=null; return;
  }
  if (data==='albert_cancel'){sessions[chatId]=null;bot.sendMessage(chatId,'Отменено',getMenu(chatIdStr));return;}

  // ── РАСПРЕДЕЛЕНИЕ ──
  if(data==='dist_done'){bot.sendMessage(chatId,'✅ Распределено!',getMenu(chatIdStr));return;}
  if(data==='dist_salvador'){sessions[chatId]={step:'dist_input',apt:'salvador_clean'};bot.sendMessage(chatId,'Сколько комплектов на Сальвадор? Введи число:');return;}
  if(data==='dist_piral'){sessions[chatId]={step:'dist_input',apt:'piral_clean'};bot.sendMessage(chatId,'Сколько комплектов на Оазисы? Введи число:');return;}

  // ── ВЗАИМОРАСЧЁТЫ ──
  if(data==='inv_confirm_save'){
    if(!isAdmin(chatIdStr)||!sessions[chatId]||sessions[chatId].step!=='inv_confirm')return;
    var s=sessions[chatId];
    try{await api('save_laundry_invoice',{invoice_number:s.invNumber,period_from:s.periodFrom,period_to:s.periodTo,invoice_amount:s.amount,calculated_amount:0,items:{},invoice_file_url:s.fileUrl});try{await bot.editMessageText('✅ Счёт №'+s.invNumber+' на *'+s.amount+' EUR* сохранён!',{chat_id:chatId,message_id:query.message.message_id,parse_mode:'Markdown'});}catch(e){}await notifyAdmins('🧾 Счёт Альберта №'+s.invNumber+': *'+s.amount+' EUR*',{parse_mode:'Markdown'});}catch(e){bot.sendMessage(chatId,'Ошибка: '+e.message,getMenu(chatIdStr));}
    sessions[chatId]=null;return;
  }
  if(data==='inv_confirm_edit'){if(!isAdmin(chatIdStr)||!sessions[chatId])return;sessions[chatId].step='inv_upload_amount';bot.sendMessage(chatId,'Введи правильную сумму счёта:');return;}
  if(data==='inv_upload'){if(!isAdmin(chatIdStr))return;sessions[chatId]={step:'inv_upload_file',amount:null};bot.sendMessage(chatId,'Загрузка счёта Альберта\n\nОтправь файл (PDF или фото).');return;}
  if(data==='inv_pay'){if(!isAdmin(chatIdStr))return;sessions[chatId]={step:'inv_pay_amount'};bot.sendMessage(chatId,'Отметить оплату Альберту\n\nВведи сумму оплаты:');return;}
  if(data==='inv_albert_upload'){if(!isAlbert(chatIdStr))return;sessions[chatId]={step:'albert_doc_upload'};bot.sendMessage(chatId,'Загрузи файл (presupuesto или счёт):');return;}

  // ── БЕЛЬЁ УБОРЩИЦ ──
  if(data==='la_change'){sessions[chatId]={step:'linen_form',linen:{}};var chButtons=Object.keys(APT_NAMES).map(function(id){return[{text:APT_NAMES[id],callback_data:'la_'+id}];});bot.sendMessage(chatId,'Выбери апартамент:',{reply_markup:{inline_keyboard:chButtons}});return;}
  if(data.startsWith('la_')){var apt=data.slice(3);sessions[chatId]={step:'linen_counting',apt:apt,linen:{}};var form=showLinenForm(apt,{});bot.sendMessage(chatId,form.text,{reply_markup:{inline_keyboard:form.buttons}});return;}
  if(data.startsWith('lp_')||data.startsWith('lm_')){
    var isPlus=data.startsWith('lp_');
    var raw=data.slice(3); // e.g. "piral_1_small_towels" or "salvador_sheets"
    // apt может быть piral_1, piral_2, grande, salvador
    var apt2='', key2='';
    var knownApts=['piral_1','piral_2','grande','salvador'];
    for(var ai=0;ai<knownApts.length;ai++){
      if(raw.startsWith(knownApts[ai]+'_')){apt2=knownApts[ai];key2=raw.slice(knownApts[ai].length+1);break;}
      if(raw===knownApts[ai]){apt2=knownApts[ai];key2='';break;}
    }
    if(!apt2){var pi=raw.indexOf('_');apt2=pi>-1?raw.slice(0,pi):raw;key2=pi>-1?raw.slice(pi+1):'';}
    if(!sessions[chatId])sessions[chatId]={step:'linen_counting',apt:apt2,linen:{}};
    if(!sessions[chatId].linen)sessions[chatId].linen={};
    if(key2)sessions[chatId].linen[key2]=Math.max(0,(sessions[chatId].linen[key2]||0)+(isPlus?1:-1));
    var form=showLinenForm(apt2,sessions[chatId].linen);
    try{await bot.editMessageText(form.text,{chat_id:chatId,message_id:query.message.message_id,reply_markup:{inline_keyboard:form.buttons}});}catch(e){}
    return;
  }
  if(data.startsWith('linen_submit_')){
    var apt=data.slice(13);
    // Нормализуем апартамент
    apt = normalizeApt(apt) || apt;
    var linen=sessions[chatId]?sessions[chatId].linen||{}:{};var items=[];
    for(var k in linen){if(linen[k]>0){var linenItem=LINEN_ITEMS.find(function(l){return l.key===k;});var linenName=linenItem?linenItem.name:k;items.push({item_type:k,name:linenName,quantity:linen[k]});}}
    if(items.length===0){bot.sendMessage(chatId,'Укажи хотя бы одну позицию!');return;}
    try {
      var aptName2 = APT_NAMES[apt] || apt;
      var toLoc = APT_DIRTY[apt] || 'dirty_linen_piral';
      var now2 = new Date();
      var timeStr = now2.toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });

      // Находим текущую бронь для деталей
      var booking = null;
      if (scheduleCache) {
        var today2 = now2.toISOString().split('T')[0];
        booking = scheduleCache.find(function(s) {
          return s.apartment === apt && s.checkout_date && s.checkout_date.slice(0,10) >= today2;
        });
      }
      var bookingInfo = booking ? '\n📅 Бронь: ' + fmtDateShort(booking.checkin_date) + ' → ' + fmtDateShort(booking.checkout_date) : '';

      // Формируем список белья
      var itemsText = '';
      var moveItems = {};
      items.forEach(function(i) {
        if (i.quantity > 0) {
          itemsText += '\n  • ' + i.name + ': ' + i.quantity + ' шт';
          moveItems[i.key || i.name] = i.quantity;
        }
      });

      // Создаём движение СРАЗУ — чтобы данные не потерялись
      var moveItemsArr = [];
      items.forEach(function(i) {
        if (i.quantity > 0) moveItemsArr.push({ item_type: i.key || i.name, quantity: i.quantity });
      });
      if (moveItemsArr.length > 0) {
        await api('create_movement', {
          from_location: apt,
          to_location: toLoc,
          items: moveItemsArr,
          notes: 'Грязное бельё · ' + aptName2 + ' · ' + firstName + ' · ' + timeStr
        });
      }

      // Планируем уведомление админам через 10 мин
      var bookingLine = booking ? '🕐 *Время:* ' + timeStr + '\n📅 *Бронь:* ' + fmtDateShort(booking.checkin_date) + ' → ' + fmtDateShort(booking.checkout_date) + '\n' : '🕐 *Время:* ' + timeStr + '\n';
      await scheduleLinenAdminNotify(chatId, aptName2, firstName, itemsText, bookingLine, moveItemsArr.map(function(i){return i.item_type;}));

      // Уборщице — подтверждение с кнопкой исправления (10 мин)
      var cleanerMsg = '✅ *Бельё успешно отмечено!*\n' +
        '━━━━━━━━━━━━━━━━\n' +
        '🏠 *' + aptName2 + '*\n' +
        '🕐 ' + timeStr + (booking ? '\n📅 ' + fmtDateShort(booking.checkin_date) + ' → ' + fmtDateShort(booking.checkout_date) : '') + '\n' +
        '━━━━━━━━━━━━━━━━\n' +
        '📋 *Перемещено:*' + (itemsText || ' —') + '\n' +
        '━━━━━━━━━━━━━━━━\n' +
        '_Данные сохранены. Можешь исправить в течение 10 минут_ ✏️';
      bot.sendMessage(chatId, cleanerMsg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
        [{ text: '✏️ Исправить количество', callback_data: 'linen_edit_' + apt }]
      ]}, ...getMenu(chatIdStr) });
      sessions[chatId] = null;
    } catch(e) { bot.sendMessage(chatId, 'Ошибка: ' + e.message, getMenu(chatIdStr)); }
    return;
  }
  if(data.startsWith('linen_edit_')){
    var editApt = data.slice(11);
    // Проверяем что ещё в окне редактирования
    if (!linenPendingNotify[chatId]) {
      bot.sendMessage(chatId, '⏰ Время редактирования истекло (10 мин). Обратись к администратору.');
      return;
    }
    // Открываем форму заново с текущими данными
    var prevLinen = sessions[chatId] && sessions[chatId].linen || {};
    sessions[chatId] = { step: 'linen_counting', apt: editApt, linen: prevLinen, isEdit: true };
    var form = showLinenForm(editApt, prevLinen);
    bot.sendMessage(chatId, '✏️ *Исправь количество:*\n' + form.text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: form.buttons }});
    return;
  }
  if(data==='linen_cancel'){sessions[chatId]=null;bot.sendMessage(chatId,'Отменено',getMenu(chatIdStr));return;}

  // ── ГОСТИ ──
  if(data.startsWith('gu_')){if(!isAdmin(chatIdStr))return;var rest=data.slice(3);var idx=rest.lastIndexOf('_');var slotId=idx===-1?rest:rest.slice(0,idx);var cur=idx===-1?1:(parseInt(rest.slice(idx+1))||1);sessions[chatId]={step:'set_guests_btn',slotId:slotId,guests:cur};var form={text:'Гостей следующего заезда: '+cur,buttons:[[{text:'🔴 −',callback_data:'gmn_'+slotId},{text:'👥 '+cur,callback_data:'noop'},{text:'🟢 +',callback_data:'gp_'+slotId}],[{text:'✅ Сохранить',callback_data:'gsave_'+slotId},{text:'❌ Отмена',callback_data:'gcancel'}]]};bot.sendMessage(chatId,form.text,{reply_markup:{inline_keyboard:form.buttons}});return;}
  if(data.startsWith('gp_')||data.startsWith('gmn_')){if(!isAdmin(chatIdStr))return;var isPlus=data.startsWith('gp_');var slotId=data.startsWith('gmn_')?data.slice(4):data.slice(3);if(!sessions[chatId]||sessions[chatId].step!=='set_guests_btn')sessions[chatId]={step:'set_guests_btn',slotId:slotId,guests:1};sessions[chatId].guests=Math.max(1,Math.min(20,(sessions[chatId].guests||1)+(isPlus?1:-1)));var qty=sessions[chatId].guests;var form={text:'Гостей следующего заезда: '+qty,buttons:[[{text:'🔴 −',callback_data:'gmn_'+slotId},{text:'👥 '+qty,callback_data:'noop'},{text:'🟢 +',callback_data:'gp_'+slotId}],[{text:'✅ Сохранить',callback_data:'gsave_'+slotId},{text:'❌ Отмена',callback_data:'gcancel'}]]};try{await bot.editMessageText(form.text,{chat_id:chatId,message_id:query.message.message_id,reply_markup:{inline_keyboard:form.buttons}});}catch(e){}return;}
  if(data.startsWith('gsave_')){if(!isAdmin(chatIdStr))return;var slotId=data.slice(6);var guests=sessions[chatId]?sessions[chatId].guests:1;try{await api('update_slot',{slot_id:slotId,next_guests:guests});bot.sendMessage(chatId,'✅ Гостей: '+guests,getMenu(chatIdStr));}catch(e){bot.sendMessage(chatId,'Ошибка: '+e.message,getMenu(chatIdStr));}sessions[chatId]=null;return;}
  if(data==='gcancel'){sessions[chatId]=null;bot.sendMessage(chatId,'Отменено',getMenu(chatIdStr));return;}

  // ── СТОИМОСТЬ БРОНИ — кнопка из уведомления ──────────────────────────────
  // ── ЧЕК: обработчики ─────────────────────────────────────────────
  if (data === 'receipt_analyze') {
    var sess = sessions[chatId];
    if (!sess || !sess.photoFileId) return;
    try {
      await bot.sendMessage(chatId, '🔍 Анализирую чек...');
      var fileInfo = await bot.getFile(sess.photoFileId);
      var fileUrl = 'https://api.telegram.org/file/bot' + TOKEN + '/' + fileInfo.file_path;
      var imgResp = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      var imageBuffer = Buffer.from(imgResp.data);
      var base64 = imageBuffer.toString('base64');

      // Анализируем через Claude Vision
      var visionResp = await axios.post('https://api.anthropic.com/v1/messages', {
        model: 'claude-haiku-4-5-20251001', max_tokens: 600,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
          { type: 'text', text: 'Это фото чека. Извлеки все данные. Верни ТОЛЬКО JSON: {"amount": 29.90, "shop": "Mercadona", "date": "2026-04-12", "items": "краткий список товаров", "full_text": "полный текст чека"}' }
        ]}]
      }, { headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } });
      var rd = JSON.parse(visionResp.data.content[0].text.replace(/```json|```/g, '').trim());

      // Загружаем фото в Supabase Storage
      var fileName = 'receipt_' + chatId + '_' + Date.now() + '.jpg';
      var receiptUrl = await uploadReceiptToStorage(imageBuffer, fileName);

      var mappedCat = mapExpenseCategory(rd.items || '', rd.shop || '');
      var fullDesc = mappedCat + (rd.shop ? ' · ' + rd.shop : '') + (rd.items ? ': ' + rd.items : '');
      var receiptText = rd.full_text || rd.items || '';

      var expenseResult = await api('create_expense', {
        amount: rd.amount || 0,
        description: fullDesc,
        source: 'telegram_photo',
        receipt_url: receiptUrl || '',
        receipt_text: receiptText,
        created_at: new Date().toISOString()
      });
      if (expenseResult && expenseResult.error) {
        console.error('[expense] Supabase error:', expenseResult.error);
        bot.sendMessage(chatId, '❌ Ошибка сохранения: ' + expenseResult.error, getMenu(chatIdStr));
      } else {
        var confirmText = '✅ Записано' + (receiptUrl ? ' с чеком 📄' : '') + '!\n\n💰 *' + (rd.amount||'?') + ' EUR*\n🏪 ' + (rd.shop||'—') + '\n📋 ' + (rd.items||'—');
        bot.sendMessage(chatId, confirmText, { parse_mode: 'Markdown', ...getMenu(chatIdStr) });
      }
    } catch(e) { bot.sendMessage(chatId, '❌ Ошибка: ' + e.message, getMenu(chatIdStr)); }
    sessions[chatId] = null; return;
  }
  // ── TTS НАСТРОЙКИ ────────────────────────────────────────────────
  if (data === 'settings_menu') {
    bot.sendMessage(chatId, '⚙️ *Настройки бота:*', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
      [{ text: '🎙 Голос TTS — ' + TTS_VOICE_NAMES[ttsSettings.voice], callback_data: 'settings_tts' }],
      [{ text: ttsSettings.enabled ? '🔊 Голосовые ответы: ВКЛ' : '🔇 Голосовые ответы: ВЫКЛ', callback_data: 'tts_toggle' }],
      [{ text: '🔒 Замки и апартаменты', callback_data: 'ttlock_settings' }],
      [{ text: '📊 Версия бота', callback_data: 'show_version' }]
    ]}}); return;
  }
  if (data === 'show_version') {
    bot.sendMessage(chatId,
      '🤖 *ERA Bot v90*\n\n📋 *Последние изменения:*\n' +
      '• v74 — фикс дат в подтверждении кода\n' +
      '• v73 — фикс Markdown ошибок в инструкции\n' +
      '• v72 — кнопки языков через глобальный store\n' +
      '• v71 — период брони при создании кода\n' +
      '• v70 — фикс разделителя дат в кнопках\n' +
      '• v68 — новое расписание для админов + 🔑\n' +
      '• v67 — код Альберта 8282, фикс /version\n' +
      '• v60 — инструкция гостям на 6 языках\n' +
      '• v58 — TTS HD качество, mp3',
      { parse_mode: 'Markdown' }); return;
  }
  if (data === 'settings_tts') {
    var btns = TTS_VOICES.map(function(v) {
      return [{ text: (v === ttsSettings.voice ? '✅ ' : '') + TTS_VOICE_NAMES[v], callback_data: 'tts_voice_' + v }];
    });
    btns.push([{ text: ttsSettings.enabled ? '🔊 ВКЛ' : '🔇 ВЫКЛ', callback_data: 'tts_toggle' }, { text: '◀️ Назад', callback_data: 'settings_menu' }]);
    try { await bot.editMessageText('🎙 *Выбери голос:*', { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown', reply_markup: { inline_keyboard: btns } }); } catch(e) {}
    return;
  }
  if (data.startsWith('tts_voice_')) {
    var voice = data.slice(10);
    if (TTS_VOICES.indexOf(voice) !== -1) {
      ttsSettings.voice = voice;
      saveTtsSettings();
      var buttons = TTS_VOICES.map(function(v) {
        return [{ text: (v === voice ? '✅ ' : '') + TTS_VOICE_NAMES[v], callback_data: 'tts_voice_' + v }];
      });
      buttons.push([{ text: ttsSettings.enabled ? '🔊 Голос: ВКЛ' : '🔇 Голос: ВЫКЛ', callback_data: 'tts_toggle' }]);
      try { await bot.editMessageText('🎙 *Настройки голоса:*\n\nТекущий: *' + TTS_VOICE_NAMES[voice] + '*',
        { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } }); } catch(e) {}
    }
    return;
  }
  if (data === 'tts_toggle') {
    ttsSettings.enabled = !ttsSettings.enabled;
    saveTtsSettings();
    var buttons2 = TTS_VOICES.map(function(v) {
      return [{ text: (v === ttsSettings.voice ? '✅ ' : '') + TTS_VOICE_NAMES[v], callback_data: 'tts_voice_' + v }];
    });
    buttons2.push([{ text: ttsSettings.enabled ? '🔊 Голос: ВКЛ' : '🔇 Голос: ВЫКЛ', callback_data: 'tts_toggle' }]);
    try { await bot.editMessageText('🎙 *Настройки голоса:*\n\nТекущий: *' + TTS_VOICE_NAMES[ttsSettings.voice] + '*\n' + (ttsSettings.enabled ? '🔊 Голосовые ответы включены' : '🔇 Голосовые ответы выключены'),
      { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons2 } }); } catch(e) {}
    return;
  }

  if (data === 'linen_already_done') {
    try { await bot.answerCallbackQuery(query.id, { text: '👍 Отлично!' }); } catch(e) {}
    return;
  }
  if (data.startsWith('ec_one_')) {
    if (!isAdmin(chatIdStr) && String(chatId) !== String(EMMA_CHAT_ID)) return;
    var assignId = data.slice(7);
    try {
      await api('confirm_payment', { assignment_id: assignId });
      try { await bot.editMessageText('✅ Выплата подтверждена!', { chat_id: chatId, message_id: query.message.message_id }); } catch(e) {}
      // Уведомляем владельца
      if (OWNER_CHAT_ID && String(chatId) !== String(OWNER_CHAT_ID)) {
        bot.sendMessage(OWNER_CHAT_ID, '💼 *Эммочка* подтвердила выплату · ' + new Date().toLocaleString('ru-RU', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}), { parse_mode: 'Markdown' });
      }
    } catch(e) { bot.sendMessage(chatId, '❌ Ошибка: ' + e.message); }
    return;
  }

  if (data === 'emma_confirm_all') {
    if (!isAdmin(chatIdStr)) return;
    try {
      var r = await api('get_unpaid_cleanings');
      if (!r.data) { bot.sendMessage(chatId, '✅ Нет неподтверждённых выплат'); return; }
      var confirmed = 0;
      for (var name in r.data) {
        var info = r.data[name];
        for (var di = 0; di < info.details.length; di++) {
          try {
            await api('confirm_payment_by_date', { cleaner_name: name, cleaning_date: info.details[di].date });
            confirmed++;
          } catch(e2) {}
        }
      }
      bot.sendMessage(chatId, '✅ Подтверждено выплат: ' + confirmed, getMenu(chatIdStr));
      // Уведомляем владельца
      if (OWNER_CHAT_ID && String(chatId) !== String(OWNER_CHAT_ID)) {
        bot.sendMessage(OWNER_CHAT_ID, '💰 Эммочка подтвердила все выплаты: ' + confirmed + ' шт.');
      }
    } catch(e) { bot.sendMessage(chatId, '❌ Ошибка: ' + e.message); }
    return;
  }

  if (data === 'receipt_cancel') { sessions[chatId] = null; bot.sendMessage(chatId, '❌ Отменено', getMenu(chatIdStr)); return; }

  if (data === 'receipt_use_voice' || data === 'receipt_use_receipt') {
    var sess = sessions[chatId];
    if (!sess) return;
    var useAmount = data === 'receipt_use_voice' ? sess.amount : (sess.receiptData ? sess.receiptData.amount : sess.amount);
    var rd = sess.receiptData || {};
    var receiptUrl = sess.receiptUrl || '';
    var receiptText = rd.full_text || rd.items || '';
    var descFinal = data === 'receipt_use_receipt'
      ? mapExpenseCategory(rd.items||'', rd.shop||'') + (rd.shop?' · '+rd.shop:'') + (rd.items?': '+rd.items:'')
      : sess.description;
    try {
      if (sess.expenseId) {
        await api('update_expense_receipt', { expense_id: sess.expenseId, receipt_url: receiptUrl, receipt_text: receiptText, amount: useAmount, description: descFinal });
      }
      bot.sendMessage(chatId, '✅ Готово! 📄\n💸 *' + useAmount + ' EUR*\n' + descFinal, { parse_mode: 'Markdown', ...getMenu(chatIdStr) });
    } catch(e) { bot.sendMessage(chatId, '❌ Ошибка: ' + e.message, getMenu(chatIdStr)); }
    sessions[chatId] = null; return;
  }

  if (data === 'expense_no_receipt') {
    sessions[chatId] = null;
    try { await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: query.message.message_id }); } catch(e) {}
    return;
  }
  if (data === 'expense_attach_receipt') {
    var sess = sessions[chatId];
    if (sess) sess.step = 'expense_receipt_wait';
    try { await bot.editMessageText(
      '📸 Отправь фото чека — сравню с суммой ' + (sess ? sess.amount : '') + ' EUR',
      { chat_id: chatId, message_id: query.message.message_id }
    ); } catch(e) {}
    return;
  }

  // ── ФИНАНСЫ: обработчики кнопок ──────────────────────────────────
  if (data === 'fin_income' || data === 'fin_expenses' || data === 'fin_balance' || data === 'fin_month_summary' || data === 'fin_forecast') {
    var now = new Date(); var y = now.getFullYear(); var mo = now.getMonth()+1;
    var prevMo = mo-1<1?12:mo-1; var prevMoY = mo-1<1?y-1:y;
    var nextMo = mo+1>12?1:mo+1; var nextMoY = mo+1>12?y+1:y;
    var actionMap = { fin_income:'query_income', fin_expenses:'query_expenses', fin_balance:'query_income_vs_expenses', fin_month_summary:'query_month_summary', fin_forecast:'query_month_summary' };
    var labelMap = { fin_income:'💵 Доходы', fin_expenses:'📉 Расходы', fin_balance:'📊 Баланс', fin_month_summary:'📈 Итоги', fin_forecast:'🔮 Прогноз' };
    var label = labelMap[data] || 'Финансы';
    bot.sendMessage(chatId, label + ' — выбери период:', { reply_markup: { inline_keyboard: [
      [{ text: '📆 ' + (MONTH_NAMES_RU[mo]||'этот месяц'), callback_data: 'fin_p_'+data+'_this' },
       { text: '⬅️ ' + (MONTH_NAMES_RU[prevMo]||'прошлый'), callback_data: 'fin_p_'+data+'_prev' }],
      [{ text: '➡️ ' + (MONTH_NAMES_RU[nextMo]||'след.'), callback_data: 'fin_p_'+data+'_next' },
       { text: '📊 Квартал', callback_data: 'fin_p_'+data+'_quarter' }],
      [{ text: '📅 Этот год', callback_data: 'fin_p_'+data+'_year' }]
    ]}});
    return;
  }
  if (data.startsWith('fin_p_')) {
    var parts = data.slice(6).split('_'); var finAction = parts[0]+'_'+parts[1]; var period = parts[2];
    var now = new Date(); var y = now.getFullYear(); var mo = now.getMonth()+1;
    var per = { from: '', to: '', label: '' };
    if (period === 'this') { per = { from: isoDate(y,mo,1), to: isoDate(y,mo,lastDayOf(y,mo)), label: MONTH_NAMES_RU[mo] }; }
    else if (period === 'prev') { var pm=mo-1<1?12:mo-1; var py=mo-1<1?y-1:y; per = { from: isoDate(py,pm,1), to: isoDate(py,pm,lastDayOf(py,pm)), label: MONTH_NAMES_RU[pm] }; }
    else if (period === 'next') { var nm=mo+1>12?1:mo+1; var ny=mo+1>12?y+1:y; per = { from: isoDate(ny,nm,1), to: isoDate(ny,nm,lastDayOf(ny,nm)), label: MONTH_NAMES_RU[nm] }; }
    else if (period === 'quarter') { var qs=Math.floor((mo-1)/3)*3+1; var qe=qs+2; per = { from: isoDate(y,qs,1), to: isoDate(y,qe,lastDayOf(y,qe)), label: 'квартал '+Math.ceil(mo/3) }; }
    else if (period === 'year') { per = { from: isoDate(y,1,1), to: isoDate(y,12,31), label: String(y) }; }
    var actionMap2 = { fin_income:'query_income', fin_expenses:'query_expenses', fin_balance:'query_income_vs_expenses', fin_month_summary:'query_month_summary', fin_forecast:'query_month_summary' };
    var cmd = { action: actionMap2[finAction] || 'query_income', period: 'custom', date_from: per.from, date_to: per.to, confirm_text: per.label };
    await executeVoiceCommand(chatId, chatIdStr, cmd);
    return;
  }
  if (data === 'fin_add_income') { sessions[chatId] = { step: 'inc_amount', source: '' }; bot.sendMessage(chatId, '💰 Введи сумму дохода (EUR):'); return; }
  if (data === 'fin_add_expense') { bot.sendMessage(chatId, '📉 Для записи расхода скажи голосом или текстом:\n«Расход 150 евро клининг моющие»'); return; }

  // ── НАЙТИ: обработчики кнопок ────────────────────────────────────
  if (data === 'find_period') {
    var now = new Date(); var y = now.getFullYear(); var mo = now.getMonth()+1;
    var prevMo = mo-1 < 1 ? 12 : mo-1; var prevMoY = mo-1 < 1 ? y-1 : y;
    var nextMo = mo+1 > 12 ? 1 : mo+1; var nextMoY = mo+1 > 12 ? y+1 : y;
    var quickButtons = [
      [{ text: '📌 Сегодня', callback_data: 'dp_quick_today' }, { text: '📅 Эта неделя', callback_data: 'dp_quick_week' }],
      [{ text: '⬅️ Прошлая неделя', callback_data: 'dp_quick_prevweek' }, { text: '➡️ След. неделя', callback_data: 'dp_quick_nextweek' }],
      [{ text: '📆 ' + MONTH_NAMES_RU[mo], callback_data: 'dp_quick_month' }, { text: '⬅️ ' + MONTH_NAMES_RU[prevMo], callback_data: 'dp_quick_prevmonth' }],
      [{ text: '➡️ ' + MONTH_NAMES_RU[nextMo], callback_data: 'dp_quick_nextmonth' }, { text: '📊 Квартал', callback_data: 'dp_quick_quarter' }],
      [{ text: '🗓 Выбрать даты', callback_data: 'dp_open_calendar' }],
      [{ text: '⌨️ Ввести текстом', callback_data: 'dp_text_input' }]
    ];
    try { await bot.editMessageText('📅 *Выбери период:*', { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown', reply_markup: { inline_keyboard: quickButtons } }); } catch(e) {
      bot.sendMessage(chatId, '📅 *Выбери период:*', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: quickButtons } });
    }
    return;
  }
  if (data === 'find_spa') {
    var r = await api('get_bookings_with_spa');
    if (!r.data || r.data.length === 0) return bot.sendMessage(chatId, '🏊 Нет броней со спа или кроваткой', getMenu(chatIdStr));
    var text = '🏊 *Брони со спа / кроваткой:*\n\n';
    var buttons = [];
    r.data.forEach(function(b) {
      var apt = APT_NAMES[b.apartment] || b.apartment;
      var tasks = Array.isArray(b.tasks) ? b.tasks : [];
      var icons = (tasks.find(function(t){return t.key==='spa'&&t.enabled;})?'🏊':'') + (tasks.find(function(t){return t.key==='crib'&&t.enabled;})?'🛏':'');
      text += '*' + apt + '* · ' + fmtDateShort(b.checkin_date) + '→' + fmtDateShort(b.checkout_date) + ' · ' + (b.guests_count||'?') + 'г ' + icons + '\n';
      buttons.push([{ text: apt + ' ' + fmtDateShort(b.checkin_date) + ' ' + icons, callback_data: 'noop' }, { text: '✏️ Задание', callback_data: 'nb_assign_' + b.id }, { text: '💰 Стоимость', callback_data: 'inc_add_' + b.id }]);
    });
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } }); return;
  }
  if (data === 'find_tasks') {
    var r = await api('get_bookings_with_tasks');
    if (!r.data || r.data.length === 0) return bot.sendMessage(chatId, '📋 Нет броней с заданиями', getMenu(chatIdStr));
    var text = '📋 *Брони с заданиями:*\n\n';
    var buttons = [];
    r.data.forEach(function(b) {
      var apt = APT_NAMES[b.apartment] || b.apartment;
      text += '*' + apt + '* · ' + fmtDateShort(b.checkin_date) + '→' + fmtDateShort(b.checkout_date) + '\n' + fmtInstructions(JSON.stringify(b.tasks)) + '\n\n';
      buttons.push([{ text: apt + ' ' + fmtDateShort(b.checkin_date), callback_data: 'noop' }, { text: '💰 Стоимость', callback_data: 'inc_add_' + b.id }]);
    });
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } }); return;
  }
  if (data === 'find_no_income') {
    try {
      // Берём все брони за широкий период — год назад и год вперёд
      var wideFrom = new Date(); wideFrom.setFullYear(wideFrom.getFullYear()-1);
      var wideTo = new Date(); wideTo.setFullYear(wideTo.getFullYear()+1);
      var r = await api('get_bookings_by_period', { date_from: wideFrom.toISOString().split('T')[0], date_to: wideTo.toISOString().split('T')[0] });
      // Фильтруем только те у которых нет дохода
      var all = (r.data || []).filter(function(b){ return !b.income_amount && !b.has_income; });
      if (all.length === 0) {
        // Пробуем отдельный API если есть
        try {
          var r2 = await api('get_bookings_without_income');
          all = r2.data || [];
        } catch(e2) {}
      }
      if (all.length === 0) return bot.sendMessage(chatId, '✅ У всех броней указана стоимость!', getMenu(chatIdStr));
      var todayStr = new Date().toISOString().split('T')[0];
      var text = '💰 *Без стоимости (' + all.length + '):*\n\n';
      var buttons = [];
      all.sort(function(a,b){ return a.checkin_date > b.checkin_date ? 1 : -1; });
      all.forEach(function(b) {
        var apt = APT_NAMES[b.apartment] || b.apartment;
        var src = fmtSource(b.source);
        var isPast = b.checkout_date && b.checkout_date.slice(0,10) < todayStr ? '⏮' : b.checkin_date && b.checkin_date.slice(0,10) > todayStr ? '🔮' : '▶️';
        text += isPast + ' ' + (src?src+' ':'') + '*' + apt + '* · ' + fmtDateShort(b.checkin_date) + '→' + fmtDateShort(b.checkout_date) + ' · ' + (b.guests_count||'?') + 'г\n';
        buttons.push([{ text: isPast + ' ' + (src?src+' ':'') + apt + ' ' + fmtDateShort(b.checkin_date), callback_data: 'noop' }, { text: '💰 Внести', callback_data: 'inc_add_' + b.id }]);
      });
      // Разбиваем на чанки по 8
      var chunks = []; for (var ci=0; ci<buttons.length; ci+=8) chunks.push(buttons.slice(ci,ci+8));
      chunks.forEach(function(chunk, ci) {
        bot.sendMessage(chatId, ci===0?text:'...продолжение', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: chunk } });
      });
    } catch(e) { bot.sendMessage(chatId, '❌ Ошибка: ' + e.message, getMenu(chatIdStr)); }
    return;
  }
  if (data === 'find_help') {
    bot.sendMessage(chatId,
      '❓ *Что именно найти? Уточни запрос:*\n\n' +
      '🗓 *Бронирования* — по датам, апартаментам, гостям\n' +
      '💰 *Финансы* — доходы, расходы, задолженности\n' +
      '🧹 *Клининг* — график уборок, оплаты клинерам\n' +
      '🏠 *Апартаменты* — загрузка, свободные даты\n' +
      '📋 *Задачи* — активные, просроченные\n' +
      '🛏 *Инвентарь* — баланс белья у Альберта\n\n' +
      '_Примеры голосом или текстом:_\n' +
      '• «найти свободные даты в мае»\n' +
      '• «найти долги по клинингу»\n' +
      '• «найти загрузку Оазис 1»\n\n' +
      '*Кнопки:*\n' +
      '📅 По периоду — заезды/выезды/активные брони\n' +
      '🏊 Со спа/кроваткой — спецзаказы\n' +
      '📋 С заданиями — брони с инструкциями\n' +
      '💰 Без стоимости — все брони без суммы (прошлые ⏮ текущие ▶️ будущие 🔮)\n' +
      '🔮 Будущие — предстоящие брони с прогнозом',
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '◀️ Назад', callback_data: 'find_back' }]] } }
    ); return;
  }
  if (data === 'find_back') {
    try { await bot.editMessageText('🔍 *Что ищем?*', { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
      [{ text: '📅 По периоду', callback_data: 'find_period' }],
      [{ text: '🏊 Со спа / кроваткой', callback_data: 'find_spa' }, { text: '📋 С заданиями', callback_data: 'find_tasks' }],
      [{ text: '💰 Без стоимости', callback_data: 'find_no_income' }, { text: '🔮 Будущие брони', callback_data: 'find_future' }],
      [{ text: '❓ Помощь', callback_data: 'find_help' }]
    ]}}); } catch(e) {}
    return;
  }
  if (data === 'find_future') {
    var todayF = new Date().toISOString().split('T')[0];
    var future = scheduleCache.filter(function(s){ return s.checkin_date && s.checkin_date.slice(0,10) >= todayF; }).sort(function(a,b){ return a.checkin_date > b.checkin_date ? 1 : -1; }).slice(0,15);
    if (future.length === 0) return bot.sendMessage(chatId, '🔮 Нет будущих броней', getMenu(chatIdStr));
    var text = '🔮 *Будущие брони (' + future.length + '):*\n\n';
    var buttons = [];
    future.forEach(function(b) {
      var apt = APT_NAMES[b.apartment] || b.apartment;
      var src = fmtSource(b.source);
      var income = b.income_amount ? ' · 💰' + b.income_amount + '€' : ' · 💰?';
      text += (src?src+' ':'') + '*' + apt + '* · ' + fmtDateShort(b.checkin_date) + '→' + fmtDateShort(b.checkout_date) + ' · ' + (b.guests_count||'?') + 'г' + income + '\n';
      buttons.push([{ text: (src?src+' ':'') + apt + ' ' + fmtDateShort(b.checkin_date) + income, callback_data: 'noop' }, { text: '💰 Стоимость', callback_data: 'inc_add_' + b.id }]);
    });
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } }); return;
  }

  if (data.startsWith('inc_add_')) {
    if (!isAdmin(chatIdStr)) return;
    var bookingId = data.slice(8);
    sessions[chatId] = { step: 'inc_amount', bookingId: bookingId };
    // Получаем детали брони — сначала из кэша, потом из API
    var bookingInfo = '';
    try {
      // Ищем в scheduleCache
      var cached = scheduleCache.find(function(s){ return String(s.id) === String(bookingId); });
      if (cached) {
        bookingInfo = (APT_NAMES[cached.apartment]||cached.apartment) + ' · ' + fmtDateShort(cached.checkin_date) + '→' + fmtDateShort(cached.checkout_date);
        sessions[chatId].apartment = cached.apartment;
        sessions[chatId].checkin = cached.checkin_date;
        sessions[chatId].checkout = cached.checkout_date;
        sessions[chatId].source = cached.source || cached.booking_source || '';
      } else {
        // Fallback к API
        var br = await api('get_booking_by_id', { booking_id: bookingId });
        if (br.data) {
          var bd = br.data;
          bookingInfo = (APT_NAMES[bd.apartment]||bd.apartment) + ' · ' + fmtDateShort(bd.checkin_date) + '→' + fmtDateShort(bd.checkout_date);
          sessions[chatId].apartment = bd.apartment;
          sessions[chatId].checkin = bd.checkin_date;
          sessions[chatId].checkout = bd.checkout_date;
          sessions[chatId].source = bd.source || bd.booking_source || bd.ical_source || bd.platform || '';
        }
      }
    } catch(e) {}
    bot.sendMessage(chatId,
      '💰 Стоимость брони\n' + (bookingInfo ? '_' + bookingInfo + '_\n\n' : '\n') +
      'Введи сумму (например: *450* или *450 EUR*):',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (data.startsWith('inc_src_')) {
    // inc_src_BOOKINGID_SOURCE
    if (!isAdmin(chatIdStr)) return;
    var parts = data.slice(8).split('_');
    var bookingId2 = parts[0];
    var source = parts.slice(1).join('_');
    var sess = sessions[chatId];
    if (!sess || sess.step !== 'inc_source') return;
    sess.source = source;
    // Сохраняем
    try {
      var srcName = { airbnb: 'Airbnb', holidu: 'Holidu', booking: 'Booking.com', direct: 'Прямое', other: 'Другое' }[source] || source;
      var desc = (APT_NAMES[sess.apartment]||sess.apartment||'') + (sess.checkin ? ' · ' + fmtDateShort(sess.checkin) + '→' + fmtDateShort(sess.checkout) : '');
      await api('create_income', { amount: sess.amount, category: 'Аренда', description: desc, source: srcName, created_at: new Date().toISOString() });
      bot.sendMessage(chatId, '✅ Доход записан!\n\n💰 *' + sess.amount + ' EUR*\n📋 ' + srcName + '\n' + desc, { parse_mode: 'Markdown', ...getMenu(chatIdStr).reply_markup ? { reply_markup: getMenu(chatIdStr).reply_markup } : {} });
    } catch(e) { bot.sendMessage(chatId, '❌ Ошибка: ' + e.message, getMenu(chatIdStr)); }
    sessions[chatId] = null;
    return;
  }

  // ── ПАКЕТНЫЙ ВВОД ДОХОДОВ — подтверждение ────────────────────────────────
  if (data === 'inc_batch_confirm') {
    if (!isAdmin(chatIdStr)) return;
    var sess = sessions[chatId];
    if (!sess || sess.step !== 'inc_batch_confirm') return;
    var entries = sess.entries || [];
    var saved = 0; var errors = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      try {
        var desc2 = (APT_NAMES[e.apartment]||e.apartment||'') + (e.checkin ? ' · ' + fmtDateShort(e.checkin) + '→' + fmtDateShort(e.checkout) : '');
        await api('create_income', { amount: e.amount, category: 'Аренда', description: desc2, source: e.source||'', created_at: (e.date ? new Date(e.date).toISOString() : new Date().toISOString()) });
        saved++;
      } catch(err) { errors.push((APT_NAMES[e.apartment]||e.apartment) + ': ' + err.message); }
    }
    var result = '✅ Записано ' + saved + ' из ' + entries.length + ' доходов';
    if (errors.length > 0) result += '\n\n❌ Ошибки:\n' + errors.join('\n');
    bot.sendMessage(chatId, result, getMenu(chatIdStr));
    sessions[chatId] = null;
    return;
  }

  if (data === 'inc_batch_cancel') {
    sessions[chatId] = null;
    bot.sendMessage(chatId, '❌ Отменено', getMenu(chatIdStr));
    return;
  }

  // ── TTLOCK КНОПКИ ────────────────────────────────────────────────────────────
  if (data.startsWith('lock_new_')) {
    if (!isAdmin(chatIdStr)) return;
    if (!TTLOCK_ENABLED) return bot.sendMessage(chatId, '⚠️ TTLock не настроен', getMenu(chatIdStr));
    // lock_new_APARTMENT|CHECKIN|CHECKOUT
    var parts = data.slice(9).split('|');
    var apt = parts[0]; var checkin = parts[1]; var checkout = parts[2];
    if (!apt || !checkin || !checkout) return bot.sendMessage(chatId, '❌ Нет данных для создания кода');
    try {
      await bot.sendMessage(chatId, '🔐 Создаю новый код...');
      var result = await ttlock.createGuestCode(apt, checkin, checkout, false, null);
      await notifyLockCode(result, { id: null, checkin_date: checkin, checkout_date: checkout, apartment: apt });
      // Создаём Guest Portal
      try {
        var portalR2 = await api('create_guest_portal', {
          apartment: apt,
          checkin_date: checkin,
          checkout_date: checkout,
          door_code: result.codeDisplay,
          guests_count: 4
        });
        if (portalR2 && portalR2.url) {
          bot.sendMessage(chatId, '🌐 *Ссылка для гостей:*\n' + portalR2.url, { parse_mode: 'Markdown' });
        }
      } catch(e) { console.error('[portal]', e.message); }
    } catch(e) { bot.sendMessage(chatId, '❌ Ошибка TTLock: ' + e.message); }
    return;
  }

  // ── СВОЙ КОД ──────────────────────────────────────────────────────
  if (data.startsWith('lock_custom_')) {
    if (!isAdmin(chatIdStr)) return;
    var parts = data.slice(12).split('_');
    var apt2 = parts[0]; var checkin2 = parts[1]||''; var checkout2 = parts[2]||'';
    sessions[chatId] = { step: 'lock_custom_code', apartment: apt2, checkin: checkin2, checkout: checkout2 };
    bot.sendMessage(chatId, '🔑 Введи свой код (4 цифры):');
    return;
  }

  // ── ИНСТРУКЦИЯ ГОСТЯМ — выбор языка ──────────────────────────────
  if (data.startsWith('gm_show_')) {
    if (!isAdmin(chatIdStr)) return;
    var p = data.slice(8).split('|');
    var gmApt = p[0]; var gmCode = p[1]; var gmCheckin = p[2]||''; var gmCheckout = p[3]||'';
    var gmKey = gmStore(gmApt, gmCode, gmCheckin, gmCheckout);
    var langButtons = [
      [{ text: '🇬🇧 English', callback_data: 'gml_en_' + gmKey }],
      [{ text: '🇪🇸 Español', callback_data: 'gml_es_' + gmKey }],
      [{ text: '🇩🇪 Deutsch', callback_data: 'gml_de_' + gmKey }],
      [{ text: '🇫🇷 Français', callback_data: 'gml_fr_' + gmKey }],
      [{ text: '🇷🇺 Русский', callback_data: 'gml_ru_' + gmKey }],
      [{ text: '🇺🇦 Українська', callback_data: 'gml_ua_' + gmKey }],
    ];
    bot.sendMessage(chatId, '🌍 Выбери язык инструкции:', { reply_markup: { inline_keyboard: langButtons } });
    return;
  }

  if (data.startsWith('gml_')) {
    if (!isAdmin(chatIdStr)) return;
    var parts = data.slice(4).split('_'); var lang = parts[0]; var gmKey2 = parts[1]||'';
    var d = guestMsgStore[gmKey2];
    if (!d) { bot.sendMessage(chatId, '❌ Данные устарели. Нажми 📋 Инструкция гостям снова.'); return; }
    var validFrom2 = d.checkin ? d.checkin + 'T15:00' : '';
    var validTo2 = d.checkout ? d.checkout + 'T11:00' : '';
    var msg = buildGuestMessage(d.apt, d.code, validFrom2, validTo2, lang);
    sessions[chatId] = { step: 'gm_edit_wait', msg: msg, apt: d.apt, code: d.code, checkin: d.checkin, checkout: d.checkout, lang: lang };
    try {
      await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
        [{ text: '📤 Скопировать', callback_data: 'gm_copy_x' }],
        [{ text: '✏️ Редактировать', callback_data: 'gm_edit_x' }],
        [{ text: '🌍 Другой язык', callback_data: 'gm_show_' + d.apt + '|' + d.code + '|' + d.checkin + '|' + d.checkout }]
      ]}});
    } catch(e) {
      // Если Markdown не работает — отправляем без форматирования
      var plainMsg = msg.replace(/[*_`]/g, '');
      bot.sendMessage(chatId, plainMsg, { reply_markup: { inline_keyboard: [
        [{ text: '📤 Скопировать', callback_data: 'gm_copy_x' }],
        [{ text: '🌍 Другой язык', callback_data: 'gm_show_' + d.apt + '|' + d.code + '|' + d.checkin + '|' + d.checkout }]
      ]}});
    }
    return;
  }



  if (data.startsWith('gm_copy_')) {
    var sess = sessions[chatId];
    if (!sess || !sess.msg) return;
    // Отправляем чистый текст для копирования
    var plain = sess.msg.replace(/[*_`#]/g, '');
    bot.sendMessage(chatId, '📋 *Скопируй текст ниже и отправь гостю:*', { parse_mode: 'Markdown' });
    bot.sendMessage(chatId, plain);
    return;
  }
  if (data.startsWith('gm_edit_')) {
    var sess = sessions[chatId];
    if (!sess) return;
    sess.step = 'gm_editing';
    bot.sendMessage(chatId, '✏️ Отправь исправленный текст сообщения (или его часть которую хочешь заменить):');
    return;
  }

  // ── TTLOCK НАСТРОЙКИ ────────────────────────────────────────────────
  if (data === 'ttlock_settings') {
    if (!isAdmin(chatIdStr)) return;
    var btns = Object.keys(APT_NAMES).map(function(k) {
      return [{ text: '🏠 ' + APT_NAMES[k], callback_data: 'ttset_apt_' + k }];
    });
    btns.push([{ text: '🔢 Код Альберта: ' + albertCode, callback_data: 'ttset_albert_code' }]);
    btns.push([{ text: '◀️ Назад', callback_data: 'settings_menu' }]);
    bot.sendMessage(chatId, '🔒 *Настройки замков и апартаментов:*\n\nВыбери апартамент для настройки:', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: btns } });
    return;
  }
  if (data.startsWith('ttset_apt_')) {
    var apt = data.slice(10);
    var s = aptSettings[apt] || {};
    var info = '🏠 *' + (APT_NAMES[apt]||apt) + '*\n\n' +
      '📶 WiFi сеть: ' + (s.wifi_name||'—') + '\n' +
      '🔑 WiFi пароль: ' + (s.wifi_pass||'—') + '\n' +
      '📍 Адрес: ' + (s.address||'—') + '\n' +
      'ℹ️ Доп. инфо: ' + (s.extra||'—');
    bot.sendMessage(chatId, info, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
      [{ text: '📶 WiFi сеть', callback_data: 'ttset_wifi_name_' + apt }, { text: '🔑 WiFi пароль', callback_data: 'ttset_wifi_pass_' + apt }],
      [{ text: '📍 Адрес', callback_data: 'ttset_address_' + apt }],
      [{ text: 'ℹ️ Доп. инфо', callback_data: 'ttset_extra_' + apt }],
      [{ text: '◀️ Назад', callback_data: 'ttlock_settings' }]
    ]}});
    return;
  }
  if (data === 'ttset_albert_code') {
    sessions[chatId] = { step: 'ttset_albert_code' };
    bot.sendMessage(chatId, '🔢 Введи новый код Альберта (4+ цифр):\n\nТекущий: *' + albertCode + '*', { parse_mode: 'Markdown' });
    return;
  }
  if (data.startsWith('ttset_wifi_name_') || data.startsWith('ttset_wifi_pass_') || data.startsWith('ttset_address_') || data.startsWith('ttset_extra_')) {
    var field, apt3;
    if (data.startsWith('ttset_wifi_name_')) { field = 'wifi_name'; apt3 = data.slice(16); }
    else if (data.startsWith('ttset_wifi_pass_')) { field = 'wifi_pass'; apt3 = data.slice(16); }
    else if (data.startsWith('ttset_address_')) { field = 'address'; apt3 = data.slice(14); }
    else { field = 'extra'; apt3 = data.slice(11); }
    var labels = { wifi_name: 'WiFi сеть', wifi_pass: 'WiFi пароль', address: 'Адрес', extra: 'Доп. инфо' };
    sessions[chatId] = { step: 'ttset_field', field: field, apt: apt3 };
    bot.sendMessage(chatId, '✏️ Введи новое значение для *' + labels[field] + '* (' + (APT_NAMES[apt3]||apt3) + '):', { parse_mode: 'Markdown' });
    return;
  }

  if (data.startsWith('lock_extend_')) {
    if (!isAdmin(chatIdStr)) return;
    var parts = data.slice(12).split('_');
    var apt = parts[0]; var code = parts[1];
    sessions[chatId] = { step: 'lock_extend', apartment: apt, code: code };
    bot.sendMessage(chatId, '⏰ *Продление кода ' + code + '*\n\nВыбери или введи своё значение:',
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
        [{ text: '+30 мин', callback_data: 'lock_ext_min_' + apt + '_' + code + '_30' },
         { text: '+1 час', callback_data: 'lock_ext_hr_' + apt + '_' + code + '_1' },
         { text: '+3 часа', callback_data: 'lock_ext_hr_' + apt + '_' + code + '_3' }],
        [{ text: '+1 день', callback_data: 'lock_ext_day_' + apt + '_' + code + '_1' },
         { text: '+2 дня', callback_data: 'lock_ext_day_' + apt + '_' + code + '_2' },
         { text: '+7 дней', callback_data: 'lock_ext_day_' + apt + '_' + code + '_7' }],
        [{ text: '📅 До 13:00 сегодня', callback_data: 'lock_ext_today13_' + apt + '_' + code }],
        [{ text: '✏️ Ввести своё время/дату', callback_data: 'lock_ext_custom_' + apt + '_' + code }],
        [{ text: '❌ Отмена', callback_data: 'noop' }]
      ]}});
    return;
  }

  // ── ПРОДЛЕНИЕ — быстрые кнопки ──────────────────────────────────
  if (data.startsWith('lock_ext_min_') || data.startsWith('lock_ext_hr_') || data.startsWith('lock_ext_day_') || data.startsWith('lock_ext_today13_')) {
    if (!isAdmin(chatIdStr)) return;
    var newEndMs;
    var apt, code, label;
    if (data.startsWith('lock_ext_min_')) {
      var p = data.slice(13).split('_'); apt = p[0]; code = p[1]; var mins = parseInt(p[2]);
      newEndMs = Date.now() + mins * 60 * 1000; label = mins + ' мин';
    } else if (data.startsWith('lock_ext_hr_')) {
      var p = data.slice(12).split('_'); apt = p[0]; code = p[1]; var hrs = parseInt(p[2]);
      newEndMs = Date.now() + hrs * 3600 * 1000; label = hrs + ' ч';
    } else if (data.startsWith('lock_ext_day_')) {
      var p = data.slice(13).split('_'); apt = p[0]; code = p[1]; var days = parseInt(p[2]);
      newEndMs = Date.now() + days * 86400 * 1000; label = days + ' дн';
    } else {
      var p = data.slice(17).split('_'); apt = p[0]; code = p[1];
      var t = new Date(); t.setHours(13, 0, 0, 0); newEndMs = t.getTime(); label = 'сегодня 13:00';
    }
    try {
      await bot.sendMessage(chatId, '⏰ Продлеваю код ' + code + ' на ' + label + '...');
      var newEnd = new Date(newEndMs);
      var startMs = Date.now() - 60000;
      var aptName = APT_NAMES[apt] || apt;
      var lockKeys = ttlock.APT_LOCKS[apt] || [apt];
      var results = [];
      for (var i = 0; i < lockKeys.length; i++) {
        var lock = ttlock.LOCKS[lockKeys[i]];
        if (!lock) continue;
        try {
          var r = await ttlock.createPasscode(lock.lockId, code, startMs, newEndMs, 'Extended');
          results.push('✅ ' + lock.name);
        } catch(e2) { results.push('❌ ' + (lock.name||lockKeys[i]) + ': ' + e2.message); }
      }
      var endStr = newEnd.toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
      bot.sendMessage(chatId, '✅ Код *' + code + '* продлён на ' + label + '!\n🏠 ' + aptName + '\n⏰ До: ' + endStr + '\n' + results.join('\n'), { parse_mode: 'Markdown' });
    } catch(e) { bot.sendMessage(chatId, '❌ Ошибка: ' + e.message, getMenu(chatIdStr)); }
    sessions[chatId] = null;
    return;
  }
  if (data.startsWith('lock_ext_custom_')) {
    if (!isAdmin(chatIdStr)) return;
    var p = data.slice(16).split('_'); var apt = p[0]; var code = p[1];
    sessions[chatId] = { step: 'lock_extend', apartment: apt, code: code };
    bot.sendMessage(chatId, '✏️ Введи своё время продления:\n\n*Примеры:*\n• `+2ч` или `+120мин` — на время\n• `25.04 18:00` — до конкретной даты/времени\n• `25.04` — до 13:00 указанной даты', { parse_mode: 'Markdown' });
    return;
  }

  if (data.startsWith('lock_del_')) {
    if (!isAdmin(chatIdStr)) return;
    if (!TTLOCK_ENABLED) return bot.sendMessage(chatId, '⚠️ TTLock не настроен', getMenu(chatIdStr));
    var apt = data.slice(9);
    sessions[chatId] = { step: 'lock_del_confirm', apartment: apt };
    bot.sendMessage(chatId, '🗑 Удалить все активные коды для *' + (APT_NAMES[apt]||apt) + '*?\n\nЭто отключит доступ гостей!', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[
        { text: '✅ Да, удалить', callback_data: 'lock_del_confirm_' + apt },
        { text: '❌ Отмена', callback_data: 'noop' }
      ]]}
    });
    return;
  }

  if (data.startsWith('lock_del_confirm_')) {
    if (!isAdmin(chatIdStr)) return;
    if (!TTLOCK_ENABLED) return bot.sendMessage(chatId, '⚠️ TTLock не настроен', getMenu(chatIdStr));
    var apt = data.slice(17);
    var lockKeys = ttlock.APT_LOCKS[apt] || [apt];
    var results = [];
    for (var i = 0; i < lockKeys.length; i++) {
      var lock = ttlock.LOCKS[lockKeys[i]];
      if (!lock || !lock.lockId) continue;
      try {
        var codes = await ttlock.getPasscodes(lock.lockId);
        for (var j = 0; j < codes.length; j++) {
          if (codes[j].keyboardPwdType === 3) { // timed
            await ttlock.deletePasscode(lock.lockId, codes[j].keyboardPwdId);
          }
        }
        results.push('✅ ' + lock.name);
      } catch(e) { results.push('❌ ' + (lock.name||lockKeys[i]) + ': ' + e.message); }
    }
    bot.sendMessage(chatId, '🗑 Коды удалены:\n' + results.join('\n'), getMenu(chatIdStr));
    return;
  }
});

// ── ТЕКСТОВЫЕ СООБЩЕНИЯ ───────────────────────────────────────────
bot.on('message', async function(msg) {
  if (!msg.text) return; if (msg.text.startsWith('/')) return;
  var chatId=msg.chat.id; var chatIdStr=String(chatId); var text=msg.text.trim(); var firstName=msg.from.first_name||'Пользователь';
  var menuTexts=['📅 Расписание и запись','📅 Расписание','📋 Мои смены','🧺 Грязное бельё','🧹 Начать уборку','✅ Уборка окончена','❓ Помощь','🏊 Спа','📋 Задания','📅 Период','🚚 Альберт забрал','✨ Альберт привёз','🚚 Забрал бельё','✨ Привёз чистое','📊 История','💰 Взаиморасчёты','📦 Остатки','💰 Финансы','📊 Отчёты'];
  // Точное совпадение с кнопками меню — пропускаем (обрабатывается onText)
  if (text === '🔍 Найти' || text === '📊 Отчёты') return;
  if(menuTexts.some(function(m){return text.includes(m);}))return;

  // Группа стирки — парсинг сообщений Альберта
  if(isLaundryGroup(chatIdStr)){
    if(String(msg.from.id)===ALBERT_CHAT_ID){
      try{var parsed=await parseAlbertMessage(text);if(parsed.type==='delivery'&&parsed.items&&Object.values(parsed.items).some(function(v){return v>0;})){var costR=null;try{costR=await api('calculate_laundry_cost',{items:parsed.items});}catch(e){}var txt='Альберт привёз:\n\n'+formatAlbertItems(parsed.items);if(costR&&costR.data)txt+='\n\n💰 Стоимость: *'+costR.data.total.toFixed(2)+' EUR* (с НДС)';txt+='\n\nПодтверждаем?';sessions[chatId]={step:'albert_delivery_items',items:parsed.items};bot.sendMessage(chatId,txt,{parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'✅ Подтвердить',callback_data:'albert_confirm'},{text:'✏️ Исправить',callback_data:'noop'}]]}});}else if(parsed.type==='pickup'){bot.sendMessage(chatId,'🚚 Альберт забирает бельё — фиксируем.',{reply_markup:{inline_keyboard:[[{text:'✅ Подтвердить',callback_data:'apick_both'}]]}});}
      }catch(e){}
    }
    return;
  }

  // Голосовая команда — редактирование текстом
  if (sessions[chatId] && sessions[chatId].step === 'voice_edit') {
    var cmd = await parseVoiceCommand(text, scheduleCache);
    if (cmd.action === 'unknown') {
      try {
        var roleVe = isAlbert(chatIdStr) ? 'albert' : 'admin';
        var answerVe = await aiHelper(text, roleVe);
        bot.sendMessage(chatId, answerVe, getMenu(chatIdStr));
      } catch(e) {
        bot.sendMessage(chatId, '❓ Не понял: "' + text + '"', getMenu(chatIdStr));
      }
      sessions[chatId] = null; return;
    }
    sessions[chatId] = { step: 'voice_confirm', cmd: cmd, originalText: text };
    bot.sendMessage(chatId, '🎤 Понял:\n\n*' + cmd.confirm_text + '*\n\nВсё верно?', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
      [{ text: '✅ Выполнить', callback_data: 'vc_confirm' }, { text: '❌ Отмена', callback_data: 'vc_cancel' }]
    ]}});
    return;
  }

  // Период текстом
  if(sessions[chatId]&&sessions[chatId].step==='set_period'){sessions[chatId]=null;await showPeriodBookings(chatId,chatIdStr,text);return;}

  // Добавление типа задания
  if(sessions[chatId]&&sessions[chatId].step==='task_add'){var taskTypes=loadTaskTypes();var isNumber=text.toLowerCase().includes('(число)');var name=text.replace(/\(число\)/gi,'').trim();var key='custom_'+Date.now();taskTypes.push({key:key,name:name,type:isNumber?'number':'boolean'});saveTaskTypes(taskTypes);if(sessions[chatId].tasks)sessions[chatId].tasks.push({key:key,name:name,type:isNumber?'number':'boolean',enabled:false,value:isNumber?1:undefined});sessions[chatId].step='task_form';bot.sendMessage(chatId,'✅ "'+name+'" добавлено!');if(sessions[chatId].slotId||sessions[chatId].bookingId){var form=buildTaskForm(sessions[chatId]);bot.sendMessage(chatId,form.text,{reply_markup:{inline_keyboard:form.buttons}});}return;}

  // Комментарий к брони
  if(sessions[chatId]&&sessions[chatId].step==='bk_comment'){var bookingId=sessions[chatId].bookingId;var comment=text.toLowerCase()==='удалить'?'':text;try{await api('update_booking_task',{booking_id:bookingId,task_key:'comment',value:comment});bot.sendMessage(chatId,comment?'✅ Комментарий сохранён.':'✅ Комментарий удалён.',getMenu(chatIdStr));}catch(e){bot.sendMessage(chatId,'Ошибка: '+e.message,getMenu(chatIdStr));}sessions[chatId]=null;return;}

  // Замена уборщицы
  // ── ПРОДЛЕНИЕ КОДА — свой ввод ──────────────────────────────────
  if (sessions[chatId] && sessions[chatId].step === 'lock_extend') {
    var sess = sessions[chatId];
    var input = text.trim();
    var newEndMs = null;
    var label = '';

    // +Nч или +Nчас
    var hrMatch = input.match(/^\+?(\d+)\s*(ч|час|h)/i);
    // +Nмин
    var minMatch = input.match(/^\+?(\d+)\s*(мин|min|м)/i);
    // +Nд или +Nдн
    var dayMatch = input.match(/^\+?(\d+)\s*(д|дн|day)/i);
    // DD.MM HH:MM или DD.MM.YYYY HH:MM
    var dateTimeMatch = input.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\s*(\d{1,2}):(\d{2})/);
    // DD.MM или DD.MM.YYYY
    var dateMatch = input.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?/);

    if (hrMatch) {
      var hrs = parseInt(hrMatch[1]);
      newEndMs = Date.now() + hrs * 3600000;
      label = hrs + ' ч';
    } else if (minMatch) {
      var mins = parseInt(minMatch[1]);
      newEndMs = Date.now() + mins * 60000;
      label = mins + ' мин';
    } else if (dayMatch) {
      var days = parseInt(dayMatch[1]);
      newEndMs = Date.now() + days * 86400000;
      label = days + ' дн';
    } else if (dateTimeMatch) {
      var d = new Date(
        parseInt(dateTimeMatch[3]||new Date().getFullYear()),
        parseInt(dateTimeMatch[2])-1,
        parseInt(dateTimeMatch[1]),
        parseInt(dateTimeMatch[4]),
        parseInt(dateTimeMatch[5])
      );
      newEndMs = d.getTime(); label = input;
    } else if (dateMatch) {
      var d = new Date(
        parseInt(dateMatch[3]||new Date().getFullYear()),
        parseInt(dateMatch[2])-1,
        parseInt(dateMatch[1]),
        13, 0, 0
      );
      newEndMs = d.getTime(); label = input + ' 13:00';
    }

    if (!newEndMs || isNaN(newEndMs)) {
      bot.sendMessage(chatId, '❌ Не понял формат. Примеры: `+2ч`, `+90мин`, `+3д`, `25.04 18:00`, `25.04`', { parse_mode: 'Markdown' });
      return;
    }

    sessions[chatId] = null;
    try {
      await bot.sendMessage(chatId, '⏰ Продлеваю до ' + label + '...');
      var startMs = Date.now() - 60000;
      var lockKeys = ttlock.APT_LOCKS[sess.apartment] || [sess.apartment];
      var results = [];
      for (var i = 0; i < lockKeys.length; i++) {
        var lock = ttlock.LOCKS[lockKeys[i]];
        if (!lock) continue;
        try {
          await ttlock.createPasscode(lock.lockId, sess.code, startMs, newEndMs, 'Extended');
          results.push('✅ ' + lock.name);
        } catch(e2) { results.push('❌ ' + (lock.name||lockKeys[i]) + ': ' + e2.message); }
      }
      var endStr = new Date(newEndMs).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
      bot.sendMessage(chatId, '✅ Код *' + sess.code + '* продлён!\n⏰ До: ' + endStr + '\n' + results.join('\n'), { parse_mode: 'Markdown' });
    } catch(e) { bot.sendMessage(chatId, '❌ Ошибка: ' + e.message, getMenu(chatIdStr)); }
    return;
  }

  // ── РЕДАКТИРОВАНИЕ СООБЩЕНИЯ ГОСТЮ ──────────────────────────────
  if (sessions[chatId] && sessions[chatId].step === 'gm_editing') {
    var sess = sessions[chatId];
    sess.msg = text; // заменяем текст целиком
    var plain = text.replace(/[*_`#]/g, '');
    sess.step = 'gm_edit_wait';
    bot.sendMessage(chatId, '✅ Текст обновлён! Отправь гостю:', { reply_markup: { inline_keyboard: [
      [{ text: '📤 Скопировать', callback_data: 'gm_copy_edited' }],
      [{ text: '✏️ Редактировать ещё', callback_data: 'gm_edit_edited' }]
    ]}});
    bot.sendMessage(chatId, text);
    return;
  }

  // ── ИЗМЕНЕНИЕ КОДА АЛЬБЕРТА ──────────────────────────────────────
  if (sessions[chatId] && sessions[chatId].step === 'ttset_albert_code') {
    var newCode = text.trim().replace(/\D/g,'');
    if (newCode.length < 4) { bot.sendMessage(chatId, '❌ Код должен быть минимум 4 цифры'); return; }
    albertCode = newCode;
    try {
      var as = JSON.parse(require('fs').readFileSync('./apt_settings.json','utf8') || '{}');
      as.albert_code = newCode;
      require('fs').writeFileSync('./apt_settings.json', JSON.stringify(as, null, 2));
    } catch(e) { require('fs').writeFileSync('./apt_settings.json', JSON.stringify({albert_code: newCode}, null, 2)); }
    bot.sendMessage(chatId, '✅ Код Альберта обновлён: *' + newCode + '*', { parse_mode: 'Markdown', ...getMenu(chatIdStr) });
    sessions[chatId] = null;
    return;
  }

  // ── НАСТРОЙКИ АПАРТАМЕНТА ────────────────────────────────────────
  if (sessions[chatId] && sessions[chatId].step === 'ttset_field') {
    var sess = sessions[chatId];
    if (!aptSettings[sess.apt]) aptSettings[sess.apt] = {};
    aptSettings[sess.apt][sess.field] = text.trim();
    saveAptSettings();
    var labels2 = { wifi_name: 'WiFi сеть', wifi_pass: 'WiFi пароль', address: 'Адрес', extra: 'Доп. инфо' };
    bot.sendMessage(chatId, '✅ *' + labels2[sess.field] + '* обновлено для ' + (APT_NAMES[sess.apt]||sess.apt) + '!\n\nНовое значение: ' + text.trim(), { parse_mode: 'Markdown', ...getMenu(chatIdStr) });
    sessions[chatId] = null;
    return;
  }

  if (sessions[chatId] && sessions[chatId].step === 'lock_custom_code') {
    var sess = sessions[chatId];
    var customCode = text.replace(/\D/g, '').slice(0, 6);
    if (!customCode || customCode.length < 4) {
      bot.sendMessage(chatId, '❌ Код должен быть минимум 4 цифры. Попробуй ещё раз:');
      return;
    }
    sessions[chatId] = null;
    try {
      var times = ttlock.getCodeTimes(sess.checkin, sess.checkout);
      bot.sendMessage(chatId, '🔐 Создаю код ' + customCode + '...');
      var result = await ttlock.createGuestCode(sess.apartment, sess.checkin, sess.checkout, false, customCode);
      await notifyLockCode(result, { checkin_date: sess.checkin, checkout_date: sess.checkout, apartment: sess.apartment });
    } catch(e) {
      bot.sendMessage(chatId, '❌ Ошибка: ' + e.message, getMenu(chatIdStr));
    }
    return;
  }

  if(sessions[chatId]&&sessions[chatId].step==='replace_cleaner_manual'){var slotId=sessions[chatId].slotId;try{await api('replace_cleaner',{slot_id:slotId,new_cleaner_name:text,cleaner_name:text,cleaner_telegram_id:''});bot.sendMessage(chatId,'✅ Назначена: '+text,getMenu(chatIdStr));}catch(e){bot.sendMessage(chatId,'Ошибка: '+e.message,getMenu(chatIdStr));}sessions[chatId]=null;return;}

  // ── ВВОД СУММЫ ДОХОДА ПО БРОНИ ──
  if (sessions[chatId] && sessions[chatId].step === 'inc_amount') {
    var amount = parseFloat(text.replace(',','.').replace(/[^\d.]/g,''));
    if (isNaN(amount) || amount <= 0) { bot.sendMessage(chatId, 'Введи сумму числом, например: *450*', { parse_mode: 'Markdown' }); return; }
    sessions[chatId].amount = amount;
    var sess = sessions[chatId];
    // Если источник уже известен из брони — сохраняем сразу без лишнего вопроса
    var knownSrc = sess.source ? String(sess.source).toLowerCase() : '';
    var srcMap = { airbnb: 'Airbnb', holidu: 'Holidu', booking: 'Booking.com', direct: 'Прямое', other: 'Другое' };
    var srcKey = knownSrc.includes('holidu') ? 'holidu' : knownSrc.includes('airbnb') ? 'airbnb' : knownSrc.includes('booking') ? 'booking' : knownSrc.includes('direct') ? 'direct' : '';
    if (srcKey) {
      var srcName = srcMap[srcKey];
      var desc = (APT_NAMES[sess.apartment]||sess.apartment||'') + (sess.checkin ? ' · ' + fmtDateShort(sess.checkin) + '→' + fmtDateShort(sess.checkout) : '');
      try {
        await api('create_income', { amount: amount, category: 'Аренда', description: desc, source: srcName, created_at: new Date().toISOString() });
        bot.sendMessage(chatId, '✅ Доход записан!\n\n💰 *' + amount + ' EUR*\n📋 ' + srcName + '\n' + desc, { parse_mode: 'Markdown', ...getMenu(chatIdStr) });
      } catch(e) { bot.sendMessage(chatId, '❌ Ошибка: ' + e.message, getMenu(chatIdStr)); }
      sessions[chatId] = null;
    } else {
      // Источник неизвестен — спрашиваем
      sessions[chatId].step = 'inc_source';
      var srcButtons = [
        [{ text: '🏠 Airbnb', callback_data: 'inc_src_'+(sess.bookingId||'0')+'_airbnb' },
         { text: '🌊 Holidu', callback_data: 'inc_src_'+(sess.bookingId||'0')+'_holidu' }],
        [{ text: '📘 Booking', callback_data: 'inc_src_'+(sess.bookingId||'0')+'_booking' },
         { text: '🤝 Прямое', callback_data: 'inc_src_'+(sess.bookingId||'0')+'_direct' }],
        [{ text: '📌 Другое', callback_data: 'inc_src_'+(sess.bookingId||'0')+'_other' }]
      ];
      bot.sendMessage(chatId, '💰 Сумма: *' + amount + ' EUR*\n\nОткуда бронь?', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: srcButtons } });
    }
    return;
  }

  // Сумма счёта (после загрузки файла)
  if(sessions[chatId]&&sessions[chatId].step==='inv_upload_amount'){var sess=sessions[chatId];var amount=parseFloat(text.replace(',','.'));if(isNaN(amount)){bot.sendMessage(chatId,'Введи сумму числом, например: 191.72');return;}try{await api('save_laundry_invoice',{invoice_number:'INV-'+new Date().toISOString().slice(0,10),period_from:new Date(new Date().setDate(1)).toISOString().split('T')[0],period_to:new Date().toISOString().split('T')[0],invoice_amount:amount,calculated_amount:0,items:{},invoice_file_url:sess.fileUrl||''});bot.sendMessage(chatId,'✅ Счёт *'+amount+' EUR* сохранён!',{parse_mode:'Markdown'});await notifyAdmins('🧾 Счёт Альберта: *'+amount+' EUR*',{parse_mode:'Markdown'});}catch(e){bot.sendMessage(chatId,'Ошибка: '+e.message,getMenu(chatIdStr));}sessions[chatId]=null;return;}

  // Сумма оплаты
  if(sessions[chatId]&&sessions[chatId].step==='inv_pay_amount'){var amount=parseFloat(text.replace(',','.'));if(isNaN(amount)){bot.sendMessage(chatId,'Введи сумму числом');return;}sessions[chatId]={step:'inv_pay_file',amount:amount};bot.sendMessage(chatId,'✅ Сумма: '+amount+' EUR\nОтправь фото или PDF подтверждения:');return;}

  // Распределение чистого
  if(sessions[chatId]&&sessions[chatId].step==='dist_input'){var qty=parseInt(text);if(isNaN(qty)){bot.sendMessage(chatId,'Введи число');return;}var apt=sessions[chatId].apt;try{await api('save_pending',{from_location:'clean_stock',to_location:apt,items:[{item_type:'sheet_set',quantity:qty}],source:'distribution'});bot.sendMessage(chatId,'✅ '+qty+' компл. → '+(apt.includes('salvador')?'Сальвадор':'Оазисы'),getMenu(chatIdStr));}catch(e){bot.sendMessage(chatId,'Ошибка: '+e.message,getMenu(chatIdStr));}sessions[chatId]=null;return;}

  // Бельё текстом
  var lr=parseLinenText(text);
  if(lr){try{await api('save_pending',{cleaner_name:firstName,from_location:lr.apt,to_location:APT_DIRTY[lr.apt],apartment_name:APT_NAMES[lr.apt],source:'telegram_text',chat_id:chatIdStr,items:lr.items,original_message:text,needs_clarification:false});await notifyIrina('🧺 Бельё\n'+APT_NAMES[lr.apt]+'\nОт: '+firstName+'\n'+lr.summary);bot.sendMessage(chatId,'✅ Принято!\n\n'+lr.summary,getMenu(chatIdStr));}catch(e){bot.sendMessage(chatId,'Ошибка: '+e.message,getMenu(chatIdStr));}return;}

  // Для админов — парсим текст как команду через тот же AI что и голос
  if (!isGroup(msg) && isAdmin(chatIdStr)) {
    try {
      await bot.sendMessage(chatId, '🔍 Анализирую...');
      var cmd = await parseVoiceCommand(text, scheduleCache);
      if (cmd.action !== 'unknown') {
        var noConfirmTxt = ['smart_query','query_today','query_tomorrow','query_week','query_apartment_schedule','query_free_slots','query_next_checkin','query_spa_bookings','query_gap_bookings','query_bookings_count','query_occupancy','query_cleaner_next','query_cleaner_stats','query_all_cleaners','query_unpaid_cleanings','query_unpaid','query_active_cleaning','query_albert_balance','query_albert_settlements','query_albert_history','query_albert_last_visit','query_laundry_cost','query_expenses','query_income','query_income_vs_expenses','query_income_by_apartment','query_month_summary','query_financial_summary','query_stock_balance','query_movement_summary','query_tasks','query_tasks_summary','query_bookings_summary','show_period','sync_ical','lock_query','add_batch_income','lock_extend'];
        if (noConfirmTxt.indexOf(cmd.action) !== -1) {
          return await executeVoiceCommand(chatId, chatIdStr, cmd);
        }
        // Действия — просим подтверждения
        sessions[chatId] = { step: 'voice_confirm', cmd: cmd };
        bot.sendMessage(chatId, '📝 Понял команду:\n\n*' + cmd.confirm_text + '*\n\nВсё верно?',
          { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
            [{ text: '✅ Выполнить', callback_data: 'vc_confirm' }, { text: '❌ Отмена', callback_data: 'vc_cancel' }],
            [{ text: '✏️ Изменить', callback_data: 'vc_edit' }]
          ]}});
        return;
      }
    } catch(e) { console.error('[text-cmd]', e.message); }
    // Если не распознал как команду — AI помощник
    try {
      var answer = await aiHelper(text, 'admin');
      bot.sendMessage(chatId, answer, getMenu(chatIdStr));
    } catch(e) {}
    return;
  }

  // AI помощник для уборщиц и Альберта
  if (!isGroup(msg)) {
    var isQ = text.length > 5 && (text.includes('?') || text.toLowerCase().includes('как') || text.toLowerCase().includes('где') || text.toLowerCase().includes('что') || text.toLowerCase().includes('почему'));
    if (isQ || isAlbert(chatIdStr)) {
      try { await bot.sendMessage(chatId, '🤔 Думаю...'); var role = isAlbert(chatIdStr) ? 'albert' : 'cleaner'; var answer = await aiHelper(text, role); bot.sendMessage(chatId, answer, getMenu(chatIdStr)); } catch(e) {}
      return;
    }
  }

  if (!isGroup(msg)) bot.sendMessage(chatId, 'Используй кнопки меню или напиши вопрос!', getMenu(chatIdStr));
});

// ── ПАРСИНГ БЕЛЬЯ ─────────────────────────────────────────────────
function parseLinenText(text) {
  var lower=text.toLowerCase();var apt=null;
  if(/о1|о 1|оаз1|оазис\s*1|piral.?1/.test(lower))apt='piral_1';
  else if(/о2|о 2|оаз2|оазис\s*2|piral.?2/.test(lower))apt='piral_2';
  else if(/гран|grand|grande/.test(lower))apt='grande';
  else if(/сал|salv|salvador/.test(lower))apt='salvador';
  if(!apt)return null;
  var km=[{key:'sheets',words:['просты','простын']},{key:'duvet_covers',words:['пододея','пododеял']},{key:'pillowcases',words:['наволоч']},{key:'large_towels',words:['бол.пол','больш','бол пол']},{key:'small_towels',words:['мал.пол','малы','мал пол','полотенц']},{key:'kitchen_towels',words:['кух.пол','кухон']},{key:'rugs',words:['коврик']},{key:'beach_mat',words:['пляж']},{key:'mattress_pad',words:['наматрас']}];
  var items=[];var summary=APT_NAMES[apt]+':\n';
  for(var i=0;i<km.length;i++){var k=km[i];for(var j=0;j<k.words.length;j++){var idx=lower.indexOf(k.words[j]);if(idx!==-1){var after=lower.slice(idx).match(/\d+/);var qty=after?parseInt(after[0]):1;var n=LINEN_ITEMS.find(function(l){return l.key===k.key;});items.push({item_type:k.key,name:n?n.name:k.key,quantity:qty});summary+='• '+(n?n.name:k.key)+': '+qty+' шт\n';break;}}}
  if(items.length===0)return null;
  return{apt:apt,items:items,summary:summary};
}

// ── НАПОМИНАНИЯ ───────────────────────────────────────────────────
function msUntilTime(hour,minute){var now=new Date();var target=new Date(now);target.setHours(hour,minute||0,0,0);if(target<=now)target.setDate(target.getDate()+1);return target-now;}
function scheduleDaily(hour,minute,fn){setTimeout(function(){fn();setInterval(fn,24*60*60*1000);},msUntilTime(hour,minute));}

scheduleDaily(10,0,async function(){
  try{var r=await api('get_schedule');if(!r.data)return;var in3=new Date();in3.setDate(in3.getDate()+3);var in3Str=in3.toISOString().split('T')[0];var slots3=r.data.filter(function(s){return s.checkout_date&&s.checkout_date.slice(0,10)===in3Str&&s.cleaner_name;});
  for(var i=0;i<slots3.length;i++){var s=slots3[i];var apt=APT_NAMES[s.apartment]||s.apartment;
  if(s.cleaner_telegram_id){try{await bot.sendMessage(s.cleaner_telegram_id,'📅 Напоминание!\n\nЧерез 3 дня уборка:\n*'+apt+'*\n\nДата: *'+fmtDateShort(s.checkout_date)+'*\n\nЗапиши в календарь!',{parse_mode:'Markdown'});}catch(e){}}}}catch(e){console.error('[reminder-3d]',e.message);}
});

scheduleDaily(19,0,async function(){
  try{var r=await api('get_schedule');if(!r.data)return;var tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);var tomorrowStr=tomorrow.toISOString().split('T')[0];var tmr=r.data.filter(function(s){return s.checkout_date&&s.checkout_date.slice(0,10)===tomorrowStr;});
  for(var i=0;i<tmr.length;i++){var s=tmr[i];var apt=APT_NAMES[s.apartment]||s.apartment;var src=fmtSource(s.source);
  if(s.cleaner_name){if(s.cleaner_telegram_id){try{await bot.sendMessage(s.cleaner_telegram_id,'📅 Напоминание!\n\nЗавтра уборка:\n'+apt+'\n\nНажми "Начать уборку" когда придёшь!');}catch(e){}}
  await notifyAdmins('🏠 Завтра на *'+apt+'* убирает *'+s.cleaner_name+'*'+(src?' ('+src+')':'')+'\n\n⚠️ Эммочка, не забудь нажать *«ЗП выдана»* после выплаты.',{parse_mode:'Markdown'});}
  else{await notifyAdmins('⚠️ Завтра выезд без уборщицы!\n'+(src?src+' ':'')+apt);}}}catch(e){console.error('[reminder-19]',e.message);}
});

scheduleDaily(8,0,async function(){
  try{var r=await api('get_schedule');if(!r.data)return;var tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);var tomorrowStr=tomorrow.toISOString().split('T')[0];var tmr=r.data.filter(function(s){return s.checkout_date&&s.checkout_date.slice(0,10)===tomorrowStr;});
  for(var i=0;i<tmr.length;i++){var s=tmr[i];var apt=APT_NAMES[s.apartment]||s.apartment;
  if(s.cleaner_name){if(s.cleaner_telegram_id){try{await bot.sendMessage(s.cleaner_telegram_id,'Напоминание!\n\nЗавтра уборка:\n'+apt+'\n\nНе забудь нажать "Начать уборку"!');}catch(e){}}
  await notifyIrina('Напоминание: завтра убирает '+s.cleaner_name+'\n'+apt+(s.cleaner_telegram_id?'':'\n⚠️ Нет Telegram ID — напомни лично!'));}
  else{await notifyAdmins('⚠️ Завтра выезд без уборщицы!\n'+apt);}}}catch(e){console.error('[reminder-8]',e.message);}
});

scheduleDaily(8,30,async function(){
  try{var r=await api('get_schedule');if(!r.data)return;var todayStr=new Date().toISOString().split('T')[0];var today=r.data.filter(function(s){return s.checkout_date&&s.checkout_date.slice(0,10)===todayStr;});
  for(var i=0;i<today.length;i++){var s=today[i];var apt=APT_NAMES[s.apartment]||s.apartment;
  var nextB=null;try{var nb=await api('get_next_booking_for_apt',{apartment:s.apartment,checkout_date:s.checkout_date});nextB=nb.data;}catch(e){}
  var guestsCleaner = getGuestsForCleaner(s, r.data);
  var msg2='Доброе утро!\n\nСегодня уборка:\n'+apt+'\n👥 Постели на *'+guestsCleaner+'* гостей\n\nНажми "Начать уборку" когда придёшь!';
  if(s.special_instructions)msg2+='\n\n📋 Задание:\n'+fmtInstructions(s.special_instructions);
  if(nextB&&nextB.gap_days<=2&&nextB.tasks){var arr=typeof nextB.tasks==='string'?JSON.parse(nextB.tasks):nextB.tasks;var et=Array.isArray(arr)?arr.filter(function(t){return t.enabled;}).map(function(t){return t.type==='number'?t.name+': '+t.value:t.name;}).join('\n'):'';if(et)msg2+='\n\n🏠 Подготовь для следующих гостей ('+fmtDateShort(nextB.checkin_date)+'):\n'+et;}
  if(s.cleaner_telegram_id){try{await bot.sendMessage(s.cleaner_telegram_id,msg2);}catch(e){}}
  else if(s.cleaner_name){await notifyAdmins('⚠️ Сегодня убирает '+s.cleaner_name+' на '+apt+'\nНет Telegram ID!');}
  else{await notifyAdmins('⚠️ Сегодня выезд без уборщицы!\n'+apt);}}}catch(e){console.error('[reminder-8:30]',e.message);}
});

// Проверка новых броней каждые 5 минут
setInterval(async function(){
  try {
    var r = await api('get_new_bookings_to_notify');
    if (r.data && r.data.length > 0) {
      var hasNew = false;
      for (var i = 0; i < r.data.length; i++) {
        var booking = r.data[i];
        var bid = String(booking.id);
        if (seenBookingIds.has(bid)) continue; // уже уведомляли
        hasNew = true;
        seenBookingIds.add(bid);
        var apt = APT_NAMES[booking.apartment] || booking.apartment;
        var src = fmtSource(booking.source);
        var gapText = booking.gap_days != null ? '\n⏱ Gap: *' + booking.gap_days + ' дней*' : '';
        var text = '🆕 Новая бронь ' + (src || '') + '\n\n🏠 *' + apt + '*\n📅 Заезд: ' + fmtDateShort(booking.checkin_date) + ' · Выезд: ' + fmtDateShort(booking.checkout_date) + '\n👥 ' + (booking.guests_count || '?') + ' гостей' + gapText;
        var admins = getAdmins();
        for (var j = 0; j < admins.length; j++) {
          try {
            await bot.sendMessage(admins[j], text, {
              parse_mode: 'Markdown',
              reply_markup: { inline_keyboard: [[
                { text: '📋 Назначить задание', callback_data: 'nb_assign_' + booking.id },
                { text: '💰 Указать стоимость', callback_data: 'inc_add_' + booking.id }
              ]]}
            });
          } catch(e) {}
        }
      }
      if (hasNew) { saveSeenBookings(); pruneSeenBookings(); }
    }
  } catch(e) { console.error('[notify]', e.message); }
}, 5*60*1000);

// Напоминание Альберту если нет детализации 48ч
setInterval(async function(){
  try{var r=await api('get_pending_deliveries_unconfirmed');if(!r.data)return;var now=new Date();r.data.forEach(async function(d){var hoursAgo=(now-new Date(d.created_at))/1000/3600;if(hoursAgo>=48&&d.type==='incoming'){try{await bot.sendMessage(LAUNDRY_GROUP_ID,'⏰ Альберт, привет!\n'+fmtDateShort(d.date)+' ты привёз бельё, но детализация ещё не получена.\nНапиши пожалуйста сколько и чего привёз!');}catch(e){}}});}catch(e){}
},6*60*60*1000);

// ── ЕЖЕДНЕВНОЕ УТРЕННЕЕ СООБЩЕНИЕ В ГРУППУ (10:00) ──────────────
function scheduleDailyMorning() {
  var now = new Date();
  var next = new Date();
  next.setHours(10, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  var delay = next - now;
  setTimeout(async function() {
    try {
      await sendMorningFreeSlots();
    } catch(e) { console.error('[morning]', e.message); }
    scheduleDailyMorning(); // запланировать следующий день
  }, delay);
}

async function sendMorningFreeSlots() {
  if (!LAUNDRY_GROUP_ID) return;
  var today = new Date().toISOString().split('T')[0];
  var in10 = new Date(Date.now() + 10*24*60*60*1000).toISOString().split('T')[0];
  var r = await api('get_schedule');
  var freeSlots = (r.data || []).filter(function(s) {
    var d = s.checkout_date ? s.checkout_date.slice(0,10) : '';
    return d >= today && d <= in10 && !s.cleaner_name;
  });
  if (freeSlots.length === 0) return; // нет свободных — не пишем
  
  var text = '🌅 *Доброе утро!*\n\nЕсть свободные смены — кто может, запишитесь:\n';
  var buttons = [];
  freeSlots.forEach(function(s) {
    var src = fmtSource(s.source) || '';
    var apt = APT_NAMES[s.apartment] || s.apartment;
    var date = fmtDateShort(s.checkout_date);
    var guests = s.next_guests || s.guests_count || '?';
    buttons.push([{ text: (src?src+' ':'')+apt+' · '+date+' · '+guests+'г', callback_data: 'su_'+s.id }]);
  });
  
  bot.sendMessage(LAUNDRY_GROUP_ID, text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
}

scheduleDailyMorning();

setInterval(async function(){try{var r=await api('auto_confirm_pending');if(r.auto_confirmed>0)console.log('[auto] Подтверждено: '+r.auto_confirmed);}catch(e){console.error('[auto]',e.message);}},30*60*1000);

// ── УТРЕННЕЕ СООБЩЕНИЕ О СВОБОДНЫХ СМЕНАХ (10:00) ────────────────
setInterval(async function() {
  try {
    var now = new Date();
    if (now.getHours() !== 10 || now.getMinutes() > 5) return;
    var todayStr = now.toISOString().split('T')[0];
    var in10Str = new Date(now.getTime() + 10*24*60*60*1000).toISOString().split('T')[0];
    var r = await api('get_schedule');
    var freeSlots = (r.data||[]).filter(function(s) {
      var d = s.checkout_date ? s.checkout_date.slice(0,10) : '';
      return d >= todayStr && d <= in10Str && !s.cleaner_name;
    });
    if (freeSlots.length === 0) return;
    var buttons = freeSlots.map(function(s) {
      var aptShort = APT_SHORT[s.apartment]||s.apartment;
      var src = fmtSource(s.source);
      return [{ text: (src?src+' ':'')+aptShort+' · '+fmtDateShort(s.checkout_date), callback_data: 'su_'+s.id }];
    });
    var CLEANING_GROUP_ID = process.env.CLEANING_GROUP_ID || LAUNDRY_GROUP_ID;
    if (CLEANING_GROUP_ID) {
      bot.sendMessage(CLEANING_GROUP_ID,
        '🌅 *Доброе утро!*\n\nЕсть свободные смены на ближайшие 10 дней.\nЗапишитесь если можете:',
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } }
      );
    }
  } catch(e) { console.error('[morning]', e.message); }
}, 60*1000); // проверяем каждую минуту

// ── СУББОТНЕЕ НАПОМИНАНИЕ ЭММОЧКЕ (12:00) ────────────────────────
setInterval(async function() {
  try {
    var now = new Date();
    if (now.getDay() !== 6 || now.getHours() !== 12 || now.getMinutes() > 5) return;
    var r = await api('get_unpaid_cleanings');
    if (!r.data || Object.keys(r.data).length === 0) return;
    var text = '💰 *Неподтверждённые выплаты уборщицам:*\n\n';
    var buttons = [];
    var allAssignmentIds = [];
    Object.entries(r.data).forEach(function(entry) {
      var name = entry[0]; var info = entry[1];
      text += '👤 *' + name + '* — ' + info.shifts + ' смен · ' + info.total + '€\n';
      info.details.forEach(function(d) {
        text += '  • ' + d.date + ' · ' + d.apartment + ' · ' + d.amount + '€\n';
      });
      text += '\n';
    });
    buttons.push([{ text: '✅ Подтвердить все', callback_data: 'emma_confirm_all' }]);
    // Добавляем кнопки индивидуального подтверждения
    Object.entries(r.data).forEach(function(entry) {
      var name = entry[0]; var info = entry[1];
      info.details.forEach(function(d) {
        if (d.assignment_id) {
          buttons.push([{ text: '✓ ' + name + ' · ' + d.date + ' · ' + d.apartment, callback_data: 'ec_one_' + d.assignment_id }]);
        }
      });
    });
    if (EMMA_CHAT_ID) {
      bot.sendMessage(EMMA_CHAT_ID, text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
    }
    if (OWNER_CHAT_ID) {
      bot.sendMessage(OWNER_CHAT_ID, '📋 Эммочке отправлено напоминание о выплатах', getMenu(String(OWNER_CHAT_ID)));
    }
  } catch(e) { console.error('[saturday]', e.message); }
}, 60*1000);


// ── СИНХРОНИЗАЦИЯ ICAL ───────────────────────────────────────────
async function syncIcal(chatId, chatIdStr) {
  try {
    if (chatId) bot.sendMessage(chatId, 'Синхронизирую расписание...');
    var r = await axios.post(
      SUPABASE_URL + '/functions/v1/bot-api',
      { action: 'sync_ical' },
      { headers: { 'x-bot-secret': BOT_SECRET, 'Content-Type': 'application/json' }, timeout: 60000 }
    );
    r = r.data;
    var added = (r.data && r.data.added) || 0;
    var removed = (r.data && r.data.removed) || 0;
    var updated = (r.data && r.data.updated) || 0;
    var msg = 'Синхронизация завершена!\n+ Новых: ' + added + '\n- Отменённых: ' + removed + '\n~ Обновлённых: ' + updated;
    if (chatId) bot.sendMessage(chatId, msg, getMenu(chatIdStr));
    return r.data;
  } catch(e) {
    console.error('[sync_ical]', e.message);
    if (chatId) bot.sendMessage(chatId, 'Ошибка синхронизации: ' + e.message, getMenu(chatIdStr));
    return null;
  }
}
bot.onText(/\/sync/, async function(msg) {
  var chatId = msg.chat.id; var chatIdStr = String(chatId);
  if (!isAdmin(chatIdStr)) return;
  await syncIcal(chatId, chatIdStr);
});
setInterval(async function() {
  try { await syncIcal(null, null); } catch(e) { console.error('[auto-sync]', e.message); }
}, 15 * 60 * 1000);


// ── ГОЛОСОВЫЕ КОМАНДЫ ────────────────────────────────────────────
async function transcribeVoice(fileUrl) {
  try {
    var resp = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    var audioBuffer = Buffer.from(resp.data);
    // Используем multipart вручную без form-data
    var boundary = '----FormBoundary' + Date.now();
    var header = Buffer.from(
      '--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="file"; filename="voice.ogg"\r\n' +
      'Content-Type: audio/ogg\r\n\r\n'
    );
    var modelPart = Buffer.from(
      '\r\n--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n' +
      '--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="language"\r\n\r\nru\r\n' +
      '--' + boundary + '--\r\n'
    );
    var body = Buffer.concat([header, audioBuffer, modelPart]);
    var r = await axios.post('https://api.openai.com/v1/audio/transcriptions', body, {
      headers: {
        'Authorization': 'Bearer ' + OPENAI_KEY,
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': body.length
      },
      timeout: 30000
    });
    return r.data.text || '';
  } catch(e) { console.error('[whisper]', e.message); return null; }
}

// ── ВСПОМОГАТЕЛЬНАЯ: период из команды ────────────────────────────
// ── AI РАЗБОР ПАЧКИ ДОХОДОВ ──────────────────────────────────────────────────
async function parseBatchIncomes(text) {
  try {
    var today = new Date().toISOString().split('T')[0];
    var prompt =
      'Разбери текст с несколькими доходами от аренды. Сегодня: ' + today + '.\n' +
      'Апартаменты: piral_1=Оазис1/Оазис 1, piral_2=Оазис2/Оазис 2, grande=Гранде, salvador=Сальвадор\n' +
      'Источники: airbnb=Airbnb, holidu=Holidu, booking=Booking.com, direct=Прямое, other=Другое\n\n' +
      'Верни ТОЛЬКО JSON массив:\n' +
      '[{"apartment":"piral_1","checkin":"2026-04-06","checkout":"2026-04-10","amount":320,"source":"airbnb"},\n' +
      ' {"apartment":"salvador","checkin":"2026-04-12","checkout":"2026-04-15","amount":280,"source":"holidu"}]\n\n' +
      'Правила:\n' +
      '- Если год не указан — угадывай от сегодняшней даты ' + today + '\n' +
      '- Если источник не указан — source:"other"\n' +
      '- amount всегда число без EUR\n' +
      '- Верни ТОЛЬКО JSON массив, без пояснений\n\n' +
      'Текст: "' + text + '"';

    var r = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-haiku-4-5-20251001', max_tokens: 800,
      messages: [{ role: 'user', content: prompt }]
    }, { headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } });

    var raw = r.data.content[0].text.replace(/```json|```/g,'').trim();
    return JSON.parse(raw);
  } catch(e) { console.error('[batch_income]', e.message); return []; }
}

function periodFromCmd(cmd) {
  if (cmd.date_from && cmd.date_to) return { from: cmd.date_from, to: cmd.date_to };
  var now = new Date(); var y = now.getFullYear(); var m = now.getMonth();
  if (cmd.period === 'last_month') {
    var lm = m === 0 ? 12 : m; var ly = m === 0 ? y-1 : y;
    return { from: isoDate(ly,lm,1), to: isoDate(ly,lm,lastDayOf(ly,lm)) };
  }
  if (cmd.period === 'this_month') return { from: isoDate(y,m+1,1), to: isoDate(y,m+1,lastDayOf(y,m+1)) };
  if (cmd.period === 'this_year') return { from: isoDate(y,1,1), to: isoDate(y,12,31) };
  if (cmd.period === 'today') { var t=now.toISOString().split('T')[0]; return { from: t, to: t }; }
  if (cmd.period === 'yesterday') { var yd=new Date(now); yd.setDate(yd.getDate()-1); var ydStr=yd.toISOString().split('T')[0]; return { from: ydStr, to: ydStr }; }
  if (cmd.period === 'this_week') { var dow=now.getDay()||7; var mon=new Date(now); mon.setDate(now.getDate()-dow+1); return { from: mon.toISOString().split('T')[0], to: now.toISOString().split('T')[0] }; }
  if (cmd.period === 'last_7') { var d=new Date(now); d.setDate(d.getDate()-7); return { from: d.toISOString().split('T')[0], to: now.toISOString().split('T')[0] }; }
  if (cmd.period === 'last_30') { var d=new Date(now); d.setDate(d.getDate()-30); return { from: d.toISOString().split('T')[0], to: now.toISOString().split('T')[0] }; }
  // default: this month
  return { from: isoDate(y,m+1,1), to: isoDate(y,m+1,lastDayOf(y,m+1)) };
}

async function parseVoiceCommand(text, scheduleData) {
  try {
    var today = new Date().toISOString().split('T')[0];
    var scheduleInfo = (scheduleData || []).slice(0,20).map(function(s){
      return (s.checkout_date||'').slice(0,10) + ' ' + (s.apartment||'') + ' ' + (s.cleaner_name||'свободно');
    }).join('\n');

    var systemPrompt =
      'Ты помощник ERA Apartments. Сегодня: ' + today + '.\n' +
      'Апартаменты: piral_1=Оазис1, piral_2=Оазис2, grande=Гранде, salvador=Сальвадор\n' +
      'Задания: guests=Гостей, beds=Кроватей, spa=Спа, crib=Детская кроватка, highchair=Детский стульчик, extra_linen=Доп.бельё, extra_towels=Доп.полотенца\n' +
      'Периоды: today=сегодня, yesterday=вчера, this_week=эта неделя, this_month=этот месяц, last_month=прошлый месяц, this_year=этот год, last_7=последние 7 дней, last_30=последние 30 дней. Конкретные даты: date_from/date_to YYYY-MM-DD.\n' +
      'Смены:\n' + scheduleInfo + '\n\n' +
      'Верни ТОЛЬКО JSON одного из форматов:\n\n' +

      // УПРАВЛЕНИЕ СМЕНАМИ
      '{"action":"update_guests","apartment":"grande","date":"2026-07-05","value":12,"confirm_text":"Гранде 05.07 · Гостей: 12"}\n' +
      '{"action":"add_task","apartment":"piral_1","date":"2026-04-12","tasks":["spa","crib"],"guests":4,"confirm_text":"Оазис1 12.04 · Спа+Кроватка"}\n' +
      '{"action":"remove_task","apartment":"grande","date":"2026-07-05","tasks":["crib"],"confirm_text":"Гранде 05.07 · Убрать кроватку"}\n' +
      '{"action":"clear_tasks","apartment":"grande","date":"2026-07-05","confirm_text":"Гранде 05.07 · Очистить задания"}\n' +
      '{"action":"replace_cleaner","apartment":"salvador","date":"2026-07-13","cleaner_name":"Оля","confirm_text":"Сальвадор 13.07 · Уборщица: Оля"}\n' +
      '{"action":"remove_cleaner","apartment":"salvador","date":"2026-04-13","confirm_text":"Сальвадор 13.04 · Снять уборщицу"}\n' +
      '{"action":"add_booking","apartment":"grande","checkin":"2026-08-01","checkout":"2026-08-05","guests":4,"confirm_text":"Гранде 01-05.08 · 4 гостя"}\n' +
      '{"action":"delete_booking","apartment":"grande","date":"2026-08-01","confirm_text":"Удалить бронь Гранде 01.08"}\n' +

      // ПРОСМОТР РАСПИСАНИЯ
      '{"action":"show_period","date_from":"2026-07-01","date_to":"2026-07-31","confirm_text":"Брони за июль"}\n' +
      '{"action":"query_today","confirm_text":"Что сегодня"}\n' +
      '{"action":"query_tomorrow","confirm_text":"Что завтра"}\n' +
      '{"action":"query_week","confirm_text":"Расписание на неделю"}\n' +
      '{"action":"query_apartment_schedule","apartment":"salvador","confirm_text":"Расписание Сальвадора"}\n' +
      '{"action":"query_free_slots","confirm_text":"Свободные смены без уборщицы"}\n' +
      '{"action":"query_next_checkin","apartment":"grande","confirm_text":"Следующий заезд в Гранде"}\n' +
      '{"action":"query_spa_bookings","confirm_text":"Все брони со спа"}\n' +
      '{"action":"query_gap_bookings","confirm_text":"Брони с малым промежутком"}\n' +
      '{"action":"query_bookings_count","period":"this_month","apartment":"","confirm_text":"Количество броней за этот месяц"}\n' +
      '{"action":"query_occupancy","period":"this_month","confirm_text":"Загруженность апартаментов за этот месяц"}\n' +
      '{"action":"sync_ical","confirm_text":"Синхронизировать календарь"}\n' +

      // УБОРЩИЦЫ
      '{"action":"query_cleaner_next","cleaner_name":"Марьяна","confirm_text":"Следующая смена Марьяны"}\n' +
      '{"action":"query_cleaner_stats","cleaner_name":"Марьяна","period":"last_month","confirm_text":"Статистика Марьяны за прошлый месяц"}\n' +
      '{"action":"query_expenses","period":"today","category":"","confirm_text":"Расходы за сегодня"}\n' +
      '{"action":"query_expenses","period":"yesterday","category":"","confirm_text":"Расходы за вчера"}\n' +
      '{"action":"query_income","period":"today","confirm_text":"Доходы за сегодня"}\n' +
      '{"action":"query_income","period":"this_week","confirm_text":"Доходы за эту неделю"}\n' +
      '{"action":"query_all_cleaners","period":"last_month","confirm_text":"Все уборщицы за прошлый месяц"}\n' +
      '{"action":"query_all_cleaners","period":"this_month","confirm_text":"Рейтинг уборщиц за апрель — кто больше всего работает"}\n' +
      '{"action":"query_unpaid_cleanings","confirm_text":"Неоплаченные уборки"}\n' +
      '{"action":"query_active_cleaning","confirm_text":"Кто сейчас убирает"}\n' +

      // АЛЬБЕРТ
      '{"action":"query_albert_balance","confirm_text":"Остатки у Альберта"}\n' +
      '{"action":"query_albert_settlements","confirm_text":"Взаиморасчёты с Альбертом"}\n' +
      '{"action":"query_albert_history","confirm_text":"История Альберта"}\n' +
      '{"action":"query_albert_last_visit","confirm_text":"Последний визит Альберта"}\n' +
      '{"action":"query_laundry_cost","period":"last_month","confirm_text":"Стирка за прошлый месяц"}\n' +

      // ФИНАНСЫ
      '{"action":"add_expense","amount":150,"category":"Хозяйственные товары","description":"Моющие средства для уборки","confirm_text":"Расход 150 EUR · Хозяйственные товары · Моющие средства"}\n' +
      '{"action":"add_expense","amount":50,"category":"Расходники для гостей","description":"Шампунь и гель для душа","confirm_text":"Расход 50 EUR · Расходники для гостей"}\n' +
      '{"action":"add_income","amount":500,"category":"Аренда","description":"Airbnb","confirm_text":"Доход 500 EUR · Аренда"}\n' +
      '{"action":"query_expenses","period":"last_month","category":"","confirm_text":"Расходы за прошлый месяц"}\n' +
      '{"action":"query_income","period":"this_month","apartment":"","confirm_text":"Доходы за этот месяц"}\n' +
      '{"action":"query_income_vs_expenses","period":"this_month","confirm_text":"Доходы vs расходы за этот месяц"}\n' +
      '{"action":"query_income_by_apartment","period":"this_month","confirm_text":"Доход по апартаментам за этот месяц"}\n' +
      '{"action":"query_month_summary","period":"last_month","confirm_text":"Итоги прошлого месяца"}\n' +
      '{"action":"query_financial_summary","period":"last_month","cash_register":"all","confirm_text":"Финансовая сводка за прошлый месяц"}\n' +
      '{"action":"query_financial_summary","period":"this_month","cash_register":"emma","confirm_text":"Касса Эммочки за этот месяц"}\n' +
      '{"action":"query_unpaid","confirm_text":"Кому должны за уборки"}\n' +
      '{"action":"query_stock_balance","location":"","confirm_text":"Остатки белья по всем локациям"}\n' +
      '{"action":"query_stock_balance","location":"albert_laundry","confirm_text":"Остатки у Альберта"}\n' +
      '{"action":"query_movement_summary","period":"last_month","confirm_text":"Движение белья за прошлый месяц"}\n' +
      '{"action":"create_movement","from_location":"dirty_linen_piral","to_location":"albert_laundry","items":{"sheets":3,"large_towels":4},"notes":"","confirm_text":"Перемещение: Пераль грязное → Альберт · Простыни 3, Полотенца 4"}\n' +
      '{"action":"create_task","title":"Купить моющие","description":"","due_date":"2026-04-15","is_public":true,"confirm_text":"Задача: Купить моющие · срок 15.04"}\n' +
      '{"action":"query_tasks","status":"open","confirm_text":"Открытые задачи"}\n' +
      '{"action":"query_tasks_summary","confirm_text":"Сводка по задачам"}\n' +
      '{"action":"query_bookings_summary","period":"this_month","apartment":"","confirm_text":"Статистика броней за этот месяц"}\n' +

      '{"action":"unknown","confirm_text":"Не понял команду"}\n\n' +

      'ПРАВИЛА:\n' +
      '- Год угадывай от ' + today + '. Даты YYYY-MM-DD.\n' +
      '- "сегодня/завтра/неделя" → query_today/query_tomorrow/query_week\n' +
      '- "следующая смена Х" → query_cleaner_next\n' +
      '- "смены/заработок Х" → query_cleaner_stats\n' +
      '- "все уборщицы / кто больше всего / кто чаще / рейтинг уборщиц" → query_all_cleaners (любой сравнительный вопрос про уборщиц = query_all_cleaners, НЕ query_cleaner_stats)\n' +
      '- "стирка/прачечная" → query_laundry_cost\n' +
      '- "сегодня" → period:"today", "вчера" → period:"yesterday", "эта неделя" → period:"this_week"\n' +
      '- "расходы/касса" → query_expenses\n' +
      '- "доход/выручка" → query_income\n' +
      '- "итоги месяца" → query_month_summary\n' +
      '- "финансовая сводка/баланс кассы" → query_financial_summary\n' +
      '- "кому должны/долг уборщицам" → query_unpaid\n' +
      '- "остатки белья/где бельё" → query_stock_balance\n' +
      '- "движение белья/сколько постирали" → query_movement_summary\n' +
      '- "переместить бельё/отправить в стирку" → create_movement. Локации: piral_1, piral_2, salvador, dirty_linen_piral, dirty_linen_salvador, piral_storage→clean_linen_piral, salvador_closet→clean_linen_salvador, albert_laundry, purchase, damaged\n' +
      '- "создать задачу/напомни/поручи" → create_task\n' +
      '- "список задач/что надо сделать" → query_tasks\n' +
      '- "сколько задач/статус задач" → query_tasks_summary\n' +
      '- "статистика броней/загруженность" → query_bookings_summary\n' +
      '- "касса Эммочки" → query_financial_summary с cash_register:"emma"\n' +
      '- "общая касса" → query_financial_summary с cash_register:"main"\n' +

      '// ДОХОДЫ ОТ БРОНЕЙ\n' +
      '{"action":"add_booking_income","apartment":"piral_1","checkin":"2026-04-06","checkout":"2026-04-10","amount":320,"source":"airbnb","confirm_text":"Оазис 1 · 06-10.04 · 320 EUR · Airbnb"}\n' +
      '{"action":"add_batch_income","entries":[{"apartment":"piral_1","checkin":"2026-04-06","checkout":"2026-04-10","amount":320,"source":"airbnb"},{"apartment":"salvador","checkin":"2026-04-12","checkout":"2026-04-15","amount":280,"source":"holidu"}],"confirm_text":"Записать 2 дохода: 320+280 EUR"}\n' +
      '- "отметь спа Оазис 1 5 мая 100 евро" → {"action":"add_spa","apartment":"piral_1","checkin":"2026-05-05","amount":100,"confirm_text":"Спа Оазис 1 · 05.05 · 100 EUR"}\n' +
      '- Одна бронь → add_booking_income\n' +
      '- Доход за спа: "спа Оазис 1 5 мая 100 евро" → add_income с category=Спа, apartment=piral_1, находим бронь по дате\n' +
      '- Несколько броней в одном сообщении → add_batch_income\n' +
      '- Источники: airbnb, holidu, booking, direct, other\n\n' + +
      '{"action":"lock_create","apartment":"piral_1","checkin":"2026-08-01","checkout":"2026-08-05","confirm_text":"Создать код для Оазис 1 · 01.08 15:00 → 05.08 11:00"}\n' +
      '{"action":"lock_create","apartment":"grande","checkin":"2026-08-01","checkout":"2026-08-05","custom_code":"4821","confirm_text":"Создать код 4821 для Гранде · 01.08 15:00 → 05.08 11:00"}\n' +
      '{"action":"lock_query","apartment":"salvador","confirm_text":"Текущий код Сальвадора"}\n' +
      '{"action":"lock_delete","apartment":"piral_2","confirm_text":"Удалить код Оазис 2"}\n' +
      '{"action":"lock_extend","apartment":"salvador","extend_until":"2026-04-13T13:00","confirm_text":"Продлить код Сальвадора до 13:00"}\n' +
      '{"action":"lock_extend","apartment":"piral_1","extend_minutes":120,"confirm_text":"Продлить код Оазис 1 на 2 часа"}\n' +
      '{"action":"lock_extend","apartment":"grande","extend_days":2,"confirm_text":"Продлить код Гранде на 2 дня"}\n' +
      '{"action":"lock_extend_albert","apartment":"salvador","extend_until":"2026-04-13T18:00","confirm_text":"Продлить код Альберта на Сальвадоре до 18:00"}\n' +

      '- "создай код для" / "сгенерируй код" → lock_create. Если нестандартное время → добавь checkin_time/checkout_time (HH:MM). Парсить: \"с 10 утра\"=checkin_time:\"10:00\", \"до 5 вечера\"=checkout_time:\"17:00\", \"до часу дня\"=checkout_time:\"13:00\", \"до полудня\"=checkout_time:\"12:00\". По умолчанию 15:00/11:00. checkout_time указывает время В ДЕНЬ ВЫЕЗДА по броне\n' +
      '- "какой код у" / "код для замка" → lock_query\n' +
      '- "удали код" / "отключи доступ" → lock_delete\n' +
      '- "продли код" / "продлить доступ" / "до [время]" → lock_extend. "продли Альберту" / "продли код Альберта" → lock_extend_albert (apartment=апартамент где Альберт). Парсить: "до часу дня"=13:00, "до 13:00"=13:00, "на 2 часа"=extend_minutes:120, "до завтра"=extend_days:1. extend_until в ISO формате если указано конкретное время\n' +
      '- Если указан конкретный код (цифры) → добавь custom_code\n' +
      '- Если не указан апартамент → apartment:""\n\n' +
      '- Если вопрос аналитический, сравнительный или не подходит ни под один паттерн → smart_query\n' +
      '- верни ТОЛЬКО JSON';

    var r = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-haiku-4-5-20251001', max_tokens: 500,
      messages: [{ role: 'user', content: systemPrompt + '\n\nКоманда: "' + text + '"' }]
    }, { headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } });

    var raw = r.data.content[0].text.replace(/```json|```/g,'').trim();
    var parsed = JSON.parse(raw);
    // Если unknown — отправляем в smart_query
    if (parsed.action === 'unknown') {
      parsed = { action: 'smart_query', query: text, confirm_text: '🔍 Умный поиск: "' + text + '"' };
    }
    return parsed;
  } catch(e) { console.error('[voice_parse]', e.message); return { action: 'unknown', confirm_text: 'Ошибка разбора команды' }; }
}


async function executeVoiceCommand(chatId, chatIdStr, cmd) {
  try {

    // ── ИЗМЕНИТЬ ГОСТЕЙ ──
    if (cmd.action === 'update_guests') {
      var slot = findSlot(scheduleCache, cmd.apartment, cmd.date);
      if (!slot) return bot.sendMessage(chatId, '❌ Смена не найдена: ' + (APT_NAMES[cmd.apartment]||cmd.apartment) + ' ' + cmd.date, getMenu(chatIdStr));
      await api('update_slot', { slot_id: slot.id, next_guests: cmd.value });
      if (slot) slot.next_guests = cmd.value;
      bot.sendMessage(chatId, '✅ ' + cmd.confirm_text, getMenu(chatIdStr));

    // ── ДОБАВИТЬ ЗАДАНИЯ ──
    } else if (cmd.action === 'add_task') {
      var slot = findSlot(scheduleCache, cmd.apartment, cmd.date);
      if (!slot) return bot.sendMessage(chatId, '❌ Смена не найдена', getMenu(chatIdStr));
      var tasks = initTasksFromSlot(slot);
      (cmd.tasks||[]).forEach(function(k){ var t=tasks.find(function(x){return x.key===k;}); if(t){t.enabled=true; if(t.type==='number'&&!t.value)t.value=1;} });
      if (cmd.guests) { var gt=tasks.find(function(t){return t.key==='guests';}); if(gt){gt.enabled=true;gt.value=cmd.guests;} }
      var jsonVal = tasksToJson(tasks);
      await api('update_slot', { slot_id: slot.id, special_instructions: jsonVal });
      if (slot) slot.special_instructions = jsonVal;
      bot.sendMessage(chatId, '✅ ' + cmd.confirm_text, getMenu(chatIdStr));

    // ── УБРАТЬ КОНКРЕТНЫЕ ЗАДАНИЯ ──
    } else if (cmd.action === 'remove_task') {
      var slot = findSlot(scheduleCache, cmd.apartment, cmd.date);
      if (!slot) return bot.sendMessage(chatId, '❌ Смена не найдена', getMenu(chatIdStr));
      var tasks = initTasksFromSlot(slot);
      (cmd.tasks||[]).forEach(function(k){ var t=tasks.find(function(x){return x.key===k;}); if(t) t.enabled=false; });
      var jsonVal = tasksToJson(tasks);
      await api('update_slot', { slot_id: slot.id, special_instructions: jsonVal });
      if (slot) slot.special_instructions = jsonVal;
      bot.sendMessage(chatId, '✅ ' + cmd.confirm_text, getMenu(chatIdStr));

    // ── ОЧИСТИТЬ ВСЕ ЗАДАНИЯ ──
    } else if (cmd.action === 'clear_tasks') {
      var slot = findSlot(scheduleCache, cmd.apartment, cmd.date);
      if (!slot) return bot.sendMessage(chatId, '❌ Смена не найдена', getMenu(chatIdStr));
      await api('update_slot', { slot_id: slot.id, special_instructions: '' });
      if (slot) slot.special_instructions = '';
      bot.sendMessage(chatId, '✅ ' + cmd.confirm_text, getMenu(chatIdStr));

    // ── ЗАМЕНИТЬ УБОРЩИЦУ ──
    } else if (cmd.action === 'replace_cleaner') {
      var slot = findSlot(scheduleCache, cmd.apartment, cmd.date);
      if (!slot) return bot.sendMessage(chatId, '❌ Смена не найдена', getMenu(chatIdStr));
      await api('replace_cleaner', { slot_id: slot.id, new_cleaner_name: cmd.cleaner_name, cleaner_name: cmd.cleaner_name, cleaner_telegram_id: '' });
      bot.sendMessage(chatId, '✅ ' + cmd.confirm_text, getMenu(chatIdStr));

    // ── СНЯТЬ УБОРЩИЦУ ──
    } else if (cmd.action === 'remove_cleaner') {
      var slot = findSlot(scheduleCache, cmd.apartment, cmd.date);
      if (!slot) return bot.sendMessage(chatId, '❌ Смена не найдена', getMenu(chatIdStr));
      await api('delete_slot', { slot_id: slot.id });
      bot.sendMessage(chatId, '✅ ' + cmd.confirm_text, getMenu(chatIdStr));

    // ── ПОКАЗАТЬ ПЕРИОД ──
    } else if (cmd.action === 'show_period') {
      await showPeriodBookingsDates(chatId, chatIdStr, cmd.date_from, cmd.date_to, cmd.confirm_text);

    // ── РАСПИСАНИЕ АПАРТА ──
    } else if (cmd.action === 'query_apartment_schedule') {
      var aptSlots = scheduleCache.filter(function(s){ return !cmd.apartment || s.apartment === cmd.apartment; }).slice(0,10);
      if (aptSlots.length === 0) return bot.sendMessage(chatId, 'Нет предстоящих смен', getMenu(chatIdStr));
      var text = '📅 ' + cmd.confirm_text + '\n\n';
      aptSlots.forEach(function(s){ text += (fmtSource(s.source)?fmtSource(s.source)+' ':'')+(APT_NAMES[s.apartment]||s.apartment)+' · '+fmtDateShort(s.checkout_date)+' · '+(s.next_guests||s.guests_count||'?')+'г · '+(s.cleaner_name||'свободно')+(s.special_instructions?' 📋':'')+'\n'; });
      bot.sendMessage(chatId, text, getMenu(chatIdStr));

    // ── ДОБАВИТЬ РАСХОД ──
    } else if (cmd.action === 'add_expense') {
      var rawCat = cmd.category || '';
      var mappedCat = mapExpenseCategory(rawCat, cmd.description);
      var rawDesc = cmd.description || '';
      // Формируем description как "Категория: описание"
      var fullDesc = mappedCat && rawDesc ? mappedCat + ': ' + rawDesc : mappedCat || rawDesc || 'Расход';
      var expenseResult = await api('create_expense', { amount: cmd.amount, description: fullDesc, source: 'telegram_voice', created_at: new Date().toISOString() });
      var expenseId = expenseResult && expenseResult.data && expenseResult.data.id ? expenseResult.data.id : null;
      // Сохраняем в сессию для возможного прикрепления чека
      sessions[chatId] = { step: 'expense_await_receipt', expenseId: expenseId, amount: cmd.amount, description: fullDesc, mappedCat: mappedCat };
      bot.sendMessage(chatId,
        '✅ Расход записан!\n💸 *' + cmd.amount + ' EUR* · ' + mappedCat + (rawDesc ? '\n' + rawDesc : ''),
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
          [{ text: '📎 Прикрепить чек', callback_data: 'expense_attach_receipt' }],
          [{ text: '✅ Готово', callback_data: 'expense_no_receipt' }]
        ]}}
      );

    // ── ДОБАВИТЬ ДОХОД СПА ──
    } else if (cmd.action === 'add_spa') {
      var spaApt = normalizeApt(cmd.apartment);
      var spaDate = cmd.checkin || cmd.date || '';
      // Ищем бронь по дате заезда
      var spaSched = null;
      if (spaDate && scheduleCache) {
        spaSched = scheduleCache.find(function(s) {
          return normalizeApt(s.apartment) === spaApt && s.checkin_date && s.checkin_date.slice(0,10) === spaDate.slice(0,10);
        });
      }
      var spaDesc = 'Спа · ' + (APT_NAMES[spaApt]||spaApt) + (spaSched ? ' · ' + fmtDateShort(spaSched.checkin_date) + '→' + fmtDateShort(spaSched.checkout_date) : (spaDate?' · '+fmtDateShort(spaDate):''));
      await api('create_income', { amount: cmd.amount, category: 'Спа', description: spaDesc, source: 'telegram_voice', created_at: new Date().toISOString() });
      bot.sendMessage(chatId, '✅ Доход Спа записан!\ n💰 ' + cmd.amount + ' EUR\ n📝 ' + spaDesc, getMenu(chatIdStr));

    // ── ДОБАВИТЬ ДОХОД ──
    } else if (cmd.action === 'add_income') {
      await api('create_income', { amount: cmd.amount, category: cmd.category||'Аренда', description: cmd.description||'', source: 'telegram_voice', created_at: new Date().toISOString() });
      bot.sendMessage(chatId, '✅ Доход записан!\n💰 ' + cmd.amount + ' EUR · ' + (cmd.category||'Аренда') + (cmd.description?'\n'+cmd.description:''), getMenu(chatIdStr));

    // ── СОЗДАТЬ БРОНЬ ──
    } else if (cmd.action === 'add_booking') {
      await api('create_booking', { apartment: cmd.apartment, checkin_date: cmd.checkin, checkout_date: cmd.checkout, guests_count: cmd.guests||1, source: 'manual' });
      bot.sendMessage(chatId, '✅ Бронь создана!\n' + cmd.confirm_text, getMenu(chatIdStr));

    // ── СТАТИСТИКА КОНКРЕТНОЙ УБОРЩИЦЫ ──
    } else if (cmd.action === 'query_cleaner_stats') {
      var name = cmd.cleaner_name || '';
      var per = periodFromCmd(cmd);
      var periodLabel = per.from.slice(8)+'.'+per.from.slice(5,7)+' — '+per.to.slice(8)+'.'+per.to.slice(5,7);
      var text = '👤 *' + name + '*\n📅 ' + periodLabel + '\n\n';
      var found = false;

      // 1. Пробуем API get_cleaner_stats
      try {
        var r = await api('get_cleaner_stats', { cleaner_name: name, date_from: per.from, date_to: per.to });
        var d = r.data || {};
        if (d.shifts > 0 || d.total_payment > 0) {
          text += '🧹 Смен: *' + (d.shifts||0) + '*\n';
          text += '💸 Заработано: *' + ((d.total_payment||d.total_earned||0)).toFixed(2) + ' EUR*\n';
          if (d.last_cleaning) text += '⬅️ Последняя: ' + fmtDateShort(d.last_cleaning) + '\n';
          if (d.next_cleaning) text += '➡️ Следующая: ' + fmtDateShort(d.next_cleaning) + '\n';
          found = true;
        }
      } catch(e) {}

      // 2. Если API вернул 0 — пробуем get_all_cleaners_stats с fuzzy match
      if (!found) {
        try {
          var ra = await api('get_all_cleaners_stats', { date_from: per.from, date_to: per.to });
          if (ra.data && ra.data.length > 0) {
            // Fuzzy match по имени
            var nameLow = name.toLowerCase();
            var matched = ra.data.filter(function(d){ return d.cleaner_name && d.cleaner_name.toLowerCase().includes(nameLow); });
            if (matched.length === 0) matched = ra.data.filter(function(d){ return d.cleaner_name && nameLow.includes(d.cleaner_name.toLowerCase().split(' ')[0]); });
            if (matched.length > 0) {
              var dm = matched[0];
              text += '🧹 Смен: *' + (dm.shifts||0) + '*\n';
              text += '💸 Заработано: *' + ((dm.total_payment||dm.total_earned||0)).toFixed(2) + ' EUR*\n';
              if (dm.last_cleaning) text += '⬅️ Последняя: ' + fmtDateShort(dm.last_cleaning) + '\n';
              if (dm.next_cleaning) text += '➡️ Следующая: ' + fmtDateShort(dm.next_cleaning) + '\n';
              found = true;
            }
          }
        } catch(e) {}
      }

      // 3. Всегда добавляем данные из scheduleCache (предстоящие смены)
      var today3c = new Date().toISOString().split('T')[0];
      var nameLow2 = name.toLowerCase();
      var cacheAll = scheduleCache.filter(function(s){ return s.cleaner_name && s.cleaner_name.toLowerCase().includes(nameLow2); });
      var cachePast = cacheAll.filter(function(s){ return s.checkout_date && s.checkout_date.slice(0,10) < today3c && s.checkout_date.slice(0,10) >= per.from; });
      var cacheUpcoming = cacheAll.filter(function(s){ return s.checkout_date && s.checkout_date.slice(0,10) >= today3c; });

      if (!found) {
        // Только кэш
        text += '🧹 Смен в периоде (кэш): *' + cachePast.length + '*\n';
        text += '📋 Предстоящих: *' + cacheUpcoming.length + '*\n';
        var totalFromCache = cachePast.length * 35;
        text += '💸 Примерно: *' + totalFromCache + ' EUR*\n';
      } else if (cacheUpcoming.length > 0) {
        text += '\n📋 Предстоящих смен: *' + cacheUpcoming.length + '*\n';
      }

      if (cacheUpcoming.length > 0) {
        text += '\nБлижайшие:\n';
        cacheUpcoming.slice(0,4).forEach(function(s){ text += '• '+(APT_NAMES[s.apartment]||s.apartment)+' '+fmtDateShort(s.checkout_date)+'\n'; });
      }
      if (!found && cachePast.length === 0 && cacheUpcoming.length === 0) {
        text += '_Нет данных за период_\n';
        text += '\nℹ️ Уборщицы в системе:\n';
        var allNames = {};
        scheduleCache.forEach(function(s){ if(s.cleaner_name) allNames[s.cleaner_name]=1; });
        Object.keys(allNames).forEach(function(n){ text += '• ' + n + '\n'; });
      }
      bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });

    // ── СЛЕДУЮЩАЯ СМЕНА УБОРЩИЦЫ ──
    } else if (cmd.action === 'query_cleaner_next') {
      var name = cmd.cleaner_name;
      var today3 = new Date().toISOString().split('T')[0];
      var upcoming = scheduleCache.filter(function(s){ return s.cleaner_name && s.cleaner_name.toLowerCase().includes(name.toLowerCase()) && s.checkout_date && s.checkout_date.slice(0,10) >= today3; });
      upcoming.sort(function(a,b){ return a.checkout_date > b.checkout_date ? 1 : -1; });
      var past = scheduleCache.filter(function(s){ return s.cleaner_name && s.cleaner_name.toLowerCase().includes(name.toLowerCase()) && s.checkout_date && s.checkout_date.slice(0,10) < today3; });
      past.sort(function(a,b){ return a.checkout_date > b.checkout_date ? -1 : 1; });
      var text = '👤 *' + name + '*\n\n';
      if (upcoming.length > 0) {
        var nx = upcoming[0];
        text += '➡️ *Следующая смена:*\n' + (APT_NAMES[nx.apartment]||nx.apartment) + ' · ' + fmtDate(nx.checkout_date) + '\n' + (nx.next_guests||nx.guests_count||'?') + ' гостей\n\n';
        text += '📋 Всего предстоящих: ' + upcoming.length + '\n';
      } else { text += '➡️ Следующих смен нет\n'; }
      if (past.length > 0) { text += '⬅️ Последняя: ' + (APT_NAMES[past[0].apartment]||past[0].apartment) + ' ' + fmtDateShort(past[0].checkout_date) + '\n'; }
      bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });

    // ── СТАТИСТИКА ВСЕХ УБОРЩИЦ ──
    } else if (cmd.action === 'query_all_cleaners') {
      var today4 = new Date().toISOString().split('T')[0];
      var per = periodFromCmd(cmd);
      var periodLabel4 = per.from.slice(8)+'.'+per.from.slice(5,7)+' — '+per.to.slice(8)+'.'+per.to.slice(5,7);
      var text = '👥 *Уборщицы · ' + periodLabel4 + '*\n\n';

      // Из API
      var apiOk = false;
      try {
        var r = await api('get_all_cleaners_stats', { date_from: per.from, date_to: per.to });
        if (r.data && r.data.length > 0) {
          // Сортируем по количеству смен (больше — первее)
          r.data.sort(function(a,b){ return (b.shifts||0)-(a.shifts||0); });
          r.data.forEach(function(d, idx4){
            var pay = (d.total_payment||d.total_earned||0);
            var medal = idx4===0?'🥇 ':idx4===1?'🥈 ':idx4===2?'🥉 ':'• ';
            text += medal + '*' + d.cleaner_name + '*\n';
            text += '  🧹 ' + (d.shifts||0) + ' смен · 💸 ' + (pay.toFixed?pay.toFixed(0):pay) + ' EUR\n';
            if (d.next_cleaning) text += '  ➡️ Следующая: ' + fmtDateShort(d.next_cleaning) + '\n';
          });
          var totalPay = r.data.reduce(function(s,d){return s+(d.total_payment||d.total_earned||0);},0);
          text += '\n💰 *Итого к выплате: ' + totalPay.toFixed(0) + ' EUR*\n';
          apiOk = true;
        }
      } catch(e) {}

      // Из кэша (предстоящие)
      if (!apiOk) {
        var byName4 = {};
        scheduleCache.forEach(function(s){
          if (!s.cleaner_name) return;
          if (!byName4[s.cleaner_name]) byName4[s.cleaner_name] = { upcoming: 0, past: 0 };
          if (s.checkout_date && s.checkout_date.slice(0,10) >= today4) byName4[s.cleaner_name].upcoming++;
          else byName4[s.cleaner_name].past++;
        });
        var names4 = Object.keys(byName4);
        if (names4.length === 0) { text += 'Нет записанных уборщиц'; }
        else { names4.forEach(function(n){ var d=byName4[n]; text += '• *'+n+'* — предстоящих: '+d.upcoming+(d.past?' · прошлых: '+d.past:'')+'\n'; }); }
      } else {
        // Добавляем предстоящие из кэша
        var upcomingByName = {};
        scheduleCache.forEach(function(s){
          if (!s.cleaner_name) return;
          if (s.checkout_date && s.checkout_date.slice(0,10) >= today4) {
            upcomingByName[s.cleaner_name] = (upcomingByName[s.cleaner_name]||0) + 1;
          }
        });
        if (Object.keys(upcomingByName).length > 0) {
          text += '\n📋 *Предстоящие:*\n';
          Object.keys(upcomingByName).forEach(function(n){ text += '• ' + n + ': ' + upcomingByName[n] + '\n'; });
        }
      }
      bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });

    // ── СТОИМОСТЬ СТИРКИ ──
    } else if (cmd.action === 'query_laundry_cost') {
      try {
        var per = periodFromCmd(cmd);
        var r = await api('get_laundry_cost_by_period', { date_from: per.from, date_to: per.to });
        var d = r.data || {};
        var text = '🧺 *' + cmd.confirm_text + '*\n';
        text += '📅 ' + per.from.slice(8)+'.'+per.from.slice(5,7) + ' — ' + per.to.slice(8)+'.'+per.to.slice(5,7) + '\n\n';
        text += '💰 Стоимость: *' + ((d.total||d.total_cost||0).toFixed?((d.total||d.total_cost||0).toFixed(2)):0) + ' EUR*\n';
        if (d.visits_count) text += '📦 Визитов Альберта: ' + d.visits_count + '\n';
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      } catch(e) {
        // Fallback: monthly summary
        var now2 = new Date(); var per = periodFromCmd(cmd);
        try {
          var r2 = await api('get_laundry_monthly_summary', { year: now2.getFullYear(), month: now2.getMonth()+(cmd.period==='last_month'?0:1) });
          var text = '🧺 *' + cmd.confirm_text + '*\n\n';
          if (r2.data && r2.data.total_cost) text += '💰 Стоимость: *' + r2.data.total_cost.toFixed(2) + ' EUR*\n';
          else text += 'Нет данных за период';
          bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
        } catch(e2) { bot.sendMessage(chatId, 'Нет данных: ' + e2.message, getMenu(chatIdStr)); }
      }

    // ── ОСТАТКИ АЛЬБЕРТА ──
    } else if (cmd.action === 'query_albert_balance') {
      try {
        var r = await api('get_albert_balance');
        var items = (r.data && r.data.items) || {};
        var text = '📦 *Остатки у Альберта:*\n\n';
        var has = Object.keys(items).some(function(k){ return items[k]>0; });
        if (!has) { text += '✅ Всё бельё у нас'; }
        else { Object.keys(items).forEach(function(k){ if(items[k]>0) text += '• ' + ruName(k) + ': ' + items[k] + ' шт\n'; }); }
        if (r.data && r.data.calculated_cost > 0) text += '\n💰 Стоимость: *' + r.data.calculated_cost.toFixed(2) + ' EUR*';
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      } catch(e) { bot.sendMessage(chatId, 'Ошибка: ' + e.message, getMenu(chatIdStr)); }

    // ── ВЗАИМОРАСЧЁТЫ С АЛЬБЕРТОМ ──
    } else if (cmd.action === 'query_albert_settlements') {
      try {
        var finBal = null; var lastInv = null; var lastPay = null;
        try { var fb = await api('get_financial_balance'); finBal = fb.data; } catch(e) {}
        try { var inv = await api('get_laundry_invoices'); lastInv = inv.data && inv.data[0]; } catch(e) {}
        var text = '💰 *Взаиморасчёты с Альбертом*\n🍍 Piña Colada ↔ 🌿 ERA\n\n';
        if (finBal) {
          var nomBal = finBal.nominal_balance || 0;
          var factBal = finBal.factual_balance || 0;
          text += '🧾 Долг ERA (по счетам): *' + (nomBal>=0?'+':'') + nomBal.toFixed(2) + ' EUR*\n';
          text += '   Выставлено: ' + (finBal.total_invoiced||0).toFixed(2) + ' · Оплачено: ' + (finBal.total_paid||0).toFixed(2) + '\n\n';
          text += '📊 Долг ERA (фактический): *' + (factBal>=0?'+':'') + factBal.toFixed(2) + ' EUR*\n';
          text += '   Постирано: ' + (finBal.total_factual||0).toFixed(2) + ' · Оплачено: ' + (finBal.total_paid||0).toFixed(2) + '\n';
          if (nomBal < 0) text += '\n💚 ERA в плюсе — аванс ' + Math.abs(nomBal).toFixed(2) + ' EUR\n';
          else if (nomBal > 0) text += '\n🔴 ERA должна Альберту ' + nomBal.toFixed(2) + ' EUR\n';
        }
        if (lastInv) {
          text += '\n🧾 Последний счёт: *' + lastInv.invoice_amount.toFixed(2) + ' EUR*';
          if (lastInv.period_from) text += ' (' + lastInv.period_from + ' — ' + (lastInv.period_to||'') + ')';
        }
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      } catch(e) { bot.sendMessage(chatId, 'Ошибка: ' + e.message, getMenu(chatIdStr)); }

    // ── ИСТОРИЯ АЛЬБЕРТА ──
    } else if (cmd.action === 'query_albert_history') {
      try {
        var r = await api('get_albert_visits', { limit: 5 });
        var visits = r.data || [];
        if (visits.length === 0) return bot.sendMessage(chatId, '📊 История визитов пуста', getMenu(chatIdStr));
        var text = '📊 *Последние визиты Альберта:*\n\n';
        visits.forEach(function(v){
          var dt = new Date(v.visited_at || v.created_at);
          text += '🍍 *' + fmtDateShort(dt.toISOString()) + ' ' + fmtTime(dt.toISOString()) + '*\n';
          if (v.delivered_cost) text += '💰 ' + v.delivered_cost.toFixed(2) + ' EUR\n';
          text += '\n';
        });
        var total = visits.reduce(function(s,v){return s+(v.delivered_cost||0);},0);
        if (total>0) text += '💰 *Итого: ' + total.toFixed(2) + ' EUR*';
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      } catch(e) { bot.sendMessage(chatId, 'Ошибка: ' + e.message, getMenu(chatIdStr)); }

    // ── РАСХОДЫ ──
    } else if (cmd.action === 'query_expenses') {
      try {
        var per = periodFromCmd(cmd);
        var r = await api('get_transactions_by_period', { date_from: per.from, date_to: per.to, type: 'expense', category: cmd.category||'', cash_register: cmd.cash_register||'all' });
        var items = r.data || [];
        var summary = r.summary || {};
        var text = '💸 *' + cmd.confirm_text + '*\n';
        text += '📅 ' + per.from.slice(8)+'.'+per.from.slice(5,7) + ' — ' + per.to.slice(8)+'.'+per.to.slice(5,7) + '\n\n';
        var total = summary.total_expense || (Array.isArray(items) ? items.reduce(function(s,t){return s+Number(t.amount||0);},0) : 0);
        text += '💰 Итого: *' + total.toFixed(2) + ' EUR*\n';
        if (Array.isArray(items) && items.length > 0) {
          text += '\nПо категориям:\n';
          var bycat = {};
          items.forEach(function(t){ var c=t.category||t.description||'Другое'; bycat[c]=(bycat[c]||0)+Number(t.amount||0); });
          Object.keys(bycat).sort(function(a,b){return bycat[b]-bycat[a];}).slice(0,8).forEach(function(c){ text += '• '+c+': '+bycat[c].toFixed(2)+' EUR\n'; });
        }
        if (Array.isArray(items) && items.length === 0) text += '_Нет расходов за период_\n';
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      } catch(e) { bot.sendMessage(chatId, 'Нет данных о расходах: ' + e.message, getMenu(chatIdStr)); }

    // ── УДАЛИТЬ БРОНЬ ──
    } else if (cmd.action === 'delete_booking') {
      var slot = cmd.apartment ? findSlot(scheduleCache, cmd.apartment, cmd.date) : scheduleCache.find(function(s){ return s.checkout_date && s.checkout_date.slice(0,10) === (cmd.date||'').slice(0,10); }) || scheduleCache.find(function(s){ return s.checkin_date && s.checkin_date.slice(0,10) === (cmd.date||'').slice(0,10); });
      if (!slot) return bot.sendMessage(chatId, '❌ Бронь не найдена', getMenu(chatIdStr));
      await api('delete_slot', { slot_id: slot.id });
      bot.sendMessage(chatId, '✅ ' + cmd.confirm_text, getMenu(chatIdStr));

    // ── ЧТО СЕГОДНЯ ──
    } else if (cmd.action === 'query_today') {
      var todayStr = new Date().toISOString().split('T')[0];
      var label = 'Сегодня ' + todayStr.slice(8)+'.'+todayStr.slice(5,7);
      var text = buildDateSummary(scheduleCache, todayStr, todayStr, label);
      bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });

    // ── ЧТО ЗАВТРА ──
    } else if (cmd.action === 'query_tomorrow') {
      var tom = new Date(); tom.setDate(tom.getDate()+1); var tomStr = tom.toISOString().split('T')[0];
      var label = 'Завтра ' + tomStr.slice(8)+'.'+tomStr.slice(5,7);
      var text = buildDateSummary(scheduleCache, tomStr, tomStr, label);
      bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });

    // ── РАСПИСАНИЕ НА НЕДЕЛЮ ──
    } else if (cmd.action === 'query_week') {
      var now5 = new Date(); var todayStr5 = now5.toISOString().split('T')[0];
      var weekEnd = new Date(now5); weekEnd.setDate(now5.getDate()+7); var weekEndStr = weekEnd.toISOString().split('T')[0];
      var text = buildDateSummary(scheduleCache, todayStr5, weekEndStr, 'Ближайшие 7 дней');
      bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });

    
    // ── СВОБОДНЫЕ СМЕНЫ ──
    } else if (cmd.action === 'query_free_slots') {
      var todayStr6 = new Date().toISOString().split('T')[0];
      var free = scheduleCache.filter(function(s){ return !s.cleaner_name && s.checkout_date && s.checkout_date.slice(0,10) >= todayStr6; }).slice(0,10);
      var text = '⚠️ *Смены без уборщицы:*\n\n';
      if (free.length === 0) { text += 'Все смены заняты ✅'; }
      else { free.forEach(function(s){ text += '• '+(APT_NAMES[s.apartment]||s.apartment)+' · '+fmtDate(s.checkout_date)+'\n'; }); }
      bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });

    // ── СЛЕДУЮЩИЙ ЗАЕЗД ──
    } else if (cmd.action === 'query_next_checkin') {
      var todayStr7 = new Date().toISOString().split('T')[0];
      var slots7 = scheduleCache.filter(function(s){ return (!cmd.apartment || s.apartment===cmd.apartment) && s.checkin_date && s.checkin_date.slice(0,10) >= todayStr7; });
      slots7.sort(function(a,b){ return a.checkin_date>b.checkin_date?1:-1; });
      if (slots7.length === 0) return bot.sendMessage(chatId, 'Нет ближайших заездов', getMenu(chatIdStr));
      var nx = slots7[0];
      var text = '🏠 *Следующий заезд:*\n\n'+(APT_NAMES[nx.apartment]||nx.apartment)+'\n📅 '+fmtDate(nx.checkin_date)+'\n👥 '+(nx.guests_count||'?')+' гостей\n'+(fmtSource(nx.source)?'Источник: '+fmtSource(nx.source):'');
      bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });

    // ── БРОНИ СО СПА ──
    } else if (cmd.action === 'query_spa_bookings') {
      var spaSlots = scheduleCache.filter(function(s){
        if (!s.special_instructions) return false;
        try { var arr=JSON.parse(s.special_instructions); return Array.isArray(arr)&&arr.some(function(t){return t.key==='spa'&&t.enabled;}); } catch(e){ return false; }
      });
      var todayStr8 = new Date().toISOString().split('T')[0];
      spaSlots = spaSlots.filter(function(s){ return s.checkout_date && s.checkout_date.slice(0,10) >= todayStr8; });
      var text = '🏊 *Брони со Спа:*\n\n';
      if (spaSlots.length === 0) { text += 'Нет броней со спа'; }
      else { spaSlots.forEach(function(s){ text += (APT_NAMES[s.apartment]||s.apartment)+' · '+fmtDateShort(s.checkout_date)+' · '+(s.next_guests||s.guests_count||'?')+'г\n'; }); }
      bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });

    // ── БРОНИ С МАЛЫМ ПРОМЕЖУТКОМ ──
    } else if (cmd.action === 'query_gap_bookings') {
      try {
        var r = await api('get_bookings_by_period', { date_from: new Date().toISOString().split('T')[0], date_to: new Date(Date.now()+60*24*60*60*1000).toISOString().split('T')[0] });
        var gapSlots = (r.data||[]).filter(function(b){ return b.gap_days !== null && b.gap_days !== undefined && b.gap_days <= 2; });
        var text = '⚡ *Брони с малым gap (≤2 дня):*\n\n';
        if (gapSlots.length === 0) { text += 'Таких броней нет ✅'; }
        else { gapSlots.forEach(function(b){ text += (APT_NAMES[b.apartment]||b.apartment)+' · '+fmtDateShort(b.checkin_date)+'→'+fmtDateShort(b.checkout_date)+' · ⏱'+b.gap_days+'д\n'; }); }
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      } catch(e) { bot.sendMessage(chatId, 'Ошибка: '+e.message, getMenu(chatIdStr)); }

    // ── КОЛИЧЕСТВО БРОНЕЙ ──
    } else if (cmd.action === 'query_bookings_count') {
      var per = periodFromCmd(cmd);
      try {
        var r = await api('get_bookings_by_period', { date_from: per.from, date_to: per.to });
        var data = r.data || [];
        var byApt = {};
        data.forEach(function(b){ byApt[b.apartment]=(byApt[b.apartment]||0)+1; });
        var text = '📊 *' + cmd.confirm_text + '*\n\n🏠 Всего броней: *'+data.length+'*\n\n';
        Object.keys(byApt).forEach(function(a){ text += '• '+(APT_NAMES[a]||a)+': '+byApt[a]+'\n'; });
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      } catch(e) { bot.sendMessage(chatId, 'Ошибка: '+e.message, getMenu(chatIdStr)); }

    // ── ЗАГРУЖЕННОСТЬ ──
    } else if (cmd.action === 'query_occupancy') {
      var per = periodFromCmd(cmd);
      try {
        var r = await api('get_bookings_by_period', { date_from: per.from, date_to: per.to });
        var data = r.data || [];
        var totalDays = Math.round((new Date(per.to)-new Date(per.from))/86400000);
        var byApt = {};
        data.forEach(function(b){
          if (!byApt[b.apartment]) byApt[b.apartment] = 0;
          var cin = new Date(b.checkin_date), cout = new Date(b.checkout_date);
          byApt[b.apartment] += Math.round((cout-cin)/86400000);
        });
        var text = '📊 *' + cmd.confirm_text + '*\n\n';
        Object.keys(APT_NAMES).forEach(function(a){
          var days = byApt[a]||0; var pct = totalDays>0?Math.round(days/totalDays*100):0;
          text += '• '+(APT_NAMES[a])+': *'+pct+'%* ('+days+'/'+totalDays+' дн)\n';
        });
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      } catch(e) { bot.sendMessage(chatId, 'Ошибка: '+e.message, getMenu(chatIdStr)); }

    // ── СИНХРОНИЗИРОВАТЬ ICAL ──
    } else if (cmd.action === 'sync_ical') {
      bot.sendMessage(chatId, '🔄 Синхронизирую...');
      await syncIcal(chatId, chatIdStr);

    // ── НЕОПЛАЧЕННЫЕ УБОРКИ ──
    } else if (cmd.action === 'query_unpaid_cleanings') {
      try {
        var r = await api('get_unpaid_assignments');
        var data = r.data || [];
        var text = '💸 *Неоплаченные уборки:*\n\n';
        if (data.length === 0) { text += 'Все выплачено ✅'; }
        else { data.forEach(function(a){ text += '• '+(a.cleaner_name||'?')+' · '+(APT_NAMES[a.apartment]||a.apartment)+' · '+fmtDateShort(a.cleaning_date)+' · '+(a.payment_amount||35)+' EUR\n'; }); }
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      } catch(e) { bot.sendMessage(chatId, 'Нет данных о неоплаченных', getMenu(chatIdStr)); }

    // ── КТО СЕЙЧАС УБИРАЕТ ──
    } else if (cmd.action === 'query_active_cleaning') {
      try {
        var r = await api('get_active_assignments');
        var data = r.data || [];
        var text = '🧹 *Сейчас убирают:*\n\n';
        if (data.length === 0) { text += 'Никто не убирает'; }
        else { data.forEach(function(a){ text += '• '+(a.cleaner_name||'?')+' · '+(APT_NAMES[a.apartment]||a.apartment)+'\n  ⏱ Начала: '+(a.started_at?fmtTime(a.started_at):'?')+'\n'; }); }
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      } catch(e) { bot.sendMessage(chatId, 'Нет активных уборок', getMenu(chatIdStr)); }

    // ── ПОСЛЕДНИЙ ВИЗИТ АЛЬБЕРТА ──
    } else if (cmd.action === 'query_albert_last_visit') {
      try {
        var r = await api('get_albert_visits', { limit: 1 });
        var v = r.data && r.data[0];
        if (!v) return bot.sendMessage(chatId, 'История визитов пуста', getMenu(chatIdStr));
        var dt = new Date(v.visited_at || v.created_at);
        var text = '🍍 *Последний визит Альберта:*\n\n📅 '+fmtDate(dt.toISOString())+' · '+fmtTime(dt.toISOString())+'\n';
        if (v.delivered_cost) text += '💰 Постирано: *'+v.delivered_cost.toFixed(2)+' EUR*\n';
        if (v.delivered_items) { var dl=formatAlbertItems(v.delivered_items); if(dl) text += '\n✨ Привёз:\n'+dl; }
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      } catch(e) { bot.sendMessage(chatId, 'Ошибка: '+e.message, getMenu(chatIdStr)); }

    // ── ДОХОДЫ ──
    } else if (cmd.action === 'query_income') {
      try {
        var per = periodFromCmd(cmd);
        var r = await api('get_transactions_by_period', { date_from: per.from, date_to: per.to, type: 'income', cash_register: 'all' });
        var items = r.data || [];
        var summary = r.summary || {};
        var text = '💰 *' + cmd.confirm_text + '*\n📅 '+per.from.slice(8)+'.'+per.from.slice(5,7)+' — '+per.to.slice(8)+'.'+per.to.slice(5,7)+'\n\n';
        var total = summary.total_income || (Array.isArray(items) ? items.reduce(function(s,t){return s+Number(t.amount||0);},0) : 0);
        text += '💰 Итого: *'+total.toFixed(2)+' EUR*\n';
        if (Array.isArray(items) && items.length > 0) {
          // По источникам
          var bySrc = {};
          items.forEach(function(t){ var s=t.counterparty||t.payment_source||'Другое'; bySrc[s]=(bySrc[s]||0)+Number(t.amount||0); });
          if (Object.keys(bySrc).length > 1) {
            text += '\nПо источникам:\n';
            Object.keys(bySrc).sort(function(a,b){return bySrc[b]-bySrc[a];}).forEach(function(s){ text += '• '+s+': '+bySrc[s].toFixed(2)+' EUR\n'; });
          }
          // Последние записи
          text += '\nПоследние записи:\n';
          items.slice(0,5).forEach(function(t){ text += '• '+fmtDateShort(t.transaction_date||t.created_at)+' · '+(t.description||t.counterparty||'—')+' · '+Number(t.amount||0).toFixed(2)+' EUR\n'; });
        }
        if (Array.isArray(items) && items.length === 0) text += '_Нет доходов за период_\n';
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      } catch(e) { bot.sendMessage(chatId, 'Нет данных о доходах: '+e.message, getMenu(chatIdStr)); }

    // ── ДОХОДЫ VS РАСХОДЫ ──
    } else if (cmd.action === 'query_income_vs_expenses') {
      try {
        var per = periodFromCmd(cmd);
        var inc = null; var exp = null;
        try { var ri = await api('get_transactions_by_period', { date_from: per.from, date_to: per.to, type: 'income', cash_register: 'all' }); inc = ri.summary || {}; } catch(e){}
        try { var re = await api('get_transactions_by_period', { date_from: per.from, date_to: per.to, type: 'expense', cash_register: 'all' }); exp = re.summary || {}; } catch(e){}
        var incTotal = (inc && inc.total_income) || 0;
        var expTotal = (exp && exp.total_expense) || 0;
        var profit = incTotal - expTotal;
        var text = '📊 *' + cmd.confirm_text + '*\n📅 '+per.from.slice(8)+'.'+per.from.slice(5,7)+' — '+per.to.slice(8)+'.'+per.to.slice(5,7)+'\n\n';
        text += '💰 Доходы: *'+incTotal.toFixed(2)+' EUR*\n';
        text += '💸 Расходы: *'+expTotal.toFixed(2)+' EUR*\n\n';
        text += (profit >= 0 ? '✅' : '🔴') + ' Прибыль: *'+(profit>=0?'+':'')+profit.toFixed(2)+' EUR*';
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      } catch(e) { bot.sendMessage(chatId, 'Ошибка: '+e.message, getMenu(chatIdStr)); }

    // ── ДОХОД ПО АПАРТАМЕНТАМ ──
    } else if (cmd.action === 'query_income_by_apartment') {
      try {
        var per = periodFromCmd(cmd);
        var r = await api('get_bookings_by_period', { date_from: per.from, date_to: per.to });
        var data = r.data || [];
        var byApt = {};
        data.forEach(function(b){ if(!byApt[b.apartment])byApt[b.apartment]={count:0,guests:0}; byApt[b.apartment].count++; byApt[b.apartment].guests+=(b.guests_count||0); });
        var text = '🏠 *' + cmd.confirm_text + '*\n\n';
        Object.keys(APT_NAMES).forEach(function(a){
          var d=byApt[a]||{count:0,guests:0};
          text += '• '+(APT_NAMES[a])+': *'+d.count+' броней*, '+d.guests+' гостей\n';
        });
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      } catch(e) { bot.sendMessage(chatId, 'Ошибка: '+e.message, getMenu(chatIdStr)); }

    // ── ИТОГИ МЕСЯЦА ──
    } else if (cmd.action === 'query_month_summary') {
      try {
        var per = periodFromCmd(cmd);
        var now6 = new Date(per.from);
        var text = '📊 *' + cmd.confirm_text + '*\n\n';
        // Брони
        try {
          var rb = await api('get_bookings_by_period', { date_from: per.from, date_to: per.to });
          if (rb.data) text += '📅 Броней: *'+(rb.data.length)+'*\n';
        } catch(e){}
        // Стирка
        try {
          var rl = await api('get_laundry_monthly_summary', { year: now6.getFullYear(), month: now6.getMonth()+1 });
          if (rl.data && rl.data.total_cost) text += '🧺 Стирка: *'+rl.data.total_cost.toFixed(2)+' EUR*\n';
        } catch(e){}
        // Расходы
        try {
          var re = await api('get_expenses', { date_from: per.from, date_to: per.to });
          if (re.data && re.data.total) text += '💸 Расходы: *'+re.data.total.toFixed(2)+' EUR*\n';
        } catch(e){}
        // Уборщицы
        var cleanerSlots = scheduleCache.filter(function(s){ return s.checkout_date && s.checkout_date >= per.from && s.checkout_date <= per.to && s.cleaner_name; });
        if (cleanerSlots.length > 0) text += '🧹 Уборок: *'+cleanerSlots.length+'*\n';
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      } catch(e) { bot.sendMessage(chatId, 'Ошибка: '+e.message, getMenu(chatIdStr)); }

    // ── ФИНАНСОВАЯ СВОДКА ──
    } else if (cmd.action === 'query_financial_summary') {
      try {
        var per = periodFromCmd(cmd);
        var r = await api('get_financial_summary', { date_from: per.from, date_to: per.to, cash_register: cmd.cash_register||'all' });
        var d = r.data || {};
        var text = '📊 *' + cmd.confirm_text + '*\n📅 '+per.from.slice(8)+'.'+per.from.slice(5,7)+' — '+per.to.slice(8)+'.'+per.to.slice(5,7)+'\n\n';
        text += '💰 Приходы: *'+(d.total_income||0).toFixed(2)+' EUR*\n';
        text += '💸 Расходы: *'+(d.total_expense||0).toFixed(2)+' EUR*\n';
        var bal = (d.total_income||0)-(d.total_expense||0);
        text += (bal>=0?'✅':'🔴')+' Баланс: *'+(bal>=0?'+':'')+bal.toFixed(2)+' EUR*\n';
        if (d.top_expenses && d.top_expenses.length>0) {
          text += '\nТоп расходов:\n';
          d.top_expenses.slice(0,5).forEach(function(e){ text += '• '+e.category+': '+e.amount.toFixed(2)+' EUR\n'; });
        }
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      } catch(e) { bot.sendMessage(chatId, 'Ошибка: '+e.message, getMenu(chatIdStr)); }

    // ── НЕОПЛАЧЕННЫЕ УБОРКИ (исправлено) ──
    } else if (cmd.action === 'query_unpaid') {
      try {
        var r = await api('get_unpaid_cleanings');
        var d = r.data || {};
        var text = '💸 *Долг уборщицам:*\n\n';
        var names = Object.keys(d);
        if (names.length === 0) { text += 'Все выплаты сделаны ✅'; }
        else { names.forEach(function(n){ text += '• *'+n+'*: '+d[n].shifts+' смен · *'+d[n].total.toFixed(2)+' EUR*\n'; }); }
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      } catch(e) { bot.sendMessage(chatId, 'Нет данных: '+e.message, getMenu(chatIdStr)); }

    // ── СОЗДАТЬ ПЕРЕМЕЩЕНИЕ ──
    } else if (cmd.action === 'create_movement') {
      try {
        var r = await api('create_movement', { from_location: cmd.from_location, to_location: cmd.to_location, items: cmd.items||{}, notes: cmd.notes||'' });
        bot.sendMessage(chatId, '✅ Перемещение создано!\n'+cmd.confirm_text+'\nЗаписей: '+(r.count||0), getMenu(chatIdStr));
      } catch(e) { bot.sendMessage(chatId, 'Ошибка: '+e.message, getMenu(chatIdStr)); }

    // ── ОСТАТКИ ПО ЛОКАЦИЯМ ──
    } else if (cmd.action === 'query_stock_balance') {
      try {
        var r = await api('get_stock_balance', { location: cmd.location||'' });
        var d = r.data || {};
        var text = '📦 *Остатки белья*'+(cmd.location?' ('+cmd.location+')':'')+'\n\n';
        var locs = Object.keys(d);
        if (locs.length === 0) { text += 'Нет данных'; }
        else {
          var LOC_NAMES = { piral_1:'Оазис 1', piral_2:'Оазис 2', salvador:'Сальвадор', grande:'Гранде', clean_linen_piral:'Пераль чистое', clean_linen_salvador:'Сальвадор чистое', dirty_linen_piral:'Пераль грязное', dirty_linen_salvador:'Сальвадор грязное', albert_laundry:'У Альберта', damaged:'Испорченное' };
          locs.forEach(function(loc){
            text += '🏠 *'+(LOC_NAMES[loc]||loc)+'*\n';
            Object.keys(d[loc]).forEach(function(item){ text += '  • '+ruName(item)+': '+d[loc][item]+'\n'; });
            text += '\n';
          });
        }
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      } catch(e) { bot.sendMessage(chatId, 'Ошибка: '+e.message, getMenu(chatIdStr)); }

    // ── СВОДКА ПЕРЕМЕЩЕНИЙ ──
    } else if (cmd.action === 'query_movement_summary') {
      try {
        var per = periodFromCmd(cmd);
        var r = await api('get_movement_summary', { date_from: per.from, date_to: per.to });
        var d = r.data || {};
        var text = '📦 *Движение белья*\n📅 '+per.from.slice(8)+'.'+per.from.slice(5,7)+' — '+per.to.slice(8)+'.'+per.to.slice(5,7)+'\n\n';
        text += '🚚 Отдано в стирку: *'+(d.sent_to_laundry||0)+' шт*\n';
        text += '✨ Получено чистого: *'+(d.returned_from_laundry||0)+' шт*\n';
        if ((d.difference||0)!==0) text += '⚠️ Разница: '+(d.difference||0)+' шт\n';
        if (d.damaged) text += '🗑 Испорчено/потеряно: '+d.damaged+' шт\n';
        if (d.purchased) text += '🛍 Закуплено: '+d.purchased+' шт\n';
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      } catch(e) { bot.sendMessage(chatId, 'Ошибка: '+e.message, getMenu(chatIdStr)); }

    // ── СОЗДАТЬ ЗАДАЧУ ──
    } else if (cmd.action === 'create_task') {
      try {
        var r = await api('create_task', { title: cmd.title, description: cmd.description||'', due_date: cmd.due_date||null, is_public: cmd.is_public!==false });
        bot.sendMessage(chatId, '✅ Задача создана!\n📋 '+cmd.title+(cmd.due_date?'\n📅 Срок: '+fmtDateShort(cmd.due_date):''), getMenu(chatIdStr));
      } catch(e) { bot.sendMessage(chatId, 'Ошибка: '+e.message, getMenu(chatIdStr)); }

    // ── СПИСОК ЗАДАЧ ──
    } else if (cmd.action === 'query_tasks') {
      try {
        var r = await api('get_tasks', { status: cmd.status||'open' });
        var tasks = r.data || [];
        var text = '📋 *Задачи*'+(cmd.status==='done'?' (выполненные)':' (открытые)')+'\n\n';
        if (tasks.length===0) { text += 'Нет задач'; }
        else {
          tasks.slice(0,10).forEach(function(t){
            text += '• '+t.title+(t.due_date?' · '+fmtDateShort(t.due_date):'')+'\n';
          });
          if (tasks.length>10) text += '...и ещё '+(tasks.length-10)+'\n';
        }
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      } catch(e) { bot.sendMessage(chatId, 'Ошибка: '+e.message, getMenu(chatIdStr)); }

    // ── СВОДКА ЗАДАЧ ──
    } else if (cmd.action === 'query_tasks_summary') {
      try {
        var r = await api('get_tasks_summary');
        var d = r.data || {};
        var text = '📋 *Сводка по задачам:*\n\n';
        text += '🟡 Открытых: *'+(d.active||0)+'*\n';
        text += '✅ Выполненных: *'+(d.completed||0)+'*\n';
        if (d.overdue) text += '🔴 Просроченных: *'+d.overdue+'*\n';
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      } catch(e) { bot.sendMessage(chatId, 'Ошибка: '+e.message, getMenu(chatIdStr)); }

    // ── СТАТИСТИКА БРОНИРОВАНИЙ ──
    } else if (cmd.action === 'query_bookings_summary') {
      try {
        var per = periodFromCmd(cmd);
        var r = await api('get_bookings_summary', { date_from: per.from, date_to: per.to, apartment: cmd.apartment||'' });
        var d = r.data || {};
        var text = '📅 *'+cmd.confirm_text+'*\n\n';
        if (d.total_bookings!==undefined) text += '📊 Всего броней: *'+d.total_bookings+'*\n';
        if (d.total_guests) text += '👥 Гостей: *'+d.total_guests+'*\n';
        if (d.avg_guests) text += '👤 Среднее: *'+d.avg_guests.toFixed(1)+' чел*\n';
        if (d.by_apartment) { Object.keys(d.by_apartment).forEach(function(a){ var x=d.by_apartment[a]; text += '• '+(APT_NAMES[a]||a)+': '+x.count+' броней\n'; }); }
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      } catch(e) { bot.sendMessage(chatId, 'Ошибка: '+e.message, getMenu(chatIdStr)); }

    // ── УМНЫЙ СЕМАНТИЧЕСКИЙ ПОИСК ──
    } else if (cmd.action === 'smart_query') {
      try {
        await bot.sendMessage(chatId, '🧠 Анализирую...');
        // Собираем контекст
        var ctx = {};
        // Расписание
        ctx.schedule = scheduleCache.slice(0,15).map(function(s){
          return { apt: APT_NAMES[s.apartment]||s.apartment, checkout: s.checkout_date, checkin: s.checkin_date, guests: s.next_guests||s.guests_count, cleaner: s.cleaner_name||'нет', tasks: s.special_instructions?'да':'нет' };
        });
        // Баланс Альберта
        try { var ab = await api('get_albert_balance'); ctx.albert_balance = ab.data; } catch(e) {}
        // Финансы текущего месяца
        try {
          var now7 = new Date(); var per7 = periodFromCmd({ period: 'this_month' });
          var fin = await api('get_financial_summary', { date_from: per7.from, date_to: per7.to, cash_register: 'all' });
          ctx.finances_this_month = fin.data;
        } catch(e) {}
        // Неоплаченные
        try { var unp = await api('get_unpaid_cleanings'); ctx.unpaid = unp.data; } catch(e) {}
        // Задачи
        try { var ts = await api('get_tasks_summary'); ctx.tasks_summary = ts.data; } catch(e) {}

        var today7 = new Date().toISOString().split('T')[0];
        var smartPrompt =
          'Ты аналитик ERA Apartments (краткосрочная аренда в Испании). Сегодня: ' + today7 + '.\n' +
          'Апартаменты: Оазис 1, Оазис 2, Гранде (Оаз1+Оаз2), Сальвадор.\n\n' +
          'ДАННЫЕ СИСТЕМЫ:\n' + JSON.stringify(ctx, null, 1) + '\n\n' +
          'Вопрос пользователя: "' + cmd.query + '"\n\n' +
          'Дай умный, конкретный, полезный ответ на русском. Используй цифры из данных. ' +
          'Если данных недостаточно — скажи что именно нужно уточнить. ' +
          'Ответ максимум 10 строк. Используй эмодзи для читаемости.';

        var smartR = await axios.post('https://api.anthropic.com/v1/messages', {
          model: 'claude-sonnet-4-20250514', max_tokens: 800,
          messages: [{ role: 'user', content: smartPrompt }]
        }, { headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } });

        var answer = smartR.data.content[0].text;
        bot.sendMessage(chatId, '🧠 ' + answer, { parse_mode: 'Markdown' });
      } catch(e) {
        bot.sendMessage(chatId, 'Не удалось обработать запрос: ' + e.message, getMenu(chatIdStr));
      }

    // ── ДОХОД ОТ ОДНОЙ БРОНИ ──
    } else if (cmd.action === 'add_booking_income') {
      var srcName = { airbnb:'Airbnb', holidu:'Holidu', booking:'Booking.com', direct:'Прямое', other:'Другое' }[cmd.source] || cmd.source || 'Другое';
      var desc = (APT_NAMES[cmd.apartment]||cmd.apartment||'') + (cmd.checkin ? ' · '+fmtDateShort(cmd.checkin)+'→'+fmtDateShort(cmd.checkout) : '');
      try {
        await api('create_income', { amount: cmd.amount, category: 'Аренда', description: desc, source: srcName, created_at: new Date().toISOString() });
        bot.sendMessage(chatId, '✅ Доход записан!\n\n💰 *' + cmd.amount + ' EUR*\n🏠 ' + desc + '\n📋 ' + srcName, { parse_mode: 'Markdown' });
      } catch(e) { bot.sendMessage(chatId, '❌ Ошибка: ' + e.message, getMenu(chatIdStr)); }

    // ── ПАКЕТНЫЙ ВВОД ДОХОДОВ ──
    } else if (cmd.action === 'add_batch_income') {
      var entries = cmd.entries || [];
      if (entries.length === 0) return bot.sendMessage(chatId, '❌ Не удалось разобрать доходы', getMenu(chatIdStr));
      var total = entries.reduce(function(s, e) { return s + (e.amount||0); }, 0);
      var preview = '💰 *Записать ' + entries.length + ' дохода(ов):*\n\n';
      entries.forEach(function(e, i) {
        var srcN = { airbnb:'Airbnb', holidu:'Holidu', booking:'Booking.com', direct:'Прямое', other:'Другое' }[e.source] || e.source || '—';
        preview += (i+1) + '. ' + (APT_NAMES[e.apartment]||e.apartment) + ' · ' + fmtDateShort(e.checkin) + '→' + fmtDateShort(e.checkout) + '\n   💶 ' + e.amount + ' EUR · ' + srcN + '\n';
      });
      preview += '\n*Итого: ' + total + ' EUR*\n\nВсё верно?';
      sessions[chatId] = { step: 'inc_batch_confirm', entries: entries };
      bot.sendMessage(chatId, preview, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
        [{ text: '✅ Записать всё', callback_data: 'inc_batch_confirm' }, { text: '❌ Отмена', callback_data: 'inc_batch_cancel' }]
      ]}});

    // ── TTLOCK: СОЗДАТЬ КОД ──
    } else if (cmd.action === 'lock_create') {
      if (!TTLOCK_ENABLED) return bot.sendMessage(chatId, '⚠️ TTLock не настроен в .env', getMenu(chatIdStr));
      try {
        var apt = normalizeApt(cmd.apartment);
        var checkinDate = cmd.checkin;
        var checkoutDate = cmd.checkout;
        // Ищем бронь в scheduleCache по дате заезда
        if (checkinDate && scheduleCache && scheduleCache.length > 0) {
          var found = scheduleCache.find(function(s) {
            var aptMatch = !apt || normalizeApt(s.apartment) === apt;
            var dateMatch = s.checkin_date && s.checkin_date.slice(0,10) === checkinDate.slice(0,10);
            return aptMatch && dateMatch;
          });
          if (found) {
            checkinDate = found.checkin_date;
            checkoutDate = found.checkout_date;
            apt = found.apartment;
          }
        }
        var checkinTime = cmd.checkin_time || '15:00';
        // checkout_time из команды означает ВРЕМЯ В ДЕНЬ ВЫЕЗДА по броне
        // Если сказали 'до 5 вечера' — это 17:00 в день выезда брони
        var checkoutTime = cmd.checkout_time || '11:00';
        // Если checkout не нашли через бронь — используем дату заезда как fallback
        if (!checkoutDate && checkinDate) { checkoutDate = checkinDate; }
        var periodStr = fmtDateShort(checkinDate) + ' ' + checkinTime + ' → ' + fmtDateShort(checkoutDate) + ' ' + checkoutTime;
        var aptName = APT_NAMES[apt] || apt;
        await bot.sendMessage(chatId, '🔐 Создаю код ' + (cmd.custom_code||'') + '...\n🏠 ' + aptName + '\n📅 ' + periodStr);
        var ciTime = cmd.checkin_time || '15:00';
        var coTime = cmd.checkout_time || '11:00';
        var startMs = new Date(checkinDate.slice(0,10) + 'T' + ciTime + ':00').getTime();
        var endMs = new Date(checkoutDate.slice(0,10) + 'T' + coTime + ':00').getTime();
        var result = await ttlock.createGuestCode(apt, checkinDate, checkoutDate, false, cmd.custom_code||null, startMs, endMs);
        await notifyLockCode(result, { checkin_date: checkinDate, checkout_date: checkoutDate, apartment: apt });
        // Создаём Guest Portal
        try {
          var portalR = await api('create_guest_portal', {
            apartment: apt,
            checkin_date: checkinDate,
            checkout_date: checkoutDate,
            door_code: result.codeDisplay,
            guests_count: 4
          });
          if (portalR && portalR.url) {
            bot.sendMessage(chatId,
              '🌐 *Ссылка для гостей:*\n' + portalR.url + '\n\n_Отправь гостю в WhatsApp или email_',
              { parse_mode: 'Markdown' }
            );
          }
        } catch(e) { console.error('[portal]', e.message); }
      } catch(e) { bot.sendMessage(chatId, '❌ Ошибка TTLock: ' + e.message, getMenu(chatIdStr)); }

    // ── TTLOCK: ТЕКУЩИЙ КОД ──
    } else if (cmd.action === 'lock_query') {
      if (!TTLOCK_ENABLED) return bot.sendMessage(chatId, '⚠️ TTLock не настроен в .env', getMenu(chatIdStr));
      var qApt = normalizeApt(cmd.apartment);
      var lockKeys = qApt ? (ttlock.APT_LOCKS[qApt] || [qApt]) : Object.keys(ttlock.LOCKS);
      var text = '🔐 *Активные коды:*\n\n';
      for (var li = 0; li < lockKeys.length; li++) {
        var lock = ttlock.LOCKS[lockKeys[li]];
        if (!lock || !lock.lockId) continue;
        try {
          var codes = await ttlock.getPasscodes(lock.lockId);
          var timed = codes.filter(function(c){ return c.keyboardPwdType === 3; });
          text += '🔒 *' + lock.name + '*\n';
          if (timed.length === 0) { text += '  Нет активных кодов\n'; }
          else { timed.forEach(function(c){ text += '  🔑 ' + c.keyboardPwd + ' · до ' + new Date(c.endDate).toLocaleDateString('ru-RU') + '\n'; }); }
          text += '\n';
        } catch(e) { text += '🔒 ' + (lock.name||lockKeys[li]) + ': ошибка\n'; }
      }
      bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });

    // ── TTLOCK: ПРОДЛИТЬ КОД ──
    } else if (cmd.action === 'lock_extend') {
      if (!TTLOCK_ENABLED) return bot.sendMessage(chatId, '⚠️ TTLock не настроен в .env', getMenu(chatIdStr));
      var extApt = normalizeApt(cmd.apartment);
      var lockKeys3 = extApt ? (ttlock.APT_LOCKS[extApt] || [extApt]) : [];
      if (lockKeys3.length === 0) return bot.sendMessage(chatId, '❌ Укажи апартамент', getMenu(chatIdStr));

      // Вычисляем время окончания
      var newEndMs3;
      var extLabel = '';
      if (cmd.extend_until) {
        newEndMs3 = new Date(cmd.extend_until).getTime();
        extLabel = 'до ' + new Date(newEndMs3).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
      } else if (cmd.extend_minutes) {
        newEndMs3 = Date.now() + cmd.extend_minutes * 60000;
        extLabel = 'на ' + cmd.extend_minutes + ' мин';
      } else if (cmd.extend_days) {
        newEndMs3 = Date.now() + cmd.extend_days * 86400000;
        extLabel = 'на ' + cmd.extend_days + ' дн';
      } else {
        // По умолчанию до 13:00 сегодня
        var t13 = new Date(); t13.setHours(13, 0, 0, 0);
        newEndMs3 = t13.getTime();
        extLabel = 'до 13:00';
      }

      var startMs3 = Date.now() - 60000;
      var extResults = [];

      // Находим существующий код на замке
      for (var ei = 0; ei < lockKeys3.length; ei++) {
        var lock3 = ttlock.LOCKS[lockKeys3[ei]];
        if (!lock3 || !lock3.lockId) continue;
        try {
          var existCodes = await ttlock.getPasscodes(lock3.lockId);
          var timedCode = existCodes.find(function(c){ return c.keyboardPwdType === 3; });
          if (timedCode) {
            // Удаляем старый и создаём новый с тем же кодом
            await ttlock.deletePasscode(lock3.lockId, timedCode.keyboardPwdId);
            await ttlock.createPasscode(lock3.lockId, timedCode.keyboardPwd, startMs3, newEndMs3, 'Extended');
            extResults.push('✅ ' + lock3.name + ' · код: ' + timedCode.keyboardPwd);
          } else {
            extResults.push('⚠️ ' + lock3.name + ' · нет активного кода');
          }
        } catch(e) { extResults.push('❌ ' + (lock3.name||lockKeys3[ei]) + ': ' + e.message); }
      }

      var endStr3 = new Date(newEndMs3).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
      bot.sendMessage(chatId,
        '⏰ *Код продлён ' + extLabel + '!*\n' +
        '🏠 ' + (APT_NAMES[cmd.apartment]||cmd.apartment) + '\n' +
        '⏰ До: ' + endStr3 + '\n\n' + extResults.join('\n'),
        { parse_mode: 'Markdown', ...getMenu(chatIdStr) }
      );

    // ── TTLOCK: ПРОДЛИТЬ КОД АЛЬБЕРТА ──
    } else if (cmd.action === 'lock_extend_albert') {
      if (!TTLOCK_ENABLED) return bot.sendMessage(chatId, '⚠️ TTLock не настроен', getMenu(chatIdStr));
      var albertApt = normalizeApt(cmd.apartment);
      // Если апартамент не указан — берём все
      var albertLockKeys = albertApt
        ? (ttlock.APT_LOCKS[albertApt] || [albertApt])
        : ['piral_1', 'piral_2', 'grande', 'salvador'].reduce(function(a,k){ return a.concat(ttlock.APT_LOCKS[k]||[]); }, []);
      var uniqueAlbertLocks = albertLockKeys.filter(function(v,i,a){ return a.indexOf(v)===i; });

      // Время окончания
      var albertEndMs;
      if (cmd.extend_until) {
        albertEndMs = new Date(cmd.extend_until).getTime();
      } else if (cmd.extend_minutes) {
        albertEndMs = Date.now() + cmd.extend_minutes * 60000;
      } else if (cmd.extend_days) {
        albertEndMs = Date.now() + cmd.extend_days * 86400000;
      } else {
        var t18 = new Date(); t18.setHours(18, 0, 0, 0);
        albertEndMs = t18.getTime();
      }
      var albertStartMs = Date.now() - 300000; // с 5 минут назад

      var albertResults = [];
      for (var ai = 0; ai < uniqueAlbertLocks.length; ai++) {
        var aLock = ttlock.LOCKS[uniqueAlbertLocks[ai]];
        if (!aLock || !aLock.lockId) continue;
        try {
          // Удаляем все старые коды Альберта (истёкшие и активные)
          try {
            var allCodes = await ttlock.getPasscodes(aLock.lockId);
            var albertOld = allCodes.filter(function(c){ return c.keyboardPwd === albertCode; });
            for (var oi = 0; oi < albertOld.length; oi++) {
              await ttlock.deletePasscode(aLock.lockId, albertOld[oi].keyboardPwdId);
            }
          } catch(e2) { /* игнорируем ошибки удаления */ }
          // Создаём новый с кодом 8282
          await ttlock.createPasscode(aLock.lockId, albertCode, albertStartMs, albertEndMs, 'Albert');
          albertResults.push('✅ ' + aLock.name);
        } catch(e) { albertResults.push('❌ ' + (aLock.name||uniqueAlbertLocks[ai]) + ': ' + e.message); }
      }

      var albertEndStr = new Date(albertEndMs).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
      var albertAptName = albertApt ? (APT_NAMES[albertApt]||albertApt) : 'все апартаменты';
      bot.sendMessage(chatId,
        '🔑 *Код Альберта продлён!*\n' +
        '🏠 ' + albertAptName + '\n' +
        '🔢 Код: *' + albertCode + '*\n' +
        '⏰ Доступ до: *' + albertEndStr + '*\n\n' +
        albertResults.join('\n'),
        { parse_mode: 'Markdown', ...getMenu(chatIdStr) }
      );

    // ── TTLOCK: УДАЛИТЬ КОД ──
    } else if (cmd.action === 'lock_delete') {
      if (!TTLOCK_ENABLED) return bot.sendMessage(chatId, '⚠️ TTLock не настроен в .env', getMenu(chatIdStr));
      var dApt = normalizeApt(cmd.apartment);
      var lockKeys2 = dApt ? (ttlock.APT_LOCKS[dApt] || [dApt]) : [];
      if (lockKeys2.length === 0) return bot.sendMessage(chatId, '❌ Укажи апартамент', getMenu(chatIdStr));
      var delResults = [];
      for (var di = 0; di < lockKeys2.length; di++) {
        var lock2 = ttlock.LOCKS[lockKeys2[di]];
        if (!lock2 || !lock2.lockId) continue;
        try {
          var codes2 = await ttlock.getPasscodes(lock2.lockId);
          var deleted = 0;
          for (var dj = 0; dj < codes2.length; dj++) {
            if (codes2[dj].keyboardPwdType === 3) { await ttlock.deletePasscode(lock2.lockId, codes2[dj].keyboardPwdId); deleted++; }
          }
          delResults.push('✅ ' + lock2.name + ' · ' + deleted + ' кодов удалено');
        } catch(e) { delResults.push('❌ ' + (lock2.name||lockKeys2[di]) + ': ' + e.message); }
      }
      bot.sendMessage(chatId, '🗑 *Результат:*\n' + delResults.join('\n'), { parse_mode: 'Markdown' });

    } else {
      bot.sendMessage(chatId, '❓ ' + cmd.confirm_text, getMenu(chatIdStr));
    }
  } catch(e) { bot.sendMessage(chatId, '❌ Ошибка: ' + e.message, getMenu(chatIdStr)); }
}

// ── ФОТО ЧЕКА К РАСХОДУ ─────────────────────────────────────────
bot.on('photo', async function(msg) {
  var chatId = msg.chat.id; var chatIdStr = String(chatId);
  if (!isAdmin(chatIdStr)) return;

  // Если есть активная сессия ожидания чека
  if (sessions[chatId] && sessions[chatId].step === 'expense_receipt') {
    var sess = sessions[chatId];
    try {
      // Берём фото максимального размера
      var photos = msg.photo;
      var bestPhoto = photos[photos.length - 1];
      var fileInfo = await bot.getFile(bestPhoto.file_id);
      var fileUrl = 'https://api.telegram.org/file/bot' + TOKEN + '/' + fileInfo.file_path;

      await bot.sendMessage(chatId, '🔍 Анализирую чек...');

      // Скачиваем фото и анализируем через Claude Vision
      var imgResp = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      var base64 = Buffer.from(imgResp.data).toString('base64');

      var visionResp = await axios.post('https://api.anthropic.com/v1/messages', {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
          { type: 'text', text: 'Это фото чека. Извлеки: сумму (число), магазин/заведение, дату если есть. Верни ТОЛЬКО JSON: {"amount": 29.90, "shop": "Mercadona", "date": "2026-04-12", "items": "краткий список товаров"}' }
        ]}]
      }, { headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } });

      var receiptData = JSON.parse(visionResp.data.content[0].text.replace(/```json|```/g, '').trim());
      var amount = sess.amount || receiptData.amount || 0;
      var description = sess.description || receiptData.items || '';
      var shop = receiptData.shop || '';
      var fullDesc = (sess.mappedCat || '') + (shop ? ' · ' + shop : '') + (description ? ': ' + description : '');

      await api('create_expense', {
        amount: amount,
        description: fullDesc.trim(),
        source: 'telegram_photo',
        created_at: new Date().toISOString()
      });

      bot.sendMessage(chatId,
        '✅ Расход записан с чеком!\n\n' +
        '💰 *' + amount + ' EUR*\n' +
        '🏪 ' + (shop || '—') + '\n' +
        '📋 ' + (description || '—'),
        { parse_mode: 'Markdown', ...getMenu(chatIdStr) }
      );
    } catch(e) {
      bot.sendMessage(chatId, '❌ Ошибка анализа чека: ' + e.message, getMenu(chatIdStr));
    }
    sessions[chatId] = null;
    return;
  }

  // Фото после голосового расхода — сравниваем суммы
  if (sessions[chatId] && sessions[chatId].step === 'expense_receipt_wait') {
    var sess = sessions[chatId];
    try {
      var photos2 = msg.photo; var bestPhoto2 = photos2[photos2.length - 1];
      var fileInfo2 = await bot.getFile(bestPhoto2.file_id);
      var fileUrl2 = 'https://api.telegram.org/file/bot' + TOKEN + '/' + fileInfo2.file_path;
      await bot.sendMessage(chatId, '🔍 Анализирую чек...');
      var imgResp2 = await axios.get(fileUrl2, { responseType: 'arraybuffer' });
      var imageBuffer2 = Buffer.from(imgResp2.data);
      var base64_2 = imageBuffer2.toString('base64');
      var visionResp2 = await axios.post('https://api.anthropic.com/v1/messages', {
        model: 'claude-haiku-4-5-20251001', max_tokens: 600,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64_2 } },
          { type: 'text', text: 'Это фото чека. Верни ТОЛЬКО JSON: {"amount": 29.90, "shop": "Mercadona", "date": "2026-04-12", "items": "краткий список", "full_text": "полный текст"}' }
        ]}]
      }, { headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } });
      var rd2 = JSON.parse(visionResp2.data.content[0].text.replace(/```json|```/g, '').trim());

      // Загружаем фото
      var fileName2 = 'receipt_' + chatId + '_' + Date.now() + '.jpg';
      var receiptUrl2 = await uploadReceiptToStorage(imageBuffer2, fileName2);

      var voiceAmount = parseFloat(sess.amount) || 0;
      var receiptAmount = parseFloat(rd2.amount) || 0;
      var diff = Math.abs(voiceAmount - receiptAmount);

      if (diff > 0.5) {
        // Расхождение — спрашиваем какую сумму записать
        sessions[chatId].receiptData = rd2;
        sessions[chatId].receiptUrl = receiptUrl2;
        bot.sendMessage(chatId,
          '⚠️ *Расхождение!*\n\n' +
          '🎤 Ты сказал: *' + voiceAmount + ' EUR* · ' + sess.description + '\n' +
          '📄 Чек: *' + receiptAmount + ' EUR* · ' + (rd2.shop||'') + ' · ' + (rd2.items||'') + '\n\n' +
          'Какую сумму записать?',
          { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
            [{ text: '🎤 ' + voiceAmount + ' EUR (голос)', callback_data: 'receipt_use_voice' }],
            [{ text: '📄 ' + receiptAmount + ' EUR (чек)', callback_data: 'receipt_use_receipt' }]
          ]}}
        );
      } else {
        // Суммы совпадают — просто прикрепляем чек
        if (sess.expenseId) {
          try { await api('update_expense_receipt', { expense_id: sess.expenseId, receipt_url: receiptUrl2, receipt_text: rd2.full_text || rd2.items || '' }); } catch(e) {}
        }
        bot.sendMessage(chatId, '✅ Чек прикреплён! 📄\n💸 ' + voiceAmount + ' EUR', getMenu(chatIdStr));
        sessions[chatId] = null;
      }
    } catch(e) { bot.sendMessage(chatId, '❌ Ошибка: ' + e.message, getMenu(chatIdStr)); sessions[chatId] = null; }
    return;
  }

  // Фото без активной сессии — предлагаем записать как расход
  if (isAdmin(chatIdStr)) {
    sessions[chatId] = { step: 'expense_receipt', amount: null, description: '', mappedCat: 'Прочее' };
    bot.sendMessage(chatId,
      '📸 Вижу фото чека!\n\nАнализирую и запишу как расход.\n_Или введи сумму вручную если нужно:_',
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
        [{ text: '🔍 Проанализировать и записать', callback_data: 'receipt_analyze' }],
        [{ text: '❌ Отмена', callback_data: 'receipt_cancel' }]
      ]}}
    );
    // Сохраняем file_id для анализа
    sessions[chatId].photoFileId = msg.photo[msg.photo.length - 1].file_id;
  }
});

bot.on('voice', async function(msg) {
  var chatId = msg.chat.id; var chatIdStr = String(chatId);
  console.log('[voice] from:', chatIdStr, '| OWNER:', OWNER_CHAT_ID, '| IRINA:', IRINA_CHAT_ID, '| isAdmin:', isAdmin(chatIdStr), '| OPENAI_KEY:', OPENAI_KEY ? 'OK' : 'MISSING');
  if (!isAdmin(chatIdStr)) return;
  if (!OPENAI_KEY) return bot.sendMessage(chatId, 'OPENAI_API_KEY не настроен', getMenu(chatIdStr));

  try {
    await bot.sendMessage(chatId, '🎤 Слушаю...');
    var fileInfo = await bot.getFile(msg.voice.file_id);
    var fileUrl = 'https://api.telegram.org/file/bot' + TOKEN + '/' + fileInfo.file_path;

    // Транскрибируем через Whisper
    var text = await transcribeVoice(fileUrl);
    if (!text) return bot.sendMessage(chatId, '❌ Не удалось распознать речь', getMenu(chatIdStr));

    await bot.sendMessage(chatId, '🔍 Распознал: _' + text + '_\nАнализирую...', { parse_mode: 'Markdown' });

    // Парсим команду через Claude
    var cmd = await parseVoiceCommand(text, scheduleCache);

    if (cmd.action === 'unknown') {
      // Не команда — отвечаем как AI помощник + TTS
      try {
        var role = isAlbert(chatIdStr) ? 'albert' : 'admin';
        var answer = await aiHelper(text, role);
        await bot.sendMessage(chatId, answer, getMenu(chatIdStr));
        // Голосовой ответ
        var ttsAudio = await textToSpeech(answer);
        if (ttsAudio) {
          try {
            await bot.sendVoice(chatId, ttsAudio, {}, { filename: 'voice.mp3', contentType: 'audio/mpeg' });
          } catch(ttsErr) { console.error('[TTS sendVoice]', ttsErr.message); }
        }
        return;
      } catch(e) {
        return bot.sendMessage(chatId, '❓ Не понял: "' + text + '"', getMenu(chatIdStr));
      }
    }

    // Запросы (query_*) и smart_query — выполняем сразу + TTS ответ
    var noConfirmActions = ['smart_query','query_today','query_tomorrow','query_week','query_apartment_schedule','query_free_slots','query_next_checkin','query_spa_bookings','query_gap_bookings','query_bookings_count','query_occupancy','query_cleaner_next','query_cleaner_stats','query_all_cleaners','query_unpaid_cleanings','query_unpaid','query_active_cleaning','query_albert_balance','query_albert_settlements','query_albert_history','query_albert_last_visit','query_laundry_cost','query_expenses','query_income','query_income_vs_expenses','query_income_by_apartment','query_month_summary','query_financial_summary','query_stock_balance','query_movement_summary','query_tasks','query_tasks_summary','query_bookings_summary','show_period','sync_ical','lock_query','add_batch_income','lock_extend','lock_extend_albert','add_spa'];
    if (noConfirmActions.indexOf(cmd.action) !== -1) {
      // Выполняем команду и добавляем TTS к ответу
      var ttsLastText = null;
      var origSendMsg = bot.sendMessage;
      bot.sendMessage = async function(cid, txt, opts) {
        if (String(cid) === String(chatId) && txt && typeof txt === 'string' && txt.length > 10 && !ttsLastText) {
          ttsLastText = txt;
        }
        return origSendMsg.call(bot, cid, txt, opts);
      };
      try {
        await executeVoiceCommand(chatId, chatIdStr, cmd);
      } finally {
        bot.sendMessage = origSendMsg;
      }
      // Озвучиваем первый текстовый ответ
      if (ttsLastText && ttsSettings.enabled && OPENAI_KEY) {
        try {
          var ttsAudio = await textToSpeech(ttsLastText);
          if (ttsAudio) {
            await bot.sendVoice(chatId, ttsAudio, {}, { filename: 'voice.mp3', contentType: 'audio/mpeg' });
          }
        } catch(ttsE) { console.error('[TTS voice]', ttsE.message); }
      }
      return;
    }

    // Для lock_create — обновляем confirm_text с реальными датами из расписания
    if (cmd.action === 'lock_create' && cmd.checkin && scheduleCache && scheduleCache.length > 0) {
      var apt = normalizeApt(cmd.apartment);
      var found = scheduleCache.find(function(s) {
        var aptMatch = !apt || normalizeApt(s.apartment) === apt;
        var dateMatch = s.checkin_date && s.checkin_date.slice(0,10) === cmd.checkin.slice(0,10);
        return aptMatch && dateMatch;
      });
      if (found) {
        cmd.checkout = found.checkout_date;
        var aptName2 = APT_NAMES[found.apartment] || found.apartment;
        cmd.confirm_text = 'Создать код ' + (cmd.custom_code||'') + ' для ' + aptName2 + ' · ' + fmtDateShort(found.checkin_date) + ' 15:00 → ' + fmtDateShort(found.checkout_date) + ' 11:00';
      }
    }

    // Действия (изменения данных) — просим подтверждения
    sessions[chatId] = { step: 'voice_confirm', cmd: cmd };
    bot.sendMessage(chatId, '🎤 Понял команду:\n\n*' + cmd.confirm_text + '*\n\nВсё верно?',
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
        [{ text: '✅ Выполнить', callback_data: 'vc_confirm' }, { text: '❌ Отмена', callback_data: 'vc_cancel' }],
        [{ text: '✏️ Изменить текстом', callback_data: 'vc_edit' }]
      ]}}
    );
  } catch(e) { bot.sendMessage(chatId, 'Ошибка: ' + e.message, getMenu(chatIdStr)); }
});

console.log('ERA Bot v90 запущен!');
console.log('Polling активен...');
console.log('Albert ID:', ALBERT_CHAT_ID);
console.log('Laundry Group:', LAUNDRY_GROUP_ID);

// Прогреваем кэш расписания при старте
setTimeout(async function() {
  try {
    var r = await api('get_schedule');
    if (r.data && r.data.length > 0) {
      scheduleCache = r.data;
      console.log('[cache] Расписание загружено: ' + scheduleCache.length + ' слотов');
    }
  } catch(e) { console.error('[cache] Ошибка загрузки расписания:', e.message); }
}, 3000);