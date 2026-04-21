# ERA Apartments — Project Documentation для Claude Code

> Этот файл — полное описание проекта для Claude Code.
> Читай его перед любым изменением кода.
> Последнее обновление: апрель 2026

---

## 🏢 О ПРОЕКТЕ

**ERA Apartments** — система управления краткосрочной арендой апартаментов в Валенсии (Испания).
Владелец: Георгий. Управление через Telegram-бота + веб-приложение на Supabase/Lovable.

---

## 🖥️ ИНФРАСТРУКТУРА

### Сервер
- **Hetzner** — Linux (Ubuntu), IP: 95.217.46.40
- ⚠️ Бот перенесён с Windows на Linux — все пути теперь Linux-стиль
- **Путь бота:** `/srv/claude-hub/projects/aparts-united/era-bot/`
- **Основной файл:** `/srv/claude-hub/projects/aparts-united/era-bot/bot.js`

### Запуск / остановка бота
```bash
# Остановить
pkill -f "node bot.js"
# или
pm2 stop era-bot

# Запустить
cd /srv/claude-hub/projects/aparts-united/era-bot
node bot.js
# или если настроен pm2:
pm2 start era-bot

# Проверить статус
pm2 status
# или
ps aux | grep node
```

> ⚠️ Уточни у Георгия как именно запускается бот на Linux (pm2 / systemd / вручную) и обнови эту секцию.

### Бэкап перед изменениями
```bash
cd /srv/claude-hub/projects/aparts-united/era-bot
cp bot.js bot_backup.js
```

### Проверка синтаксиса
```bash
node --check bot.js
```

### Технический стек
- **Runtime:** Node.js
- **База данных:** Supabase (PostgreSQL)
- **Backend API:** Supabase Edge Functions (`bot-api`) через Lovable
- **Бот API:** Telegram Bot API (`node-telegram-bot-api`)
- **Голос:** OpenAI Whisper (транскрипция) + Claude API (интерпретация)
- **PDF:** Claude API (парсинг счетов)
- **Замки:** TTLock API (euapi.ttlock.com)
- **Синхронизация броней:** iCal (каждые 15 минут + команда `/sync`)

### Переменные окружения
Файл `.env` лежит в `/srv/claude-hub/projects/aparts-united/era-bot/.env`
```
TELEGRAM_TOKEN=
BOT_SECRET=
SUPABASE_URL=
OWNER_CHAT_ID=
IRINA_CHAT_ID=
EMMA_CHAT_ID=
ALBERT_CHAT_ID=283232453
LAUNDRY_GROUP_ID=-4932651198
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
TTLOCK_CLIENT_ID=
TTLOCK_CLIENT_SECRET=
TTLOCK_USERNAME=
TTLOCK_PASSWORD=
```

### GitHub
- Репозиторий: приватный `georgen77/era-bot`
- Деплой: `git pull` в папке бота + рестарт
- Гостевой сайт: GitHub Pages (`era-guest.html`)

---

## 🏠 АПАРТАМЕНТЫ

| ID в системе | Название | Замки TTLock |
|---|---|---|
| `piral_1` | Оазис 1 (О1) | lockId: 18763918, спа: 17498988 |
| `piral_2` | Оазис 2 (О2) | lockId: 9774531, спа: 19463642 |
| `grande` | Гранде | — |
| `salvador` | Сальвадор | lockId: 15975416 |

### WiFi и доступы

**Оазис 1 и Оазис 2** (один роутер):
- WiFi 4G: `DIGIFIBRA-Nh2R_AUSSEN`
- WiFi 5G: `DIGIFIBRA-PLUS-Nh2R`
- Пароль: `3AxuKEb74y`

**Сальвадор:**
- WiFi 4G: `DIGIFIBRA-pu43`
- WiFi 5G: `DIGIFIBRA-PLUS-PU43`
- Пароль: `A7AFZSTRkU`

### Chekin ссылки (статичные, одна на апарт)
- О1: `https://guest.chekin.com/X3r2MLNHToYTzCHVlOAzLw-housing`
- О2: `https://guest.chekin.com/KQGH9ZTPTvPDrs7C0Tn2WQ-housing`
- Сальвадор: `https://guest.chekin.com/h6GesJniQhKDArElZPCy6g-housing`

### Стандартное время
- Заезд: 15:00
- Выезд: 11:00

---

## 👥 КОМАНДА

| Роль | Имя | Переменная |
|---|---|---|
| Владелец/Админ | Георгий | `OWNER_CHAT_ID` |
| Координатор | Ирочка | `IRINA_CHAT_ID` |
| Платежи | Эммочка | `EMMA_CHAT_ID` |
| Прачечная | Альберт (Piña Colada) | `ALBERT_CHAT_ID=283232453` |

**Уборщицы** хранятся в таблице `cleaners` в Supabase.

**Группы Telegram:**
- Прачечная: ERA-LINEN / Стирка Era Deluxe (`LAUNDRY_GROUP_ID=-4932651198`)
- ⚠️ В эту группу НЕ слать расписание смен — только белья

---

## 🤖 TELEGRAM БОТ

### Текущая версия
Смотри строку `ERA Bot vXX запущен!` в bot.js

### Роли пользователей
- **Admin** — Георгий, Ирочка, Эммочка
- **Albert** — особая роль (по `ALBERT_CHAT_ID`)
- **Cleaner** — уборщицы (по `telegram_id` в таблице `cleaners`)
- **Group** — групповые чаты (отрицательный `chat_id`)

### AI-помощник
- Работает только в **личных чатах** (не в группах)
- Голос: Whisper → расшифровка → Claude → команда

### Ключевые функции бота

**Уборщицы:** расписание, запись на смены, грязное бельё, начало/конец уборки

**Администраторы:** управление расписанием, коды TTLock голосом, финансы, PDF-парсинг чеков

**Альберт:** форма привёз/забрал бельё, отчёт расхождений

### Callback data правила
- Максимум **64 символа** (ограничение Telegram)
- Кириллицу в callback_data НЕ использовать
- Уборщицы по индексу: `sc_SLOTID_INDEX`

---

## 🗄️ БАЗА ДАННЫХ (Supabase)

### Основные таблицы
| Таблица | Описание |
|---|---|
| `bookings` | Брони (iCal + ручные) |
| `cleaners` | Уборщицы |
| `cleaning_slots` | Слоты уборок |
| `dirty_linen_records` | Грязное бельё |
| `albert_visits` | Визиты Альберта |
| `incomes` | Доходы |
| `expenses` | Расходы |
| `tasks` | Задачи |

### Таблица `bookings` — важные поля
```
id, apartment, checkin_date, checkout_date,
guests_count, source, price, gap_days,
tasks (jsonb), tasks_assigned
```

### Backend API (Edge Function `bot-api`)
`POST /functions/v1/bot-api` с заголовком `x-bot-secret`

---

## 🔒 TTLOCK

**Lock IDs:**
```
piral_1:  main=18763918, spa=17498988
piral_2:  main=9774531,  spa=19463642
salvador: main=15975416
```
**API:** `https://euapi.ttlock.com`
**Время по умолчанию:** заезд 15:00, выезд 11:00

---

## 🧺 БЕЛЬЁ

**Категории (`LINEN_ITEMS`) — key → name:**
```
sheets         → Простыни
duvet_covers   → Пododея
pillowcases    → Наволочки
large_towels   → Бол.пол
small_towels   → Мал.пол
kitchen_towels → Кух.пол
rugs           → Коврики
beach_mat      → Пляж.кор
mattress_pad   → Наматрасники
```
⚠️ В Supabase enum `item_type` всегда передавать **английский key**, не русское name!

---

## 🌐 ГОСТЕВОЙ ПОРТАЛ

**Файл:** `GuestPortal.jsx` — вставить в Lovable как страницу `/guest/:token`
**Архитектура:** бот создаёт уникальный токен → Supabase хранит данные → портал рендерится динамически
**Бот:** `create_guest_portal` action → возвращает URL → бот отправляет гостю
**Языки:** 6 (автоопределение по браузеру)
**Контент:** WiFi, Chekin-ссылка, даты заезда/выезда, достопримечательности, рестораны, спа (О1)

> ⚠️ `era-guest.html` (старый статичный сайт на GitHub Pages) — устарел, не используется.

---

## ⚠️ КРИТИЧЕСКИЕ ПРАВИЛА

1. **Бэкап перед любым изменением:** `cp bot.js bot_backup.js`
2. **Синтаксис после изменений:** `node --check bot.js`
3. **Bump версии** при каждом изменении: `ERA Bot vXX → vXX+1`
4. **Callback data ≤ 64 символов**, только латиница
5. **AI-помощник только в личных чатах**
6. **Enum item_type** → всегда английский key
7. **Группа Альберта** (`LAUNDRY_GROUP_ID`) → только бельё, не расписание

---

## 📁 СТРУКТУРА ФАЙЛОВ

```
/srv/claude-hub/projects/aparts-united/era-bot/
├── bot.js              ← основной файл бота
├── ttlock.js           ← модуль TTLock замков
├── task_types.json     ← типы заданий для уборщиц
├── tts_settings.json   ← настройки голоса TTS
├── package.json        ← зависимости npm
├── .env                ← секреты (НЕ коммитить!)
└── bot_backup.js       ← бэкап (создаётся вручную перед изменениями)
```

> `era-guest.html` (старый статичный сайт на GitHub Pages) — **не используется**, заменён на `GuestPortal.jsx`.

---

## 💡 ПАТТЕРНЫ В КОДЕ

```javascript
// Роли
function isAdmin(chatId) { return [OWNER_CHAT_ID, IRINA_CHAT_ID, EMMA_CHAT_ID].includes(String(chatId)); }
function isAlbert(chatId) { return String(chatId) === ALBERT_CHAT_ID; }
function isGroup(msg) { return msg.chat.id < 0; }

// Запрос к Supabase
async function apiCall(action, body = {}) {
  const res = await axios.post(`${SUPABASE_URL}/functions/v1/bot-api`,
    { action, ...body },
    { headers: { 'x-bot-secret': BOT_SECRET } }
  );
  return res.data;
}
```

---

*Контекст проекта. При изменениях — обновляй этот файл!*
*Рабочий журнал и задания: `ERA_WORKLOG.md` в этой же папке*
