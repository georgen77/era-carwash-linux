
CREATE TABLE public.daily_fixed_costs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wash_name TEXT NOT NULL,
  cost_date DATE NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 600,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(wash_name, cost_date)
);

ALTER TABLE public.daily_fixed_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to daily_fixed_costs"
ON public.daily_fixed_costs
FOR ALL
USING (true)
WITH CHECK (true);
