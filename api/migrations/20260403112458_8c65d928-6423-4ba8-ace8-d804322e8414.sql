ALTER TABLE public.cleaners
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS birthday date,
  ADD COLUMN IF NOT EXISTS access_code text,
  ADD COLUMN IF NOT EXISTS passport_url text,
  ADD COLUMN IF NOT EXISTS emergency_contact text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;