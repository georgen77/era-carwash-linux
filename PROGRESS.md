# ERA Carwash Migration Progress

## ЗАВЕРШЕНО

### Backend API (порт 5002)
- PostgreSQL база era_carwash с данными
- Express routes: scrape-carwash, manage-users, ai-assistant, admin-users
- cw-send-telegram, telegram-bot-webhook, whatsapp-daily-report
- Gemini 2.5 Flash AI ассистент
- pgcrypto авторизация (bcrypt)
- PM2 ecosystem.config.js (era-carwash-api)

### Frontend (порт 8080)
- Правильный фронт ERA Автомойки (не апартаменты)
- Собран и задеплоен в /var/www/era-carwash/
- Nginx проксирует /api/ -> localhost:5002

## Адрес
http://95.217.46.40:8080
