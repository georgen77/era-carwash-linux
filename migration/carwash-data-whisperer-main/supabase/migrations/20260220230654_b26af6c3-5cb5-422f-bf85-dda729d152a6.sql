
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wash_name TEXT NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expense_type TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  comment TEXT DEFAULT '',
  contractor TEXT DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated access (we use custom auth, not supabase auth)
CREATE POLICY "Allow all access" ON public.expenses FOR ALL USING (true) WITH CHECK (true);
