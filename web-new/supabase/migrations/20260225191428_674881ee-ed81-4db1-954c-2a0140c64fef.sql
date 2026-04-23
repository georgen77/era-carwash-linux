
CREATE TABLE public.expense_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id UUID NOT NULL,
  action TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  old_data JSONB NOT NULL,
  new_data JSONB
);

ALTER TABLE public.expense_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to expense_logs"
  ON public.expense_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);
