CREATE TABLE IF NOT EXISTS public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  author text,
  wash_name text,
  image text,
  ocr_text text,
  tags text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notes' AND policyname='Allow all access to notes') THEN
    CREATE POLICY "Allow all access to notes" ON public.notes FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.task_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  telegram_chat_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='task_assignees' AND policyname='Allow all access to task_assignees') THEN
    CREATE POLICY "Allow all access to task_assignees" ON public.task_assignees FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

INSERT INTO public.task_assignees (name, telegram_chat_id) VALUES
  ('Georgiy', '6270826055'),
  ('Kalinin', '1190893632')
ON CONFLICT (name) DO NOTHING;