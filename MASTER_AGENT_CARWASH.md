# 🤖 МАСТЕР-АГЕНТ — ERA Carwash Linux Migration
## Полностью автономный исполнитель. Читай один раз, делай всё сам.

---

## 🚨 ЖЕЛЕЗНЫЕ ПРАВИЛА (никогда не нарушать)

```
✅ Весь код — только в /srv/claude-hub/projects/era-carwash/
✅ Все коммиты/пуши — только в репо era-carwash-linux
✅ git add — ТОЛЬКО явные пути, никогда не git add .
✅ После каждого крупного шага — коммит с понятным сообщением
✅ Перед любым опасным действием — проверь pm2 list и убедись что другие проекты живы
✅ Если что-то не работает 2 раза подряд — записать в PROGRESS.md и идти дальше
🚫 НИКОГДА не трогать другие папки в /srv/claude-hub/projects/
🚫 НИКОГДА не делать apt remove, не удалять nginx конфиги других проектов
🚫 НИКОГДА не делать git push в era-aparts или era-bot
```

---

## 📍 Целевая структура на сервере

```
/srv/claude-hub/projects/era-carwash/    ← ВСЯ РАБОТА ЗДЕСЬ
├── MASTER_AGENT.md                      ← этот файл
├── PROGRESS.md                          ← лог прогресса (ты ведёшь)
├── ecosystem.config.js                  ← PM2 конфиг
├── package.json                         ← корневой (workspaces)
├── docs/
│   ├── ARCHITECTURE.md
│   ├── ENV.md
│   └── feedback/
│       ├── phase-0.md
│       ├── phase-1.md
│       ├── phase-2.md
│       └── phase-3.md
├── web/                                 ← React фронт (из era-aparts)
├── api/                                 ← Express API (24 роута)
│   ├── server.js
│   ├── package.json
│   ├── .env                             ← только env-имена, значения заполнит Georgiy
│   ├── routes/
│   │   ├── original/                    ← исходники Deno (только чтение)
│   │   └── *.js                         ← сконвертированные роуты
│   └── migrations/                      ← SQL файлы
└── bot/                                 ← Telegram бот (скопировать из текущего)
```

---

## 🔑 Переменные окружения — только структура

Реальные значения Georgiy заполнит вручную после запуска. Ты создаёшь `.env` с
**пустыми значениями** как шаблон. Не придумывай значений, не копируй из других .env.

```env
# api/.env — ШАБЛОН (заполнить вручную)
DATABASE_URL=postgresql://era_user:CHANGE_ME@localhost:5432/era_db
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
TELEGRAM_TOKEN=
TELEGRAM_BOT_TOKEN=
OWNER_CHAT_ID=
IRINA_CHAT_ID=243009130
EMMA_CHAT_ID=
ALBERT_CHAT_ID=283232453
LAUNDRY_GROUP_ID=-4932651198
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=
TTLOCK_CLIENT_ID=
TTLOCK_CLIENT_SECRET=
TTLOCK_USERNAME=
TTLOCK_PASSWORD=
BOT_SECRET=CHANGE_ME_RANDOM_STRING
APP_PASSWORD=
PORT=5001
NODE_ENV=production
```

---

## 🗺 Карта всех задач

```
[ ЭТАП 0 ] Подготовка сервера и репозитория
  0.1  Проверить что другие проекты живы (pm2 list, curl других сайтов)
  0.2  Создать GitHub репо era-carwash-linux (если нет — инструкция ниже)
  0.3  Создать /srv/claude-hub/projects/era-carwash/ и инициализировать git
  0.4  Клонировать исходники era-aparts рядом (только чтение)
  0.5  Скопировать Edge Functions в api/routes/original/
  0.6  Скопировать SQL миграции в api/migrations/
  0.7  Скопировать фронт в web/
  0.8  Скопировать бота в bot/ (из текущего /srv/claude-hub/projects/aparts-united/bot/)
  0.9  Создать корневые файлы (package.json, ecosystem.config.js, PROGRESS.md)
  0.10 Первый коммит и пуш

[ ЭТАП 1 ] Nginx и зависимости
  1.1  Проверить что установлено (node, nginx, pm2)
  1.2  Создать Nginx конфиг /etc/nginx/sites-available/era-carwash
       ← НОВЫЙ порт/домен, не трогать существующие конфиги
  1.3  Включить сайт, проверить nginx -t, перезагрузить
  1.4  Создать /var/www/era-carwash/ с заглушкой
  1.5  Проверить: curl http://EXTERNAL_IP:PORT или http://EXTERNAL_IP/era-carwash

[ ЭТАП 2 ] Express API — конвертация 24 роутов
  Порядок: простые → средние → сложные (параллельно внутри группы)

  ГРУППА A (простые — сразу создаёт server.js):
    2.A.1  api/server.js + api/package.json
    2.A.2  send-telegram.js
    2.A.3  send-telegram-notification.js
    2.A.4  send-whatsapp.js
    2.A.5  send-email.js
    2.A.6  check-password.js
    2.A.7  backup-movements.js
    2.A.8  restore-movements.js
    2.A.9  weekly-payment-reminder.js
    → npm install, pm2 start era-api, curl /api/health ✅

  ГРУППА B (средние — пока работает server.js):
    2.B.1  cleaning-auth.js
    2.B.2  cleaning-bookings.js
    2.B.3  cleaner-portal.js
    2.B.4  emma-cash.js
    2.B.5  main-cash.js
    2.B.6  task-ai-chat.js
    2.B.7  bot-movement.js
    2.B.8  whatsapp-webhook.js
    2.B.9  parse-bank-statement.js
    → раскомментировать в server.js, pm2 restart era-api

  ГРУППА C (сложные — с multer):
    2.C.1  ocr-receipt.js
    2.C.2  scan-linen.js
    2.C.3  transcribe-audio.js
    2.C.4  smart-voice-input.js
    2.C.5  sync-ical.js
    2.C.6  bot-api.js
    2.C.7  telegram-webhook.js
    → раскомментировать в server.js, pm2 restart era-api

[ ЭТАП 3 ] Фронтенд
  3.1  Заменить supabase.functions.invoke → fetch('/api/...')
       (НЕ трогать supabase.from() — пока используем Supabase как БД)
  3.2  Создать web/.env с VITE_API_URL
  3.3  npm install && npm run build
  3.4  cp -r dist/. /var/www/era-carwash/
  3.5  Проверить что страница открывается

[ ЭТАП 4 ] Финал
  4.1  Финальный коммит всего
  4.2  Записать итоговый отчёт в PROGRESS.md
  4.3  Написать инструкцию для Georgiy: что заполнить в .env
```

---

## 📋 ЭТАП 0 — Подготовка (детальные команды)

### 0.1 Проверить живые проекты

```bash
pm2 list
# Запомни какие процессы запущены — они должны остаться online после всей работы

# Проверить nginx не сломан
nginx -t
systemctl status nginx | head -5
```

### 0.2 GitHub репо

Репо `era-carwash-linux` должно уже существовать (Georgiy создаст до запуска агента).
Если не существует — создай файл `/srv/claude-hub/projects/era-carwash/WAIT_FOR_REPO.md`
с текстом: "Создайте репо era-carwash-linux на GitHub и перезапустите агента."
Затем остановись.

Проверить доступность:
```bash
git ls-remote https://github.com/$(git config user.name)/era-carwash-linux 2>/dev/null \
  && echo "РЕПО СУЩЕСТВУЕТ" || echo "РЕПО НЕ НАЙДЕНО"
```

Если нет доступа через HTTPS, проверить SSH:
```bash
git ls-remote git@github.com:$(git config user.email | cut -d@ -f1)/era-carwash-linux \
  2>/dev/null && echo "SSH OK"
```

> Примечание: возможно имя пользователя GitHub нужно подставить вручную.
> Проверь: `git config --global user.name` и `cat ~/.ssh/known_hosts | grep github`

### 0.3 Создать папку и инициализировать

```bash
mkdir -p /srv/claude-hub/projects/era-carwash
cd /srv/claude-hub/projects/era-carwash

git init
git remote add origin git@github.com:GITHUB_USERNAME/era-carwash-linux.git
# ← ЗАМЕНИТЬ GITHUB_USERNAME на реальный

# Создать .gitignore сразу
cat > .gitignore << 'GITEOF'
node_modules/
.env
dist/
.DS_Store
*.log
era-aparts-source/
GITEOF

# Создать PROGRESS.md
cat > PROGRESS.md << 'EOF'
# ERA Carwash Linux — Прогресс миграции

## Статус
**Дата старта:** $(date '+%Y-%m-%d %H:%M')
**Агент:** Мастер-агент v1

## Этапы

| Этап | Статус | Время | Заметки |
|------|--------|-------|---------|
| 0. Подготовка | ⏳ | | |
| 1. Nginx | ⏳ | | |
| 2. Express API | ⏳ | | |
| 3. Фронтенд | ⏳ | | |
| 4. Финал | ⏳ | | |

## Лог
EOF

echo "Папка создана, git инициализирован"
```

### 0.4-0.8 Скопировать исходники

```bash
cd /srv/claude-hub/projects/

# Клонировать era-aparts как источник (только если нет)
if [ ! -d "era-aparts-source" ]; then
  git clone https://github.com/GITHUB_USERNAME/era-aparts.git era-aparts-source
  echo "era-aparts-source клонирован"
else
  echo "era-aparts-source уже есть"
  cd era-aparts-source && git pull && cd ..
fi

# Создать структуру
mkdir -p era-carwash/api/routes/original
mkdir -p era-carwash/api/migrations
mkdir -p era-carwash/docs/feedback
mkdir -p era-carwash/web
mkdir -p era-carwash/bot

# Скопировать Edge Functions
cp -r era-aparts-source/supabase/functions/. era-carwash/api/routes/original/
echo "Edge Functions скопированы: $(ls era-carwash/api/routes/original/ | wc -l) папок"

# Скопировать SQL миграции
cp era-aparts-source/supabase/migrations/*.sql era-carwash/api/migrations/ 2>/dev/null \
  || echo "⚠️ SQL миграций нет — ок, продолжаем"
echo "Миграции скопированы: $(ls era-carwash/api/migrations/ 2>/dev/null | wc -l) файлов"

# Скопировать фронт
rsync -av \
  --exclude='.git' \
  --exclude='supabase/' \
  --exclude='node_modules/' \
  --exclude='.env' \
  era-aparts-source/ \
  era-carwash/web/
echo "Фронт скопирован"

# Скопировать бот (из текущего working проекта)
if [ -d "aparts-united/bot" ]; then
  rsync -av --exclude='.env' --exclude='node_modules/' \
    aparts-united/bot/ era-carwash/bot/
  echo "Бот скопирован из aparts-united/bot/"
else
  echo "⚠️ aparts-united/bot не найден — бот нужно добавить вручную"
fi
```

### 0.9 Корневые конфиги

```bash
cd /srv/claude-hub/projects/era-carwash

# Корневой package.json
cat > package.json << 'EOF'
{
  "name": "era-carwash",
  "version": "1.0.0",
  "private": true,
  "workspaces": ["web", "api", "bot"],
  "scripts": {
    "dev:api":   "cd api && node server.js",
    "build:web": "cd web && npm run build",
    "start":     "pm2 start ecosystem.config.js"
  }
}
EOF

# PM2 ecosystem — ПОРТ 5001 чтобы не конфликтовать
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name:        'era-carwash-api',
      script:      './api/server.js',
      cwd:         '/srv/claude-hub/projects/era-carwash',
      env_file:    './api/.env',
      instances:   1,
      autorestart: true,
      watch:       false,
      env: {
        PORT: 5001,
        NODE_ENV: 'production'
      }
    },
    {
      name:        'era-carwash-bot',
      script:      './bot/bot.js',
      cwd:         '/srv/claude-hub/projects/era-carwash',
      env_file:    './bot/.env',
      instances:   1,
      autorestart: true,
      watch:       false
    }
  ]
}
EOF

# Шаблон api/.env
cat > api/.env.template << 'ENVEOF'
DATABASE_URL=postgresql://era_user:CHANGE_ME@localhost:5432/era_db
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
TELEGRAM_TOKEN=
TELEGRAM_BOT_TOKEN=
OWNER_CHAT_ID=
IRINA_CHAT_ID=243009130
EMMA_CHAT_ID=
ALBERT_CHAT_ID=283232453
LAUNDRY_GROUP_ID=-4932651198
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=
TTLOCK_CLIENT_ID=
TTLOCK_CLIENT_SECRET=
TTLOCK_USERNAME=
TTLOCK_PASSWORD=
BOT_SECRET=CHANGE_ME_RANDOM_STRING
APP_PASSWORD=
PORT=5001
NODE_ENV=production
ENVEOF

# .env — пустая копия шаблона (без реальных значений)
cp api/.env.template api/.env
echo "Конфиги созданы"
```

### 0.10 Первый коммит

```bash
cd /srv/claude-hub/projects/era-carwash

git add \
  .gitignore \
  package.json \
  ecosystem.config.js \
  PROGRESS.md \
  api/.env.template \
  api/routes/original/ \
  api/migrations/ \
  docs/

git commit -m "init: project structure, edge functions sources, migrations"

# Первый пуш (установить upstream)
git push -u origin main || git push -u origin master
echo "✅ Этап 0 завершён"
```

---

## 📋 ЭТАП 1 — Nginx

```bash
# Проверить что установлено
node --version || { apt update && apt install -y nodejs; }
nginx -v || { apt install -y nginx; }
pm2 --version || npm install -g pm2

# Внешний IP
EXTERNAL_IP=$(curl -s ifconfig.me)
echo "Внешний IP: $EXTERNAL_IP"

# Nginx конфиг — отдельный файл, не трогаем существующие
cat > /etc/nginx/sites-available/era-carwash << NGINXEOF
server {
    listen 8080;
    server_name _;

    # React SPA
    location / {
        root /var/www/era-carwash;
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache";
    }

    # Express API
    location /api/ {
        proxy_pass         http://localhost:5001/api/;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_read_timeout 30s;
    }
}
NGINXEOF

# Создать папку для статики
mkdir -p /var/www/era-carwash
echo "<h1>ERA Carwash — OK ($(date))</h1>" > /var/www/era-carwash/index.html

# Включить сайт
ln -sf /etc/nginx/sites-available/era-carwash /etc/nginx/sites-enabled/era-carwash

# Проверить конфиг (не применять если ошибка)
nginx -t && systemctl reload nginx || echo "❌ Ошибка nginx конфига!"

# Проверить что остальные сайты живы
nginx -t && echo "✅ Nginx конфиг OK"

# Тест
sleep 2
curl -s http://localhost:8080 | head -3
echo "✅ Этап 1 завершён — порт 8080"
```

> ⚠️ Используем порт 8080 чтобы не конфликтовать с другими проектами на 80.
> После подключения домена — сменить на 80 с SSL.

---

## 📋 ЭТАП 2 — Express API

### Шаблон конвертации (использовать для каждого роута)

```
Deno.env.get('KEY')                     → process.env.KEY
await req.json()                         → req.body
return new Response(JSON.stringify(x))   → return res.json(x)
return new Response(null, {status: 204}) → return res.status(204).send()
import { X } from 'https://esm.sh/Y'    → const { X } = require('Y')
serve(async (req) => { ... })            → router.post('/name', async (req,res)=>{...})
corsHeaders + OPTIONS check              → убрать (есть в middleware)
const supabase = createClient(...)       → оставить как есть (пока используем Supabase)
```

### 2.A.1 — api/package.json + api/server.js

```bash
cd /srv/claude-hub/projects/era-carwash

# api/package.json
cat > api/package.json << 'EOF'
{
  "name": "era-carwash-api",
  "version": "1.0.0",
  "type": "commonjs",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dotenv": "^16.0.3",
    "@supabase/supabase-js": "^2.38.0",
    "node-fetch": "^2.7.0",
    "node-cron": "^3.0.3",
    "multer": "^1.4.5-lts.1",
    "axios": "^1.6.0",
    "nodemailer": "^6.9.7",
    "form-data": "^4.0.0"
  }
}
EOF

# api/server.js — с закомментированными роутами групп B и C
cat > api/server.js << 'EOF'
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 5001;

// ── MIDDLEWARE ────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── HEALTH CHECK ─────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'era-carwash-api', version: '1.0.0', ts: new Date().toISOString() });
});

// ── ГРУППА A — Простые роуты ─────────────────────────────
app.use('/api', require('./routes/send-telegram'));
app.use('/api', require('./routes/send-telegram-notification'));
app.use('/api', require('./routes/send-whatsapp'));
app.use('/api', require('./routes/send-email'));
app.use('/api', require('./routes/check-password'));
app.use('/api', require('./routes/backup-movements'));
app.use('/api', require('./routes/restore-movements'));

// ── ГРУППА B — Средние роуты ──────────────────────────────
// Раскомментировать после создания файлов:
// app.use('/api', require('./routes/cleaning-auth'));
// app.use('/api', require('./routes/cleaning-bookings'));
// app.use('/api', require('./routes/cleaner-portal'));
// app.use('/api', require('./routes/emma-cash'));
// app.use('/api', require('./routes/main-cash'));
// app.use('/api', require('./routes/task-ai-chat'));
// app.use('/api', require('./routes/bot-movement'));
// app.use('/api', require('./routes/whatsapp-webhook'));
// app.use('/api', require('./routes/parse-bank-statement'));

// ── ГРУППА C — Сложные роуты ──────────────────────────────
// Раскомментировать после создания файлов:
// app.use('/api', require('./routes/ocr-receipt'));
// app.use('/api', require('./routes/scan-linen'));
// app.use('/api', require('./routes/transcribe-audio'));
// app.use('/api', require('./routes/smart-voice-input'));
// app.use('/api', require('./routes/sync-ical'));
// app.use('/api', require('./routes/bot-api'));
// app.use('/api', require('./routes/telegram-webhook'));

// ── CRON JOBS ─────────────────────────────────────────────
// Еженедельное напоминание (понедельник 9:00 Valencia time = UTC+2)
cron.schedule('0 7 * * 1', async () => {
  console.log('[CRON] weekly-payment-reminder');
  try {
    const h = require('./routes/weekly-payment-reminder');
    await h.runReminder();
  } catch (e) { console.error('[CRON] weekly-payment-reminder error:', e.message); }
});

// iCal каждые 6 часов (раскомментировать после создания sync-ical):
// cron.schedule('0 */6 * * *', async () => {
//   try {
//     const h = require('./routes/sync-ical');
//     await h.runSync();
//   } catch (e) { console.error('[CRON] sync-ical error:', e.message); }
// });

// ── ERROR HANDLER ─────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: err.message });
});

// ── START ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`ERA Carwash API running on port ${PORT}`);
});

module.exports = app;
EOF

echo "server.js создан"
```

### 2.A.2-2.A.9 — Конвертация простых роутов

Для каждого роута:
1. Прочитать `api/routes/original/[name]/index.ts`
2. Создать `api/routes/[name].js` по шаблону
3. `node --check api/routes/[name].js`

**Шаблон роута (Supabase остаётся):**
```javascript
require('dotenv').config();
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

router.post('/ROUTE_NAME', async (req, res) => {
  try {
    const body = req.body;
    // ← логика из index.ts ←
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[ROUTE_NAME] error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

**weekly-payment-reminder — экспортировать runReminder():**
```javascript
async function runReminder() {
  // логика из index.ts
}

router.post('/weekly-payment-reminder', async (req, res) => {
  try {
    const result = await runReminder();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
module.exports.runReminder = runReminder;
```

После создания всех 8 роутов группы A:
```bash
cd /srv/claude-hub/projects/era-carwash/api
npm install

cd ..
pm2 start ecosystem.config.js --only era-carwash-api
sleep 3
pm2 logs era-carwash-api --lines 10 --nostream
curl -s http://localhost:5001/api/health | head -2

# Коммит группы A
git add \
  api/server.js \
  api/package.json \
  api/routes/send-telegram.js \
  api/routes/send-telegram-notification.js \
  api/routes/send-whatsapp.js \
  api/routes/send-email.js \
  api/routes/check-password.js \
  api/routes/backup-movements.js \
  api/routes/restore-movements.js \
  api/routes/weekly-payment-reminder.js
git commit -m "feat(api): group-A simple routes + server.js"
git push
echo "✅ Группа A готова"
```

### 2.B — Средние роуты (аналогично, после группы A)

После создания всех 9 файлов группы B:
```bash
# Раскомментировать строки группы B в server.js
sed -i 's|// app.use.*cleaning-auth.*|app.use(\x27/api\x27, require(\x27./routes/cleaning-auth\x27));|' api/server.js
# ... и т.д. для каждого (или отредактировать вручную через sed/nano)

pm2 restart era-carwash-api
sleep 3
curl -s http://localhost:5001/api/health

git add api/routes/cleaning-auth.js api/routes/cleaning-bookings.js \
  api/routes/cleaner-portal.js api/routes/emma-cash.js api/routes/main-cash.js \
  api/routes/task-ai-chat.js api/routes/bot-movement.js api/routes/whatsapp-webhook.js \
  api/routes/parse-bank-statement.js api/server.js
git commit -m "feat(api): group-B medium routes"
git push
echo "✅ Группа B готова"
```

### 2.C — Сложные роуты с multer

**Шаблон для файловых роутов:**
```javascript
require('dotenv').config();
const express = require('express');
const router = express.Router();
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

router.post('/ROUTE_NAME', upload.single('file'), async (req, res) => {
  try {
    const fileBuffer = req.file?.buffer;
    const mimeType = req.file?.mimetype;
    const body = req.body;
    // ← логика ←
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[ROUTE_NAME] error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

**telegram-webhook — КРИТИЧНО — ответить 200 ДО обработки:**
```javascript
router.post('/telegram-webhook', async (req, res) => {
  // 1. НЕМЕДЛЕННО 200 — иначе Telegram шлёт повторы
  res.status(200).json({ ok: true });
  // 2. Обработка в фоне
  const update = req.body;
  setImmediate(async () => {
    try { await processUpdate(update); }
    catch (e) { console.error('[telegram-webhook]', e.message); }
  });
});

async function processUpdate(update) {
  // логика из handler.ts
}
```

**sync-ical — экспортировать runSync():**
```javascript
async function runSync() { /* логика */ }
router.post('/sync-ical', async (req, res) => {
  try { res.json(await runSync()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
module.exports = router;
module.exports.runSync = runSync;
```

После группы C:
```bash
# Раскомментировать группу C в server.js + cron sync-ical
pm2 restart era-carwash-api
sleep 3
curl -s http://localhost:5001/api/health

git add \
  api/routes/ocr-receipt.js api/routes/scan-linen.js \
  api/routes/transcribe-audio.js api/routes/smart-voice-input.js \
  api/routes/sync-ical.js api/routes/bot-api.js api/routes/telegram-webhook.js \
  api/server.js
git commit -m "feat(api): group-C complex routes with multer"
git push
echo "✅ Этап 2 — все 24 роута готовы"
```

---

## 📋 ЭТАП 3 — Фронтенд

```bash
# Посмотреть сколько вызовов функций нужно заменить
grep -rn "supabase.functions.invoke" web/src/ --include="*.tsx" --include="*.ts" | wc -l

# Создать web/.env
cat > web/.env << 'EOF'
VITE_API_URL=http://EXTERNAL_IP:8080
EOF
# ← ЗАМЕНИТЬ EXTERNAL_IP

# Замена паттерна — делать вручную по файлу
# БЫЛО:  supabase.functions.invoke('name', { body: {...} })
# СТАЛО: fetch('/api/name', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({...}) })

# Для файловых функций (ocr-receipt, scan-linen, transcribe-audio):
# БЫЛО:  supabase.functions.invoke('ocr-receipt', { body: formData })
# СТАЛО: fetch('/api/ocr-receipt', { method: 'POST', body: formData })
# (без Content-Type header — браузер сам выставит multipart boundary)

# Сборка
cd web
npm install
npm run build

# Деплой
cp -r dist/. /var/www/era-carwash/
echo "✅ Фронт задеплоен"

# Тест
curl -I http://localhost:8080

cd ..
git add web/src/ web/.env
git commit -m "feat(web): replace supabase.functions.invoke with fetch('/api/*')"
git push
echo "✅ Этап 3 завершён"
```

---

## 📋 ЭТАП 4 — Финал

```bash
# Проверить что всё живо
pm2 list
curl -s http://localhost:5001/api/health
curl -I http://localhost:8080

# Убедиться что старые проекты не упали
pm2 list | grep -v era-carwash

# Итоговый отчёт в PROGRESS.md
cat >> PROGRESS.md << 'EOF'

## Итог миграции

### Что сделано
- [x] Репо era-carwash-linux подключён
- [x] Проект в /srv/claude-hub/projects/era-carwash/
- [x] Nginx на порту 8080
- [x] Express API на порту 5001
- [x] 24 роута сконвертированы из Deno в Node.js
- [x] Фронт собран и задеплоен
- [x] PM2: era-carwash-api запущен

### Что нужно сделать Georgiy
1. Заполнить /srv/claude-hub/projects/era-carwash/api/.env (ключи из api/.env.template)
2. Скопировать bot/.env из старого бота (или заполнить вручную)
3. Запустить бота: pm2 start ecosystem.config.js --only era-carwash-bot
4. Открыть http://EXTERNAL_IP:8080 в браузере — проверить что загружается
5. Когда будет домен: настроить SSL через certbot

### Порты
- API:    localhost:5001
- Nginx:  :8080 (публичный)
- Другие проекты: не затронуты

EOF

git add PROGRESS.md
git commit -m "docs: migration complete, instructions for Georgiy"
git push

echo ""
echo "═══════════════════════════════════════"
echo "✅ МИГРАЦИЯ ЗАВЕРШЕНА"
echo "═══════════════════════════════════════"
echo ""
echo "Следующие шаги для Georgiy:"
echo "1. Заполнить api/.env на сервере"
echo "2. Открыть http://$(curl -s ifconfig.me):8080"
echo "3. pm2 start ecosystem.config.js --only era-carwash-bot"
echo ""
pm2 list
```

---

## ⚠️ Что делать если что-то не работает

### nginx -t завалился
```bash
# Посмотреть ошибку
nginx -t 2>&1
# Убрать наш конфиг, проверить что остальное работает
rm /etc/nginx/sites-enabled/era-carwash
nginx -t && echo "Остальные конфиги OK"
# Исправить /etc/nginx/sites-available/era-carwash и добавить заново
```

### pm2 era-carwash-api упал
```bash
pm2 logs era-carwash-api --lines 30 --nostream
# Исправить ошибку в роуте
# node --check api/routes/проблемный.js
pm2 restart era-carwash-api
```

### git push не работает
```bash
# Проверить remote
git remote -v
# Проверить SSH ключ
ssh -T git@github.com
# Если проблема с именем ветки
git branch -M main
git push -u origin main
```

### npm run build упал
```bash
cd web
cat .env  # проверить VITE_API_URL
npm run build 2>&1 | tail -30
# Найти файл с ошибкой TypeScript и исправить import
```

---

## 📝 Ведение PROGRESS.md

После каждого этапа обновлять таблицу в PROGRESS.md:
```bash
# Пример обновления
sed -i "s/| 0. Подготовка | ⏳ |/| 0. Подготовка | ✅ | $(date '+%H:%M') |/" PROGRESS.md
```

И добавлять запись в лог:
```bash
echo "### $(date '+%Y-%m-%d %H:%M') — Этап N завершён" >> PROGRESS.md
echo "- [описание что сделано]" >> PROGRESS.md
```

---

## 🚀 СТАРТ — первая команда

```bash
# Скопировать и выполнить для начала работы:
cd /srv/claude-hub/projects && pm2 list && nginx -t && echo "✅ СЕРВЕР ГОТОВ К РАБОТЕ"
```

Если обе проверки прошли — начинай с Этапа 0.1 и иди по порядку без остановок.
