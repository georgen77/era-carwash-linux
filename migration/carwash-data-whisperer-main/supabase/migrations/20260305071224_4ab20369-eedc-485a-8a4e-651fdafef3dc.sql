
CREATE TABLE IF NOT EXISTS public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type text NOT NULL,
  item_id uuid NOT NULL,
  item_title text NOT NULL,
  remind_at timestamp with time zone NOT NULL,
  message text,
  username text NOT NULL,
  push_subscription jsonb,
  sent boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to reminders"
ON public.reminders FOR ALL
USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON public.reminders (remind_at) WHERE sent = false;
CREATE INDEX IF NOT EXISTS idx_reminders_username ON public.reminders (username);
