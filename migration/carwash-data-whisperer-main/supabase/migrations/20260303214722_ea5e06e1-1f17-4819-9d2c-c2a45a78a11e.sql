CREATE TABLE public.notification_recipients (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  telegram_chat_id text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to notification_recipients" ON public.notification_recipients FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.notification_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  content text NOT NULL,
  is_ai_preset boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to notification_templates" ON public.notification_templates FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.notification_templates (name, content, is_ai_preset) VALUES
  ('Ежедневный отчёт по выручке', 'daily_revenue_report', true),
  ('Краткая сводка за день', 'daily_summary', true),
  ('Прогноз на конец месяца', 'monthly_forecast', true);

CREATE TABLE public.notification_schedules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_id uuid NOT NULL REFERENCES public.notification_recipients(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.notification_templates(id) ON DELETE SET NULL,
  custom_message text,
  send_time time NOT NULL DEFAULT '22:00:00',
  days_of_week integer[] NOT NULL DEFAULT '{1,2,3,4,5,6,7}',
  is_recurring boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to notification_schedules" ON public.notification_schedules FOR ALL USING (true) WITH CHECK (true);