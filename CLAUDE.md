# ERA Carwash

Система управления автомойкой. Telegram бот + веб-интерфейс + API.

## Стек
- Backend: Node.js + Express (api/)
- Frontend: React + Vite (web-new/)
- Database: PostgreSQL (era_carwash)
- Bot: Telegram (bot/)
- PM2: `era-carwash-api`

## Порты и процессы

- **API port: 5002** — PM2 process `era-carwash-api`
- **Nginx:** `/etc/nginx/sites-available/era-carwash` (port 8080)

## Database

- **PostgreSQL user:** `era_carwash_user` (база `era_carwash`)
- Connection: `CW_DATABASE_URL` в `api/.env`
- **Не менять** пароль `era_carwash_user` без необходимости

## Команды

```bash
pm2 restart era-carwash-api --update-env
pm2 logs era-carwash-api --lines 30
pm2 status
```

## Структура

```
era-carwash/
├── api/          — Express API (порт 5002)
│   ├── routes/   — API роуты
│   └── .env      — конфиг (CW_DATABASE_URL, TELEGRAM_TOKEN и др.)
├── bot/          — Telegram бот
├── web-new/      — React фронтенд (новая версия)
└── web/          — старая версия фронта
```

## Project Isolation

Этот проект на общем сервере. Другие проекты: era-api (5000), snapmind (3500), knowhub (8082), lumino (8081).

Реестр всех проектов: `/srv/claude-hub/projects/CLAUDE.md`
