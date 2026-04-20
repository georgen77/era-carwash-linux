# ERA Carwash Linux Migration — Progress Log
_Last updated: 2026-04-21_

## ✅ COMPLETED

### Phase 0 — Server prep
- Folder `/srv/claude-hub/projects/era-carwash/` created
- `MASTER_AGENT_CARWASH.md` copied to server
- Git repo connected to `git@github.com:georgen77/era-carwash-linux.git`
- `package.json` created with all dependencies
- `ecosystem.config.js` created for PM2
- `npm install` done, dependencies installed

### Phase 1 — Nginx
- `/etc/nginx/sites-available/era-carwash` created
- Port 8080, serves `/var/www/era-carwash`, proxies `/api/` → localhost:5001
- `nginx -t` passes (pre-existing SSL warning is unrelated)

### Phase 2 — API Routes (ALL 24 routes converted)

**Group A (8 routes)** — committed & running:
- `send-telegram.js`
- `send-telegram-notification.js`
- `send-whatsapp.js`
- `send-email.js`
- `check-password.js`
- `backup-movements.js`
- `restore-movements.js`
- `weekly-payment-reminder.js`

**Group B (9 routes)** — committed & running:
- `cleaning-auth.js`
- `cleaning-bookings.js`
- `cleaner-portal.js` (GET endpoint via router)
- `emma-cash.js`
- `main-cash.js`
- `task-ai-chat.js` (SSE streaming)
- `bot-movement.js`
- `whatsapp-webhook.js`
- `parse-bank-statement.js`

**Group C (8 routes)** — committed & running:
- `ocr-receipt.js` (multimodal receipt OCR + structured extraction)
- `scan-linen.js` (photo scan of cleaner notes → movement or expense)
- `transcribe-audio.js` (audio → text via Gemini)
- `smart-voice-input.js` (voice → structured form data, contexts: movement/emma_cash/task)
- `sync-ical.js` (iCal sync + cron every 6h)
- `bot-api.js` (2383 lines, ~60 bot actions)
- `handler.js` (1170 lines, Telegram update processor)
- `telegram-webhook.js` (immediate 200, processes in background)

**Last commit**: `feat(api): group-C complex routes with multer` → pushed to `main`

**PM2 status**: `era-carwash-api` running on port 5001 ✅
**Health check**: `curl http://localhost:5001/api/health` → `{"ok":true,...}` ✅

### Phase 3 — Frontend (IN PROGRESS)

**Done:**
- Created `/srv/claude-hub/projects/era-carwash/web/src/lib/invoke.ts`
  - Drop-in replacement for `supabase.functions.invoke()` that calls `/api/<name>`
  - Same `{ data, error }` return interface
- Ran `node /tmp/patch_frontend.js` → replaced **57 invocations** in 23 files
  - Every `supabase.functions.invoke("X", {...})` → `invoke("X", {...})` 
  - Added `import { invoke } from "@/lib/invoke";` to each affected file
- Created `/srv/claude-hub/projects/era-carwash/web/src/integrations/supabase/client.ts`
  - Uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars
- Created `/srv/claude-hub/projects/era-carwash/web/.env` (placeholder values)

**MISSING / NEEDED:**
1. **Fill in Supabase credentials** in `/srv/claude-hub/projects/era-carwash/web/.env`:
   ```
   VITE_SUPABASE_URL=https://REPLACE_WITH_SUPABASE_URL.supabase.co
   VITE_SUPABASE_ANON_KEY=REPLACE_WITH_ANON_KEY
   ```
   → Ask Georgiy for the era-carwash Supabase project URL and anon key

2. **Build frontend** (was running when paused):
   ```bash
   ssh prod
   cd /srv/claude-hub/projects/era-carwash/web
   npm run build
   ```

3. **Deploy built files** to nginx docroot:
   ```bash
   sudo cp -r dist/* /var/www/era-carwash/
   ```

4. **Vite proxy** (for local dev, not production):
   If dev mode is needed, add to `vite.config.ts` server section:
   ```js
   proxy: { '/api': 'http://localhost:5001' }
   ```

5. **Commit & push** frontend changes

## 🔜 REMAINING TASKS

### Phase 3 (continued)
- [ ] Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in `web/.env`
- [ ] `npm run build` in `web/`
- [ ] `sudo cp -r dist/* /var/www/era-carwash/`
- [ ] Git commit: `feat(frontend): migrate functions.invoke to local API`
- [ ] Push to GitHub

### Phase 4 — Final
- [ ] Fill in `api/.env` with real credentials (SUPABASE_URL, TELEGRAM_BOT_TOKEN, etc.)
- [ ] Test end-to-end: open `http://10.10.10.30:8080`, check main flows
- [ ] Update `PROGRESS.md` on server
- [ ] Write instructions for Georgiy (what to configure, how to run)

## Server Info
- **SSH**: `ssh prod` (key: `~/.ssh/id_ed25519_prod`, user: `claude@10.10.10.30`)
- **Project**: `/srv/claude-hub/projects/era-carwash/`
- **API port**: 5001 (PM2 `era-carwash-api`)
- **Nginx**: port 8080 → `/var/www/era-carwash` + proxies `/api/` → 5001
- **GitHub**: `git@github.com:georgen77/era-carwash-linux.git`
- **PM2 restart**: `pm2 restart era-carwash-api`

## Key Files
| File | Purpose |
|------|---------|
| `api/server.js` | Express entry point, all routes registered |
| `api/routes/` | 24 converted route handlers |
| `api/.env` | Backend env vars (needs Supabase URL etc.) |
| `web/src/lib/invoke.ts` | Drop-in shim replacing supabase.functions.invoke |
| `web/src/integrations/supabase/client.ts` | Supabase JS client for direct DB queries |
| `web/.env` | Frontend env vars (needs VITE_SUPABASE_* keys) |

## Notes
- `supabase.from()` calls in frontend are **untouched** — still go to Supabase Cloud directly
- Only `supabase.functions.invoke()` was replaced → now calls local `/api/...` Express routes
- `task-ai-chat` uses SSE; if frontend connects via EventSource, check `Cleanings.tsx` for the connection setup
- SSH timeouts are normal — just wait 15s and retry
