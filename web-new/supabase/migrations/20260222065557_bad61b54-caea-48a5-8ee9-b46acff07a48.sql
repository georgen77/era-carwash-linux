
-- Create monthly_expense_defaults table for recurring planned costs
CREATE TABLE public.monthly_expense_defaults (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wash_name TEXT NOT NULL,
  expense_type TEXT NOT NULL,
  default_amount NUMERIC NOT NULL DEFAULT 0,
  valid_from DATE NOT NULL DEFAULT '2024-01-01',
  valid_to DATE,
  active_months INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5,6,7,8,9,10,11,12}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(wash_name, expense_type, valid_from)
);

-- Enable RLS
ALTER TABLE public.monthly_expense_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to monthly_expense_defaults"
ON public.monthly_expense_defaults
FOR ALL
USING (true)
WITH CHECK (true);

-- Seed default values

-- Electricity (monthly)
INSERT INTO public.monthly_expense_defaults (wash_name, expense_type, default_amount, valid_from, active_months) VALUES
('Усатово', 'Електрика', 125000, '2024-01-01', '{1,2,3,4,5,6,7,8,9,10,11,12}'),
('Левитана', 'Електрика', 40000, '2024-01-01', '{1,2,3,4,5,6,7,8,9,10,11,12}'),
('Корсунцы', 'Електрика', 50000, '2024-01-01', '{1,2,3,4,5,6,7,8,9,10,11,12}'),

-- Chemistry (monthly)
('Усатово', 'Хімія', 70000, '2024-01-01', '{1,2,3,4,5,6,7,8,9,10,11,12}'),
('Левитана', 'Хімія', 35000, '2024-01-01', '{1,2,3,4,5,6,7,8,9,10,11,12}'),
('Корсунцы', 'Хімія', 35000, '2024-01-01', '{1,2,3,4,5,6,7,8,9,10,11,12}'),

-- Gas (only Левитана, Nov-Mar)
('Левитана', 'Газ', 15000, '2024-01-01', '{1,2,3,11,12}'),

-- Taxes: Усатово = 1 ЄП(1729.40) + 2 ЄСВ(1902.34) + 1 ВЗ(864.70) = 6398.78
-- Левитана = same
('Усатово', 'Податки та збори', 6398.78, '2024-01-01', '{1,2,3,4,5,6,7,8,9,10,11,12}'),
('Левитана', 'Податки та збори', 6398.78, '2024-01-01', '{1,2,3,4,5,6,7,8,9,10,11,12}');
