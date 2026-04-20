
## Plan: "Переписка" — Telegram Messages Log Page

### What needs to be done

**1. Database migration** — create `telegram_messages` table with RLS

**2. New page** — `src/pages/TelegramMessages.tsx` with:
- Search input (searches `message_text`)
- Filter by `user_name` (dropdown populated from distinct values via query)
- Date range filters (from/to date pickers using Shadcn Calendar/Popover)
- Table: дата | пользователь | сообщение | тип
- Sorted by `created_at` DESC
- Client-side pagination, 50 rows per page

**3. Route** — add `/telegram-messages` to `App.tsx` (protected with `ProtectedRoute`)

**4. Navigation link** — add "Переписка" button in the CleaningDashboard header nav (alongside Бельё, Задачи, Уборки)

---

### Technical Details

**Migration SQL:**
```sql
CREATE TABLE public.telegram_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text NOT NULL,
  user_name text,
  user_first_name text,
  message_text text,
  message_type text NOT NULL DEFAULT 'text', -- 'text', 'photo', 'document'
  photo_url text,
  direction text NOT NULL DEFAULT 'incoming', -- 'incoming', 'outgoing'
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view telegram_messages"
  ON public.telegram_messages FOR SELECT TO public USING (true);

CREATE POLICY "Anyone can insert telegram_messages"
  ON public.telegram_messages FOR INSERT TO public WITH CHECK (true);
```

**Page layout** (`src/pages/TelegramMessages.tsx`):
- Header with back button (→ `/`) matching app style
- Sticky filter bar: search input + username select + date-from + date-to
- `useEffect` fetches all matching rows from `telegram_messages` with filters applied as Supabase `.ilike()`, `.eq()`, `.gte()`, `.lte()` queries
- Pagination state: `page` (starts at 0), `PAGE_SIZE = 50`, prev/next buttons using the Shadcn Pagination component
- Table with columns: дата (formatted with `date-fns`), пользователь (`user_first_name ?? user_name`), сообщение (truncated), тип (badge: 📝 текст / 📷 фото / 📄 документ), направление badge (⬇ входящее / ⬆ исходящее)
- If `photo_url` present → show thumbnail in message cell
- Total count shown above the table

**Filtering approach:**
- Use Supabase query with `.range(offset, offset + PAGE_SIZE - 1)` for server-side pagination
- Distinct usernames fetched once on mount for the dropdown
- All filters trigger re-fetch via `useEffect` dependency array

**Route protection:** uses `ProtectedRoute` (same as `/`)

**Nav link:** added to CleaningDashboard header alongside existing Бельё / Задачи / Уборки buttons, using `MessageSquare` icon from lucide-react + label "Переписка"

---

### Files to change
1. **New migration** — `supabase/migrations/[timestamp]_telegram_messages.sql`
2. **New page** — `src/pages/TelegramMessages.tsx`
3. **`src/App.tsx`** — import + add route `/telegram-messages`
4. **`src/pages/CleaningDashboard.tsx`** — add nav button in header
