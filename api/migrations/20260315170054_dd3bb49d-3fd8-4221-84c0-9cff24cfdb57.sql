
CREATE TABLE public.telegram_notification_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient TEXT NOT NULL,
  custom_prefix TEXT,
  trigger_page TEXT NOT NULL CHECK (trigger_page IN ('кассы', 'бельё', 'задачи', 'любая')),
  events JSONB NOT NULL DEFAULT '[]',
  auto_send BOOLEAN NOT NULL DEFAULT false,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_notification_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can manage notification rules"
  ON public.telegram_notification_rules
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_telegram_notification_rules_updated_at
  BEFORE UPDATE ON public.telegram_notification_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
