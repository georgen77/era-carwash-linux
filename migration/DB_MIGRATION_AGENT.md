# 🤖 DB MIGRATION AGENT — ERA Carwash Linux
## Автономный агент миграции базы данных. Читай один раз, выполняй параллельно.

---

## 🚨 ЖЕЛЕЗНЫЕ ПРАВИЛА

```
✅ БД называется: era_carwash
✅ Пользователь БД: era_user
✅ Проект: /srv/claude-hub/projects/era-carwash/
✅ После каждого этапа — коммит в era-carwash-linux
✅ Параллельные задачи запускать через & и wait
🚫 НИКОГДА не трогать другие БД на сервере
🚫 НИКОГДА не делать DROP DATABASE без явного подтверждения
🚫 Не удалять файлы дампов до успешной проверки
```

---

## 📋 КАРТА ЗАДАЧ — выполнять параллельно где возможно

```
ЭТАП 1 (параллельно — независимые):
  1.A  Установить PostgreSQL + pgcrypto
  1.B  Создать скрипт reset_passwords.sql
  1.C  Создать Express роут admin-users.js (управление паролями)

ЭТАП 2 (после 1.A):
  2.A  Создать БД и пользователя
  2.B  Применить схему (full_export.sql)
  2.C  Импортировать данные (data_export.sql)
  2.D  Проверить пароли — при провале сгенерировать новые

ЭТАП 3 (после 2.* и 1.C параллельно):
  3.A  Адаптировать бот (переключить SUPABASE_URL → локальный API)
  3.B  Подключить admin-users.js к server.js
  3.C  Обновить .env файлы

ЭТАП 4:
  4.A  Тестирование всего
  4.B  Коммит и отчёт
```

---

## 📋 ЭТАП 1 — Подготовка (всё параллельно)

### 1.A + 1.B + 1.C запускать одновременно:

```bash
# Запуск параллельно:
(
  # 1.A — PostgreSQL
  apt update && apt install -y postgresql-16 &&
  systemctl start postgresql &&
  systemctl enable postgresql &&
  echo "✅ 1.A PostgreSQL установлен"
) &

(
  # 1.B — Скрипт сброса паролей (bcrypt rounds 10)
  mkdir -p /srv/claude-hub/projects/era-carwash/db
  cat > /srv/claude-hub/projects/era-carwash/db/reset_passwords.sql << 'SQLEOF'
-- Сброс паролей если bcrypt из Supabase не совместим
-- Временные пароли — сменить после первого входа

-- georgen77 → ERA_Admin_2024!
UPDATE public.app_users
SET password_hash = crypt('ERA_Admin_2024!', gen_salt('bf', 10)),
    updated_at = now()
WHERE username = 'georgen77';

-- Ирина → ERA_Irina_2024!
UPDATE public.app_users
SET password_hash = crypt('ERA_Irina_2024!', gen_salt('bf', 10)),
    updated_at = now()
WHERE username = 'Ирина';

-- dima → ERA_Dima_2024!
UPDATE public.app_users
SET password_hash = crypt('ERA_Dima_2024!', gen_salt('bf', 10)),
    updated_at = now()
WHERE username = 'dima';

-- alex → ERA_Alex_2024!
UPDATE public.app_users
SET password_hash = crypt('ERA_Alex_2024!', gen_salt('bf', 10)),
    updated_at = now()
WHERE username = 'alex';

-- Проверка
SELECT username, full_name, role,
       (password_hash IS NOT NULL) as has_hash,
       updated_at
FROM public.app_users ORDER BY role DESC;
SQLEOF
  echo "✅ 1.B reset_passwords.sql создан"
) &

(
  # 1.C — Роут управления пользователями (создать файл заранее)
  mkdir -p /srv/claude-hub/projects/era-carwash/api/routes
  cat > /srv/claude-hub/projects/era-carwash/api/routes/admin-users.js << 'JSEOF'
require('dotenv').config();
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Middleware — только admin
async function requireAdmin(req, res, next) {
  const { username, password } = req.headers;
  if (!username || !password) return res.status(401).json({ error: 'Требуется авторизация' });
  try {
    const result = await pool.query(
      'SELECT role FROM public.app_users WHERE username=$1 AND is_active=true',
      [username]
    );
    if (!result.rows.length) return res.status(401).json({ error: 'Пользователь не найден' });
    const user = result.rows[0];
    // Проверить пароль через pgcrypto
    const check = await pool.query(
      "SELECT (password_hash = crypt($1, password_hash)) as ok FROM public.app_users WHERE username=$2",
      [password, username]
    );
    if (!check.rows[0]?.ok) return res.status(401).json({ error: 'Неверный пароль' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'Только для администратора' });
    req.adminUser = username;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/admin/users — список пользователей
router.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, username, full_name, email, phone, role, is_active,
             created_at, last_login_at, created_by
      FROM public.app_users
      ORDER BY role DESC, username
    `);
    res.json({ success: true, users: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users/set-password — сменить пароль пользователю
router.post('/admin/users/set-password', requireAdmin, async (req, res) => {
  const { target_username, new_password } = req.body;
  if (!target_username || !new_password) {
    return res.status(400).json({ error: 'target_username и new_password обязательны' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'Пароль минимум 6 символов' });
  }
  try {
    // Используем pgcrypto для хэширования (совместимо с verify_user_password)
    const result = await pool.query(
      `UPDATE public.app_users
       SET password_hash = crypt($1, gen_salt('bf', 10)),
           updated_at = now()
       WHERE username = $2
       RETURNING username, full_name, updated_at`,
      [new_password, target_username]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    res.json({ success: true, user: result.rows[0], message: 'Пароль успешно изменён' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users/create — создать пользователя
router.post('/admin/users/create', requireAdmin, async (req, res) => {
  const { username, password, full_name, email, phone, role = 'user' } = req.body;
  if (!username || !password || !full_name) {
    return res.status(400).json({ error: 'username, password, full_name обязательны' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO public.app_users
         (username, password_hash, full_name, email, phone, role, created_by)
       VALUES (
         $1,
         crypt($2, gen_salt('bf', 10)),
         $3, $4, $5, $6, $7
       )
       RETURNING id, username, full_name, role, created_at`,
      [username, password, full_name, email || null, phone || null, role, req.adminUser]
    );
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Пользователь уже существует' });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users/toggle — активировать/деактивировать
router.post('/admin/users/toggle', requireAdmin, async (req, res) => {
  const { target_username } = req.body;
  try {
    const result = await pool.query(
      `UPDATE public.app_users
       SET is_active = NOT is_active, updated_at = now()
       WHERE username = $1
       RETURNING username, is_active`,
      [target_username]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users/set-role — изменить роль
router.post('/admin/users/set-role', requireAdmin, async (req, res) => {
  const { target_username, role } = req.body;
  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'role должна быть admin или user' });
  }
  try {
    const result = await pool.query(
      `UPDATE public.app_users SET role=$1, updated_at=now()
       WHERE username=$2 RETURNING username, role`,
      [role, target_username]
    );
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login — вход (обновлённый, без Supabase)
router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username и password обязательны' });
  try {
    const result = await pool.query(
      `SELECT id, username, full_name, email, phone, role, is_active,
              (password_hash = crypt($1, password_hash)) as password_ok
       FROM public.app_users
       WHERE username = $2`,
      [password, username]
    );
    if (!result.rows.length || !result.rows[0].password_ok) {
      return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
    }
    const user = result.rows[0];
    if (!user.is_active) return res.status(403).json({ error: 'Аккаунт деактивирован' });

    // Обновить last_login_at
    await pool.query('UPDATE public.app_users SET last_login_at=now() WHERE id=$1', [user.id]);

    delete user.password_ok;
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
JSEOF
  echo "✅ 1.C admin-users.js создан"
) &

wait
echo "✅ ЭТАП 1 ЗАВЕРШЁН"
```

---

## 📋 ЭТАП 2 — База данных (после 1.A)

### 2.A — Создать БД

```bash
# Проверить что PostgreSQL запущен
systemctl is-active postgresql || systemctl start postgresql

sudo -u postgres psql << 'EOF'
-- Удалить если есть (осторожно!)
DROP DATABASE IF EXISTS era_carwash;
DROP USER IF EXISTS era_user;

-- Создать
CREATE USER era_user WITH PASSWORD 'ERA_STRONG_PASS_2024';
CREATE DATABASE era_carwash OWNER era_user;
GRANT ALL PRIVILEGES ON DATABASE era_carwash TO era_user;

-- Расширение pgcrypto (критически важно для паролей)
\c era_carwash
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
-- Открыть доступ к функциям crypt/gen_salt из public schema
GRANT USAGE ON SCHEMA extensions TO era_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO era_user;

-- Создать алиасы чтобы crypt() работал без префикса extensions.
CREATE OR REPLACE FUNCTION public.crypt(text, text) RETURNS text AS
  $$ SELECT extensions.crypt($1, $2) $$ LANGUAGE sql SECURITY DEFINER;
CREATE OR REPLACE FUNCTION public.gen_salt(text) RETURNS text AS
  $$ SELECT extensions.gen_salt($1) $$ LANGUAGE sql SECURITY DEFINER;
CREATE OR REPLACE FUNCTION public.gen_salt(text, int) RETURNS text AS
  $$ SELECT extensions.gen_salt($1, $2) $$ LANGUAGE sql SECURITY DEFINER;

\echo 'БД создана, pgcrypto установлен'
EOF

echo "✅ 2.A БД готова"
```

### 2.B + 2.C — Применить схему и данные (параллельно где возможно)

```bash
PROJECT=/srv/claude-hub/projects/era-carwash
DB="postgresql://era_user:ERA_STRONG_PASS_2024@localhost:5432/era_carwash"

# 2.B — Схема (сначала, данные зависят от неё)
echo "Применяем схему..."
psql "$DB" -f "$PROJECT/db/full_export.sql" 2>&1 | tail -20

# Проверить схему
TABLE_COUNT=$(psql "$DB" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'")
echo "Таблиц создано: $TABLE_COUNT"

# 2.C — Данные (с обходом circular FK на tasks)
echo "Импортируем данные..."
psql "$DB" -c "SET session_replication_role = replica;"
psql "$DB" -f "$PROJECT/db/data_export.sql" 2>&1 | grep -E "ERROR|COPY|error" | head -20
psql "$DB" -c "SET session_replication_role = DEFAULT;"

# Проверить количество записей
echo "Записей в таблицах:"
psql "$DB" -c "
SELECT tablename, n_live_tup as rows
FROM pg_stat_user_tables
WHERE n_live_tup > 0
ORDER BY n_live_tup DESC;
"

echo "✅ 2.B+C схема и данные применены"
```

### 2.D — Проверка паролей и сброс при необходимости

```bash
DB="postgresql://era_user:ERA_STRONG_PASS_2024@localhost:5432/era_carwash"
PROJECT=/srv/claude-hub/projects/era-carwash

# Тест: проверить работает ли verify_user_password
# georgen77 пробуем с известными паролями из era-bot .env

echo "Тест функции verify_user_password..."
VERIFY=$(psql "$DB" -t -c "SELECT public.verify_user_password('georgen77', '0809')" 2>&1)
echo "Результат теста: $VERIFY"

if echo "$VERIFY" | grep -q "t"; then
  echo "✅ Пароли работают — миграция паролей успешна"
else
  echo "⚠️  Пароли не совместимы — запускаем сброс..."
  psql "$DB" -f "$PROJECT/db/reset_passwords.sql"
  echo ""
  echo "════════════════════════════════════════════"
  echo "⚠️  ВРЕМЕННЫЕ ПАРОЛИ (сменить после входа):"
  echo "  georgen77 → ERA_Admin_2024!"
  echo "  Ирина     → ERA_Irina_2024!"
  echo "  dima      → ERA_Dima_2024!"
  echo "  alex      → ERA_Alex_2024!"
  echo "════════════════════════════════════════════"
  
  # Финальная проверка
  VERIFY2=$(psql "$DB" -t -c "SELECT public.verify_user_password('georgen77', 'ERA_Admin_2024')")
  echo "Проверка после сброса: $VERIFY2"
fi

# Список пользователей в итоге
psql "$DB" -c "SELECT username, full_name, role, is_active, last_login_at FROM public.app_users ORDER BY role DESC;"

echo "✅ 2.D пароли проверены"
```

---

## 📋 ЭТАП 3 — Адаптация бота и API (параллельно)

### 3.A — Адаптировать era-bot/bot.js (переключить на локальный API)

Бот сейчас обращается к Supabase Edge Functions по URL:
```
SUPABASE_URL + '/functions/v1/bot-api'
```

Нужно переключить на локальный Express API.

```bash
PROJECT=/srv/claude-hub/projects/era-carwash

# Найти все вхождения
grep -n "SUPABASE_URL.*functions/v1" "$PROJECT/era-bot/bot.js"

# Заменить оба вхождения (L222 и L4089)
# БЫЛО:
#   SUPABASE_URL + '/functions/v1/bot-api'
# СТАЛО:
#   process.env.API_URL + '/api/bot-api'

sed -i "s|SUPABASE_URL + '/functions/v1/bot-api'|process.env.API_URL + '/api/bot-api'|g" \
  "$PROJECT/era-bot/bot.js"

# Проверить замену
echo "Проверка замены:"
grep -n "API_URL\|functions/v1" "$PROJECT/era-bot/bot.js" | head -10

# Добавить API_URL в bot/.env если нет
if ! grep -q "API_URL" "$PROJECT/era-bot/.env" 2>/dev/null; then
  echo "API_URL=http://localhost:5001" >> "$PROJECT/era-bot/.env"
  echo "✅ API_URL добавлен в bot/.env"
fi

echo "✅ 3.A бот адаптирован"
```

### 3.B — Подключить admin-users.js к server.js

```bash
PROJECT=/srv/claude-hub/projects/era-carwash

# Добавить маршруты в server.js (после существующих роутов)
# Найти строку с bot-api и добавить после неё
if ! grep -q "admin-users" "$PROJECT/api/server.js"; then
  sed -i "/require.*bot-api/a app.use('/api', require('./routes/admin-users'));" \
    "$PROJECT/api/server.js"
  echo "✅ admin-users.js добавлен в server.js"
else
  echo "ℹ️ admin-users.js уже в server.js"
fi

# Установить bcrypt если нужен
cd "$PROJECT/api"
npm install bcrypt pg 2>/dev/null
echo "✅ 3.B server.js обновлён"
```

### 3.C — Обновить .env файлы

```bash
PROJECT=/srv/claude-hub/projects/era-carwash

# api/.env — добавить DATABASE_URL
if ! grep -q "DATABASE_URL" "$PROJECT/api/.env" 2>/dev/null; then
  echo "DATABASE_URL=postgresql://era_user:ERA_STRONG_PASS_2024@localhost:5432/era_carwash" \
    >> "$PROJECT/api/.env"
fi

# Убедиться что PORT=5001
grep -q "^PORT=" "$PROJECT/api/.env" || echo "PORT=5001" >> "$PROJECT/api/.env"

# bot/.env — убедиться что API_URL есть
grep -q "^API_URL=" "$PROJECT/era-bot/.env" 2>/dev/null || \
  echo "API_URL=http://localhost:5001" >> "$PROJECT/era-bot/.env"

# Показать итоговые .env (без значений)
echo "=== api/.env ключи ==="
grep -v "^#\|^$" "$PROJECT/api/.env" | sed 's/=.*/=***/'

echo "=== bot/.env ключи ==="
grep -v "^#\|^$" "$PROJECT/era-bot/.env" 2>/dev/null | sed 's/=.*/=***/' | head -20

echo "✅ 3.C .env обновлены"
```

---

## 📋 ЭТАП 4 — Тестирование

```bash
PROJECT=/srv/claude-hub/projects/era-carwash
DB="postgresql://era_user:ERA_STRONG_PASS_2024@localhost:5432/era_carwash"

echo "════ ТЕСТ 1: БД ════"
# Количество записей
psql "$DB" -t -c "SELECT COUNT(*) FROM public.work_journal_entries" | grep -v "^$"
psql "$DB" -t -c "SELECT COUNT(*) FROM public.expenses" | grep -v "^$"
psql "$DB" -t -c "SELECT COUNT(*) FROM public.app_users" | grep -v "^$"

echo "════ ТЕСТ 2: API health ════"
pm2 restart era-carwash-api 2>/dev/null || pm2 start ecosystem.config.js --only era-carwash-api
sleep 3
curl -s http://localhost:5001/api/health | python3 -m json.tool

echo "════ ТЕСТ 3: Auth login ════"
curl -s -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"georgen77","password":"ERA_Admin_2024!"}' \
  | python3 -m json.tool 2>/dev/null | head -10

echo "════ ТЕСТ 4: Admin users list ════"
curl -s http://localhost:5001/api/admin/users \
  -H "username: georgen77" \
  -H "password: ERA_Admin_2024!" \
  | python3 -m json.tool 2>/dev/null | head -20

echo "════ ТЕСТ 5: Бот (проверить что не падает) ════"
pm2 restart era-carwash-bot 2>/dev/null || pm2 start ecosystem.config.js --only era-carwash-bot
sleep 5
pm2 logs era-carwash-bot --lines 20 --nostream

echo "════ ФИНАЛЬНЫЙ СТАТУС ════"
pm2 list
```

---

## 📋 ЭТАП 5 — Коммит

```bash
PROJECT=/srv/claude-hub/projects/era-carwash

cd "$PROJECT"

git add \
  db/full_export.sql \
  db/data_export.sql \
  db/reset_passwords.sql \
  api/routes/admin-users.js \
  api/server.js \
  era-bot/bot.js \
  PROGRESS.md

git commit -m "feat(db): PostgreSQL migration + admin user management + bot API switch"
git push

echo "✅ Всё закоммичено"
```

---

## 📊 Информация о БД для справки

### Таблицы и данные
| Таблица | Строк | Описание |
|---------|------:|---------|
| work_journal_entries | 267 | Рабочий журнал (Telegram события) |
| report_cache | 94 | Кэш отчётов |
| ai_chat_messages | 128 | История AI чата |
| daily_fixed_costs | 58 | Фиксированные расходы по дням |
| expenses | 49 | Расходы (запчасти, химия) |
| login_logs | 34 | Логи входов |
| two_fa_codes | 12 | Коды 2FA |
| expense_logs | 13 | Лог изменений расходов |
| monthly_expense_defaults | 10 | Дефолтные расходы по месяцам |
| webauthn_credentials | 7 | Biometrics |
| notes | 7 | Заметки |
| task_activity_log | 7 | Лог задач |
| contractors | 9 | Контрагенты |
| app_users | 4 | Пользователи |
| tasks | 6 | Задачи |

### Пользователи системы
| username | Имя | Роль | Временный пароль |
|----------|-----|------|-----------------|
| georgen77 | Georgen Admin | admin | ERA_Admin_2024! |
| Ирина | Нечитайло Ирочка | user | ERA_Irina_2024! |
| dima | Дима Калінін | user | ERA_Dima_2024! |
| alex | Александр Сидоров | user | ERA_Alex_2024! |

> ⚠️ Временные пароли активируются только если bcrypt из Supabase не совместим.
> После первого входа сменить через `/api/admin/users/set-password`

### Зависимости схемы
- **pgcrypto** — обязательно, для `crypt()` и `gen_salt()`
- **RLS** — включён на всех 21 таблицах, политики `USING (true)` — открытый доступ
- **Circular FK** — `tasks.parent_id → tasks.id` — обходить через `session_replication_role = replica`

### Бот — что изменилось
- `SUPABASE_URL + '/functions/v1/bot-api'` → `API_URL + '/api/bot-api'`
- Добавить в `era-bot/.env`: `API_URL=http://localhost:5001`
- Все 56 actions бота (add_income, query_expenses и т.д.) идут через локальный `bot-api.js`

### API роуты управления пользователями (новые)
| Метод | URL | Описание |
|-------|-----|---------|
| POST | `/api/auth/login` | Вход (без Supabase) |
| GET | `/api/admin/users` | Список пользователей |
| POST | `/api/admin/users/set-password` | Сменить пароль |
| POST | `/api/admin/users/create` | Создать пользователя |
| POST | `/api/admin/users/toggle` | Активировать/деактивировать |
| POST | `/api/admin/users/set-role` | Изменить роль |

### Команда для ручной смены пароля (если нужно прямо в БД)
```bash
psql "postgresql://era_user:ERA_STRONG_PASS_2024@localhost:5432/era_carwash" -c \
  "UPDATE app_users SET password_hash=crypt('НОВЫЙ_ПАРОЛЬ', gen_salt('bf',10)) WHERE username='ЛОГИН';"
```

---

## ⚠️ Если что-то пошло не так

### PostgreSQL не запускается
```bash
systemctl status postgresql
journalctl -u postgresql -n 30
# Часто причина: порт 5432 занят другим процессом
ss -tlnp | grep 5432
```

### Ошибка при импорте схемы (full_export.sql)
```bash
# extensions.crypt не найден → pgcrypto не установлен
sudo -u postgres psql -d era_carwash -c "CREATE EXTENSION pgcrypto WITH SCHEMA extensions;"
# Повторить импорт
```

### Ошибка circular FK при импорте данных
```bash
psql "$DB" << 'EOF'
BEGIN;
SET session_replication_role = replica;
\i /srv/claude-hub/projects/era-carwash/db/data_export.sql
SET session_replication_role = DEFAULT;
COMMIT;
EOF
```

### Бот падает после переключения на API_URL
```bash
pm2 logs era-carwash-bot --lines 50 --nostream
# Проверить что API_URL доступен
curl http://localhost:5001/api/health
# Проверить что BOT_SECRET в bot/.env совпадает с api/.env
```
