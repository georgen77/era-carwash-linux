# ⚠️ УСТАРЕВШИЙ ФАЙЛ — НЕ ИСПОЛЬЗОВАТЬ

> Этот файл содержит старую документацию с Windows-путями.
> **Актуальная документация:** `ERA_PROJECT.md` (Linux, текущая структура).
> Этот файл оставлен только как архив истории переноса с Windows на Linux.

---

# ERA Apartments — Project Documentation для Claude Code [АРХИВ - WINDOWS]

> Последнее обновление: апрель 2026 (до переноса на Linux)

---

## 🏢 О ПРОЕКТЕ

**ERA Apartments** — система управления краткосрочной арендой апартаментов в Валенсии (Испания).
Владелец: Георгий. Управление через Telegram-бота + веб-приложение на Supabase/Lovable.

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
| Владелец/Адмін | Георгий | `OWNER_CHAT_ID` |
| Координатор | Ирочка | `IRINA_CHAT_ID` |
| Платежи | Эммочка | `EMMA_CHAT_ID` |
| Прачечная | Альберт (Piña Colada) | `ALBERT_CHAT_ID=283232453` |

**Уборщицы** хранятся в таблице `cleaners` в Supabase. Включают: Марьяна, Ольга (Вика), Helga и др.

**Группы Telegram:**
- Прачечная: ERA-LINEN / Стирка Era Deluxe (`LAUNDRY_GROUP_ID=-4932651198`)

---

## 🖥️ ИНФРАСТРУКТУРА

### Сервер
- **Hetzner** — Windows Server
- Путь бота: `C:\era-bot\bot.js`
- Запуск: Windows Task Scheduler, задача `"ERA-Telegram-Bot"`
- Старт: `Start-ScheduledTask -TaskName "ERA-Telegram-Bot"`
- Стоп: `Get-Process node | Stop-Process -Force`

### Технический стек
- **Runtime:** Node.js
- **База данных:** Supabase (PostgreSQL)
- **Backend API:** Supabase Edge Functions (`bot-api`) через Lovable
- **Бот API:** Telegram Bot API (`node-telegram-bot-api`)
- **Голос:** OpenAI Whisper (транскрипция) + Claude API (интерпретация)
- **PDF:** Claude API (парсинг счетов)
- **Замки:** TTLock API (euapi.ttlock.com)
- **Синхронизация броней:** iCal (каждые 15 минут + команда `/sync`)

### Переменные окружения (`.env` в `C:\era-bot\`)
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
- Репозиторий: приватный, `era-bot`
- Деплой: `git pull` на Hetzner + рестарт Task Scheduler
- Гостевой сайт: GitHub Pages (`era-guest.html`)

---

## 🤖 TELEGRAM БОТ

### Текущая версия
**bot.js v26+** (точную версию смотри в файле по строке `ERA Bot vXX запущен!`)

### Роли пользователей
- **Admin** — Георгий, Ирочка, Эммочка (по `OWNER_CHAT_ID`, `IRINA_CHAT_ID`, `EMMA_CHAT_ID`)
- **Albert** — особая роль, отдельный флоу (по `ALBERT_CHAT_ID`)
- **Cleaner** — уборщицы (по `telegram_id` в таблице `cleaners`)
- **Group** — групповые чаты (определяется по отрицательному `chat_id`)

### AI-помощник
- Работает только в **личных чатах** (не в группах)
- Голосовые сообщения: Whisper → расшифровка → Claude → интерпретация команды
- Текстовые AI-запросы: только в личке

### Ключевые функции бота

**Для уборщиц:**
- Расписание и запись на смены
- Просмотр своих смен
- Фиксация грязного белья (количество по категориям)
- Начало / окончание уборки
- Запись до 12:00 в день смены

**Для администраторов:**
- Управление расписанием (удаление, замена)
- Создание/изменение кодов TTLock голосом
- Финансовые сводки (номинальный и фактический баланс)
- История визитов Альберта
- Уведомления о новых бронях
- PDF-парсинг счетов через Claude

**Для Альберта:**
- Двухшаговая форма: привёз / забрал бельё
- Отчёт о расхождениях
- Финансовые итоги

### Callback data правила
- Максимум **64 символа** (ограничение Telegram)
- Кириллические имена НЕ использовать в callback_data (превышение лимита)
- Уборщицы выбираются по индексу: `sc_SLOTID_INDEX`

---

## 🗄️ БАЗА ДАННЫХ (Supabase)

### Основные таблицы
| Таблица | Описание |
|---|---|
| `bookings` | Брони (синхр. из iCal + ручные) |
| `cleaners` | Уборщицы (имя, telegram_id, активна) |
| `cleaning_slots` | Слоты уборок (апарт, дата, уборщица) |
| `dirty_linen_records` | Записи грязного белья |
| `albert_visits` | Визиты Альберта (прачечная) |
| `incomes` | Доходы |
| `expenses` | Расходы |
| `tasks` | Задачи |

### Таблица `bookings` — важные поля
```
id, apartment, checkin_date, checkout_date,
guests_count, source (airbnb/holidu/direct),
price, gap_days, tasks (jsonb), tasks_assigned
```

### Backend API (Edge Function `bot-api`)
Все запросы через `POST /functions/v1/bot-api` с заголовком `x-bot-secret`.

Реализованные actions:
- `get_bookings`, `get_booking_by_id`, `get_bookings_summary`
- `get_cleaners`, `get_cleaner_stats`, `query_all_cleaners`
- `get_cleaning_slots`, `create_cleaning_slot`, `update_cleaning_slot`
- `get_dirty_linen_balance`, `create_dirty_linen_record`
- `get_albert_visits`, `get_albert_visit_detail`, `create_albert_visit`
- `get_financial_balance`, `create_income`, `create_expense`
- `sync_ical`

---

## 🔒 TTLOCK ИНТЕГРАЦИЯ

### Файл `ttlock.js` (`C:\era-bot\ttlock.js`)

**Lock IDs:**
```javascript
piral_1: { main: 18763918, spa: 17498988 }
piral_2: { main: 9774531,  spa: 19463642 }
salvador: { main: 15975416 }
```

**API эндпоинт:** `https://euapi.ttlock.com`

**Авторизация:**
- `POST /oauth2/token` — получить access_token
- username: `georgen77@gmail.com`
- password: MD5-хеш
- clientId из `.env` (начинается с `f5cff7ea...`)
- clientSecret из `.env`

**Стандартное время кода:**
- Начало: день заезда 15:00
- Конец: день выезда 11:00

**Нестандартное время (голосовая команда):**
- "сделай код Сальвадор 4784 на 15 апреля с 10 утра до 5 вечера"
- Парсится: апарт + код + дата заезда + время заезда + время выезда
- Если время выезда не указано → берётся из следующей брони или 11:00

---

## 🧺 БЕЛЬЁ (Прачечная)

**Категории белья (`LINEN_ITEMS`):**
```
sheets (Простыни), duvet_covers (Пododея), pillowcases (Наволочки),
large_towels (Бол.пол), small_towels (Мал.пол),
kitchen_towels (Кух.пол), rugs (Коврики),
beach_mat (Пляж.коврики), mattress_pad (Наматрасники)
```

**Группы грязного белья:**
- `dirty_linen_piral` — для Оазис 1, Оазис 2, Гранде
- `dirty_linen_salvador` — для Сальвадора

**Уборщица выбирает апарт → вводит количество кнопками → отправляет Альберту.**

---

## 🌐 ГОСТЕВОЙ САЙТ

**Файл:** `era-guest.html`
**Хостинг:** GitHub Pages
**URL параметр:** `?apt=o1` / `?apt=o2` / `?apt=sal`

**Возможности:**
- 6 языков (автоопределение по браузеру)
- WiFi данные апартамента
- Chekin ссылка
- Погода в Валенсии (Open-Meteo API, бесплатно)
- 10 ресторанов, 10 достопримечательностей
- Спа-блок + видео инструкции (только Оазис 1)
- Видео: `SAUNA_VIDEO_URL`, `SOFA_VIDEO_URL` (YouTube — нужно уточнить у Георгия)

---

## ⚠️ КРИТИЧЕСКИЕ ПРАВИЛА ДЛЯ ИЗМЕНЕНИЙ

### 1. Всегда делать бэкап
```powershell
Copy-Item C:\era-bot\bot.js C:\era-bot\bot_backup.js -Force
```

### 2. Проверять синтаксис перед деплоем
```bash
node --check bot.js
```

### 3. Не использовать Python str_replace для multiline строк
Это вызывает повреждение файла. Использовать только `str_replace_editor` или прямую замену в Node.js.

### 4. Callback data ≤ 64 символов
Никогда не вставлять кириллицу в `callback_data`. Только латиница + цифры + `_`.

### 5. AI-помощник только в личных чатах
```javascript
if (!isGroup(msg)) { /* AI logic */ }
```

### 6. Bump версии при каждом изменении
Менять строку `ERA Bot vXX запущен!` на следующий номер.

### 7. Рестарт после изменений
```powershell
Get-Process node | Stop-Process -Force
Start-ScheduledTask -TaskName "ERA-Telegram-Bot"
```

---

## 📋 АКТУАЛЬНЫЕ ЗАДАЧИ (на момент написания)

### 🔴 Критично
1. **Уведомление при записи уборщицы** — не показывает даты брони (заезд/выезд)
   - Нужно: `"Helga записалась на уборку · Сальвадор · Заезд: 01.05 · Выезд: 03.05 · Гостей: 4"`

2. **Карточка брони в календаре** — показывает только выезд, нужно добавить заезд
   - Нужно: `Заезд: 15 апр. · Выезд: 22 апр.` — заезд вынести наверх, рядом с выездом

3. **Нестандартное время кода** — голосовая команда не парсит кастомное время
   - Пример: `"сделай код Сальвадор 4784 на 15 апреля с 10 утра до 5 вечера"`
   - Должно: заезд 15.04 в 10:00, выезд — смотреть бронь → время 17:00

### 🟡 Важно
4. **Деплой через GitHub** — настроить `git pull` + авторестарт на Hetzner
5. **Голосовые команды** — проверить что работают после последнего деплоя
6. **Баг грязного белья** — данные не сохраняются при нажатии кнопки уборщицей

---

## 🔄 ПРОЦЕСС ДЕПЛОЯ

### Текущий (ручной)
1. Изменить `bot.js`
2. Скопировать в `C:\era-bot\bot.js` на Hetzner
3. ```powershell
   Get-Process node | Stop-Process -Force
   Start-ScheduledTask -TaskName "ERA-Telegram-Bot"
   ```

### Целевой (через GitHub)
```
Изменение файла
   → git add . && git commit -m "fix: описание"
   → git push
   → на Hetzner: git pull
   → Stop/Start Task Scheduler
   → бот обновлён ✅
```

### Deploy скрипт (`deploy.ps1` на Hetzner)
```powershell
cd C:\era-bot
git pull
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-ScheduledTask -TaskName "ERA-Telegram-Bot"
Write-Host "✅ Deployed at $(Get-Date)"
```

---

## 📁 СТРУКТУРА ФАЙЛОВ

```
C:\era-bot\
├── bot.js              ← основной файл бота (НЕ трогать без бэкапа!)
├── ttlock.js           ← модуль TTLock замков
├── apt_settings.json   ← настройки апартаментов (WiFi, адрес и др.)
├── .env                ← секреты (НЕ коммитить в git!)
├── deploy.ps1          ← скрипт деплоя
└── bot_backup.js       ← бэкап перед изменениями
```

---

## 💡 ВАЖНЫЕ ПАТТЕРНЫ В КОДЕ

### Определение ролей
```javascript
function isAdmin(chatId) { return [OWNER_CHAT_ID, IRINA_CHAT_ID, EMMA_CHAT_ID].includes(String(chatId)); }
function isAlbert(chatId) { return String(chatId) === ALBERT_CHAT_ID; }
function isGroup(msg) { return msg.chat.id < 0; }
```

### Запрос к Supabase через bot-api
```javascript
async function apiCall(action, body = {}) {
  const res = await axios.post(`${SUPABASE_URL}/functions/v1/bot-api`,
    { action, ...body },
    { headers: { 'x-bot-secret': BOT_SECRET } }
  );
  return res.data;
}
```

### Форматирование даты
```javascript
function fmtDateShort(d) { /* возвращает "15 апр." */ }
function fmtDate(d)      { /* возвращает "15.04.2026" */ }
```

### iCal автосинхронизация
- Каждые 15 минут через `setInterval`
- Команда `/sync` — ручной запуск
- Action: `sync_ical` в bot-api

---

*Документ подготовлен на основе всей истории переписки проекта ERA Apartments.*
*При изменениях — обновляй этот файл!*
