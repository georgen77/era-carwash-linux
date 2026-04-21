# ERA Deluxe Apartments — Telegram Bot
## Документ для Claude Code · Обновлён 16.04.2026

---

## 🎯 О ПРОЕКТЕ

Telegram-бот для управления сетью краткосрочных апартаментов в Валенсии, Испания.
Автоматизирует: координацию уборщиц, логистику белья, финансовый учёт, TTLock замки, уведомления.

**Файл бота:** `/srv/claude-hub/projects/aparts-united/era-bot/bot.js`
**Runtime:** Node.js на Linux (Ubuntu), Hetzner, IP: 95.217.46.40
**Деплой:** `git pull` + рестарт через pm2 или pkill
**GitHub:** `github.com/georgen77/era-bot` (ветка master)

---

## 🏠 АПАРТАМЕНТЫ

| ID в коде | Название | Адрес | Chekin URL |
|---|---|---|---|
| `piral_1` | Оазис 1 | Isaac Peral 19 bajo | `guest.chekin.com/X3r2MLNHToYTzCHVlOAzLw-housing` |
| `piral_2` | Оазис 2 | Isaac Peral 19 bajo | `guest.chekin.com/KQGH9ZTPTvPDrs7C0Tn2WQ-housing` |
| `salvador` | Сальвадор | Felipe Salvador 7, Bajo A Derecha | `guest.chekin.com/h6GesJniQhKDArElZPCy6g-housing` |
| `grande` | Гранде | — | использует ссылку Оазис 1 |

**WiFi Оазис 1 и 2:** DIGIFIBRA-Nh2R_AUSSEN / DIGIFIBRA-PLUS-Nh2R · пароль: `3AxuKEb74y`
**WiFi Сальвадор:** DIGIFIBRA-pu43 / DIGIFIBRA-PLUS-PU43 · пароль: `A7AFZSTRkU`

```javascript
// APT_NAMES в боте:
const APT_NAMES = {
  piral_1: 'Оазис 1',
  piral_2: 'Оазис 2',
  grande: 'Гранде',
  salvador: 'Сальвадор'
};
```

---

## 👥 КОМАНДА И РОЛИ

| Переменная | Роль | Telegram |
|---|---|---|
| `OWNER_CHAT_ID` | Владелец (Георгий) | из .env |
| `IRINA_CHAT_ID` | Ирочка — координатор | из .env |
| `EMMA_CHAT_ID` | Эммочка — платежи | из .env |
| `ALBERT_CHAT_ID` | Альберт — прачечная Piña Colada | `283232453` |
| `LAUNDRY_GROUP_ID` | Группа ERA-LINEN / Стирка Era Deluxe | `-4932651198` |

**Функции проверки:**
```javascript
isAdmin(id)        // Ирочка, Эммочка, Владелец
isAlbert(id)       // только Альберт
isLaundryGroup(id) // группа белья
isAdminOrAlbert(id)
```

---

## 🔧 ТЕХНИЧЕСКИЙ СТЕК

### Зависимости (package.json)
- `node-telegram-bot-api` — Telegram Bot API
- `axios` — HTTP запросы к Supabase и Claude API
- `node-ical` — парсинг iCal для синхронизации броней
- `openai` — Whisper для голосовых команд

### Переменные окружения (.env)
```
TELEGRAM_TOKEN=
SUPABASE_URL=                  # URL Supabase проекта
SUPABASE_SERVICE_ROLE_KEY=     # ключ сервисной роли
ANTHROPIC_API_KEY=             # для голосовых команд и PDF
TTLOCK_CLIENT_ID=              # TTLock замки
TTLOCK_USERNAME=
TTLOCK_PASSWORD=
IRINA_CHAT_ID=
EMMA_CHAT_ID=
OWNER_CHAT_ID=
```

### Backend (Supabase через Edge Functions)
Все запросы идут через:
```javascript
async function api(action, data) {
  // POST SUPABASE_URL/functions/v1/bot-api
  // { action: '...', ...data }
}
```

**Все используемые actions:**
- `get_schedule` — расписание уборок (scheduleCache)
- `get_booking_by_id` — бронь по ID
- `get_bookings_by_period` — брони за период
- `get_bookings_summary` — сводка броней
- `get_bookings_with_spa` — брони со спа
- `get_bookings_with_tasks` — брони с заданиями
- `get_bookings_without_income` — брони без дохода
- `get_financial_balance` — финансовый баланс
- `get_financial_summary` — финансовая сводка
- `get_transactions_by_period` — транзакции за период
- `calculate_laundry_cost` — стоимость стирки
- `create_guest_portal` — создание гостевого портала
- `sync_ical` — синхронизация iCal броней
- `auto_confirm_pending` — автоподтверждение

---

## 📋 СТРУКТУРА ФАЙЛОВ

```
/srv/claude-hub/projects/aparts-united/era-bot/
├── bot.js              ← ГЛАВНЫЙ ФАЙЛ (~5350 строк)
├── ttlock.js           ← TTLock API интеграция
├── deploy.ps1          ← старый скрипт деплоя (Windows, устарел)
├── .env                ← секреты (НЕ в git)
├── task_types.json     ← типы заданий для уборщиц
├── tts_settings.json   ← настройки голоса
├── watcher.ps1         ← мониторинг процесса (Windows, устарел)
├── install-service.js  ← скрипт установки сервиса (устарел)
├── setup-watcher.bat   ← BAT-скрипт (Windows, устарел)
├── package.json        ← зависимости npm
└── node_modules\       ← зависимости (НЕ в git)
```

> ⚠️ `era-guest.html` (старый гостевой сайт на GitHub Pages) — **удалён**, заменён на `GuestPortal.jsx` в Lovable.

---

## 🏗️ АРХИТЕКТУРА БОТА

### Глобальное состояние
```javascript
let scheduleCache = [];          // кэш расписания уборок
let sessions = {};               // сессии пользователей { chatId: { step, ...data } }
let seenBookings = new Set();    // виденные брони (persist в seen_bookings.json)
let aptSettings = {};            // настройки апартаментов
let taskTypes = [];              // типы заданий
let ttsSettings = {};            // настройки TTS
```

### Паттерн сессий (state machine)
```javascript
// Установка шага
sessions[chatId] = { step: 'linen_counting', apt: 'piral_1', linen: {} };

// Обработка в bot.on('message')
if (sessions[chatId]?.step === 'linen_counting') { ... }
```

**Все шаги сессий:**
- `linen_form` — форма грязного белья (уборщица)
- `linen_counting` — подсчёт белья
- `albert_visit_location` — визит Альберта: локация
- `albert_visit_brought` — Альберт привёз
- `albert_pickup` — Альберт забирает
- `albert_pickup_confirm` — подтверждение забора
- `albert_delivery_items` — позиции доставки
- `albert_doc_upload` — загрузка документа Альбертом
- `inv_upload_file` — загрузка счёта
- `inv_upload_amount` — сумма счёта
- `inv_confirm` — подтверждение счёта
- `inv_pay_amount` — сумма оплаты Альберту
- `inv_pay_file` — подтверждение оплаты
- `voice_confirm` — подтверждение голосовой команды
- `task_form` — форма заданий для уборки
- `replace_cleaner_manual` — замена уборщицы
- `set_period` — установка периода
- `period_menu` — меню периода
- `lock_custom_code` — ввод кастомного кода замка
- `lock_extend` — продление кода
- `lock_del_confirm` — удаление кода
- `ttset_field` / `ttset_albert_code` — настройки TTLock
- `inc_amount` — ввод суммы дохода
- `expense_await_receipt` — ожидание чека расхода
- `bk_comment` — комментарий к брони
- `set_guests_btn` — установка кол-ва гостей
- `dist_input` — распределение белья
- `gm_edit_wait` — редактирование гостевого сообщения

### Callback data паттерны
```javascript
// ВАЖНО: лимит 64 символа на callback_data!
// Кириллица в callback = ошибка. Использовать числовые индексы.

'su_' + slotId        // signup — запись уборщицы на смену
'gc_' + slotId        // grande cleaner signup
'rep_' + slotId       // replace cleaner
'nt_' + slotId        // new task
'inc_add_' + slotId   // add income
'lock_new_' + apt + '|' + checkin + '|' + checkout
'la_' + apt           // linen apartment
'gu_' + slotId        // set guests
'av_detail_' + id     // albert visit detail
'bk_' + bookingId     // booking detail
```

---

## ⚙️ КЛЮЧЕВЫЕ ФУНКЦИИ

### Форматирование
```javascript
fmtDate(d)       // '15.04.2026'
fmtDateShort(d)  // '15.04'
fmtTime(d)       // '14:30'
fmtDateShort(null) // '?'
```

### Апартаменты
```javascript
normalizeApt(apt)  // 'Оазис 1' / 'oasis 1' / 'piral1' → 'piral_1'
APT_NAMES[apt]     // 'piral_1' → 'Оазис 1'
```

### Уведомления
```javascript
notifyAdmins(text, opts)   // всем трём (Ирочка, Эммочка, Владелец)
notifyIrina(text, opts)    // только Ирочке
```

### Расписание
```javascript
findSlot(cache, apartment, date)  // найти слот по апартаменту и дате
getGuestsForCleaner(slot, allSlots) // кол-во гостей следующего заезда
```

### API
```javascript
await api('get_schedule')          // → { data: [...slots] }
await api('sync_ical')             // синхронизация iCal
await api('get_financial_balance') // → { data: { nominal, factual } }
```

---

## 🔒 TTLOCK ЗАМКИ

```javascript
// Файл: ttlock.js
// Переменная: TTLOCK_ENABLED = true если CLIENT_ID и USERNAME заданы

await ttlock.createGuestCode(
  apartment,    // 'piral_1' | 'piral_2' | 'salvador' | 'grande'
  checkinDate,  // '2026-04-15' ISO строка
  checkoutDate, // '2026-04-19' ISO строка
  hasSpa,       // boolean — для Оазис 1
  customCode,   // null или строка '4784'
  startMs,      // timestamp в мс (опционально)
  endMs         // timestamp в мс (опционально)
)
// Возвращает: { codeDisplay, startTime, endTime, ... }
```

**Время по умолчанию:**
- Заезд: 15:00
- Выезд: 11:00

**Нестандартное время** (голосовые команды):
- `checkin_time` в cmd — время В ДЕНЬ ЗАЕЗДА (HH:MM)
- `checkout_time` в cmd — время В ДЕНЬ ВЫЕЗДА брони

---

## 🎤 ГОЛОСОВЫЕ КОМАНДЫ

```javascript
async function parseVoiceCommand(text, scheduleData)
// Использует claude-haiku-4-5-20251001 для парсинга
// Возвращает JSON с action и параметрами
```

**Actions голосовых команд:**
- `lock_create` — создать код замка
- `lock_extend` — продлить код
- `lock_extend_albert` — продлить код Альберта
- `lock_query` — запросить текущий код
- `lock_delete` — удалить код
- `add_income` — добавить доход
- `add_spa` — добавить спа доход
- `add_batch_income` — добавить несколько доходов
- `add_expense` — добавить расход
- `sync_ical` — синхронизировать iCal
- `smart_query` — умный запрос к данным
- `query_today` / `query_tomorrow` / `query_week` — расписание
- `show_period` — показать период

**Парсинг времени:**
```
"с 10 утра"     → checkin_time: "10:00"
"до 5 вечера"   → checkout_time: "17:00"
"до часу дня"   → checkout_time: "13:00"
"до полудня"    → checkout_time: "12:00"
```

---

## 📅 АВТОМАТИЧЕСКИЕ ЗАДАЧИ (setInterval)

```javascript
// iCal синхронизация — каждые 15 минут
setInterval(() => syncIcal(null, null), 15 * 60 * 1000);

// Уведомления о завтрашних заездах — ежедневно в 10:00
scheduleDaily(10, 0, notifyTomorrowCheckins);

// Уведомления о сегодняшних выездах — ежедневно в 8:00
scheduleDaily(8, 0, notifyTodayCheckouts);

// Автоподтверждение pending — каждые 30 минут
setInterval(() => api('auto_confirm_pending'), 30 * 60 * 1000);

// Обновление scheduleCache — каждые 5 минут
setInterval(async () => {
  var r = await api('get_schedule');
  if (r.data?.length > 0) scheduleCache = r.data;
}, 5 * 60 * 1000);
```

---

## 🧺 ЛОГИКА БЕЛЬЯ (АЛЬБЕРТ)

**Поток "Привёз":**
1. Нажимает "✨ Альберт привёз" → `step: albert_visit_location`
2. Выбирает откуда забрал (локации)
3. Заполняет форму позиций (простыни, пододеяльники, наволочки, полотенца)
4. Подтверждает → создаётся визит в `albert_visits` таблице Supabase

**Поток "Забрал":**
1. Нажимает "🚚 Альберт забрал" → выбор апартамента
2. Вводит позиции → `step: albert_pickup_confirm`
3. Подтверждает → запись в Supabase

**Таблица:** `albert_visits` в Supabase

---

## 📝 УВЕДОМЛЕНИЯ УБОРЩИЦ

### Запись на уборку
```javascript
async function notifyCleanerSignup(firstName, aptName, slotData, now)
// Отправляет всем админам:
// "📝 *Helga* записалась на уборку
//  🏠 Сальвадор
//  📅 Заезд: 01.05 · Выезд: 03.05   ← ИСПРАВЛЕНО v83
//  👥 Гостей: 4"
```

### Начало смены
```javascript
// Отправляется уборщице при нажатии "🟢 Начать уборку"
// Включает задания, кол-во гостей следующего заезда
```

---

## 🗓️ КАЛЕНДАРЬ (scheduleCache)

Структура слота:
```javascript
{
  id: 'uuid',
  apartment: 'piral_1',
  checkout_date: '2026-04-22T10:00:00',  // ISO
  checkin_date: '2026-04-15T15:00:00',   // ISO — дата СЛЕДУЮЩЕГО заезда
  cleaner_name: 'Ольга',
  cleaner_telegram_id: '123456',
  guests_count: 3,
  next_guests: 4,
  source: 'airbnb',
  special_instructions: '...',
  income_amount: 350,
  tasks: '[{"type":"checkbox","name":"Спа","enabled":true}]'
}
```

**Карточка дня в календаре:**
```
📅 Заезд: 15.04 · Выезд: 22.04   ← ИСПРАВЛЕНО v83
👥 3 г · 🧹 Ольга
```

---

## 🐛 ИЗВЕСТНЫЕ ПРОБЛЕМЫ И ИСТОРИЯ ФИКСОВ

### Зафиксировано в v83 (16.04.2026)
- ✅ Уведомление уборщицы: добавлены обе даты (заезд + выезд)
- ✅ Карточка календаря: показывает заезд и выезд вместе
- ✅ Голосовые команды: улучшен парсинг нестандартного времени

### Открытые баги
- ⚠️ `seen_bookings.json` — при перезапуске бота старые брони рассылаются заново (файл не сохраняется атомарно)
- ⚠️ Голосовые команды с нестандартным временем: `checkout_time` берётся из команды но дата выезда иногда не находится через бронь
- ⚠️ TTLock: периодически ошибка 10000 (client_id vs clientId в запросе)
- ⚠️ Уборщица: при нажатии "🧺 Грязное бельё" не всегда автоопределяется апартамент из активной смены

---

## 📐 ПРАВИЛА РАЗРАБОТКИ

### Обязательно
1. **Бэкап перед изменениями:** `copy C:\era-bot\bot.js C:\era-bot\Backups\bot_YYYYMMDD.js`
2. **callback_data лимит 64 символа** — никогда не использовать кириллицу в callback_data
3. **Числовые индексы** вместо имён в callback: `sc_SLOTID_INDEX` не `sc_SLOTID_ОЛЯ`
4. **Тест после каждого изменения** — запустить deploy.ps1 и проверить что бот отвечает

### Стиль кода
- `var` вместо `let/const` (исторически в этом проекте)
- `async/await` для всех асинхронных операций
- try/catch вокруг всех API вызовов
- Логи с префиксами: `[cache]`, `[sync_ical]`, `[ttlock]`, `[auto]`

### Деплой (Linux)
```bash
# 1. Бэкап
cd /srv/claude-hub/projects/aparts-united/era-bot
cp bot.js bot_backup.js

# 2. Изменения в файлы

# 3. Проверка синтаксиса
node --check bot.js

# 4. Коммит и пуш
git add bot.js
git commit -m "fix: описание что исправили"
git push

# 5. Рестарт
pm2 restart era-bot
# или
pkill -f "node bot.js" && node bot.js &
```

---

## 🔄 WORKFLOW С CLAUDE (чат) + CLAUDE CODE

1. **Claude (чат)** анализирует задачу, знает бизнес-контекст, указывает точные строки
2. **Claude Code** читает этот файл, открывает bot.js, вносит изменения
3. Claude Code делает `git commit + git push`
4. Запускается `.\deploy.ps1`
5. Проверяется результат в Telegram

**При каждой сессии Claude Code должен:**
1. Прочитать этот файл `CLAUDE.md`
2. Прочитать `ERA-PLAN.md` (текущие задачи)
3. Сделать бэкап bot.js
4. Внести изменения
5. Закоммитить с осмысленным сообщением
6. Запустить deploy.ps1

---

## 📊 ФИНАНСЫ

**Двойной баланс:**
- `nominal` — по договору/выставленным счетам
- `factual` — фактически полученные деньги

**Категории расходов:**
- `Стирка` — Альберт
- `Уборка` — уборщицы
- `Спа` — обслуживание спа
- `Коммунальные` — utilities
- `Прочее` — other

---

*Документ обновляется при каждом значимом изменении проекта.*
*Версия бота на момент создания: v83*
