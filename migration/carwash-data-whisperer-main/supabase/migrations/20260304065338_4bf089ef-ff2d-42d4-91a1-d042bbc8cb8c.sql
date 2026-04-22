
-- Work journal entries (manual + from Telegram groups)
CREATE TABLE public.work_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'manual',
  wash_name text,
  author text,
  telegram_user text,
  message text NOT NULL,
  telegram_group text,
  telegram_message_id bigint,
  tags text[],
  converted_to text,
  converted_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.work_journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to work_journal_entries" ON public.work_journal_entries FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_work_journal_created ON public.work_journal_entries(created_at DESC);

-- Tasks
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  wash_name text NOT NULL DEFAULT 'Общее',
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'todo',
  priority text NOT NULL DEFAULT 'normal',
  assigned_to text,
  due_date date,
  notify_recipients text[],
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to tasks" ON public.tasks FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_wash ON public.tasks(wash_name);
CREATE INDEX idx_tasks_parent ON public.tasks(parent_id);

CREATE OR REPLACE FUNCTION public.update_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_tasks_updated_at();
