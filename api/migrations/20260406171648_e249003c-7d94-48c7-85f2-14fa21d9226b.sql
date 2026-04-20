
-- Add clean_stock to location_type enum
ALTER TYPE public.location_type ADD VALUE IF NOT EXISTS 'clean_stock';

-- Add new fields to cleaning_schedule
ALTER TABLE public.cleaning_schedule ADD COLUMN IF NOT EXISTS tasks_assigned boolean DEFAULT false;
ALTER TABLE public.cleaning_schedule ADD COLUMN IF NOT EXISTS gap_days integer;
ALTER TABLE public.cleaning_schedule ADD COLUMN IF NOT EXISTS notified boolean DEFAULT false;
ALTER TABLE public.cleaning_schedule ADD COLUMN IF NOT EXISTS special_instructions text;

-- Create laundry_prices table
CREATE TABLE IF NOT EXISTS public.laundry_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key text UNIQUE NOT NULL,
  name_ru text NOT NULL,
  price decimal NOT NULL,
  unit text NOT NULL DEFAULT 'шт',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.laundry_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view laundry_prices" ON public.laundry_prices FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert laundry_prices" ON public.laundry_prices FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update laundry_prices" ON public.laundry_prices FOR UPDATE TO public USING (true);
CREATE POLICY "Anyone can delete laundry_prices" ON public.laundry_prices FOR DELETE TO public USING (true);

-- Seed laundry_prices
INSERT INTO public.laundry_prices (item_key, name_ru, price, unit) VALUES
  ('sheet_set', 'Комплект постели (простынь + пододеяльник + 2 наволочки)', 6.60, 'комплект'),
  ('towel_set', 'Комплект полотенец (2 большие + 2 малые)', 2.00, 'комплект'),
  ('sheet', 'Простынь', 4.00, 'шт'),
  ('duvet_cover', 'Пододеяльник', 2.60, 'шт'),
  ('large_towel', 'Большое полотенце', 1.50, 'шт'),
  ('small_towel', 'Малое полотенце', 0.75, 'шт'),
  ('pillowcase', 'Наволочка', 0.75, 'шт'),
  ('kitchen_towel', 'Кухонное полотенце', 0.30, 'шт'),
  ('bath_mat', 'Коврик для ванной', 2.00, 'шт'),
  ('mattress_pad', 'Наматрасник', 5.00, 'шт'),
  ('stain_small', 'Выведение пятна (малое)', 0.30, 'шт'),
  ('stain_large', 'Выведение пятна (сложное)', 1.50, 'шт'),
  ('delivery', 'Доставка', 15.00, 'услуга')
ON CONFLICT (item_key) DO NOTHING;

-- Create laundry_invoices table
CREATE TABLE IF NOT EXISTS public.laundry_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text,
  period_from date,
  period_to date,
  invoice_amount decimal,
  calculated_amount decimal,
  difference decimal,
  items jsonb,
  paid boolean NOT NULL DEFAULT false,
  paid_at timestamptz,
  invoice_file_url text,
  payment_file_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.laundry_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view laundry_invoices" ON public.laundry_invoices FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert laundry_invoices" ON public.laundry_invoices FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update laundry_invoices" ON public.laundry_invoices FOR UPDATE TO public USING (true);
CREATE POLICY "Anyone can delete laundry_invoices" ON public.laundry_invoices FOR DELETE TO public USING (true);

-- Create laundry_pending_deliveries table
CREATE TABLE IF NOT EXISTS public.laundry_pending_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  type text NOT NULL,
  confirmed boolean NOT NULL DEFAULT false,
  items jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.laundry_pending_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view laundry_pending_deliveries" ON public.laundry_pending_deliveries FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert laundry_pending_deliveries" ON public.laundry_pending_deliveries FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update laundry_pending_deliveries" ON public.laundry_pending_deliveries FOR UPDATE TO public USING (true);
CREATE POLICY "Anyone can delete laundry_pending_deliveries" ON public.laundry_pending_deliveries FOR DELETE TO public USING (true);
