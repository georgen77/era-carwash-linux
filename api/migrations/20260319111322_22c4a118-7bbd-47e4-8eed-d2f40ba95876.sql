
ALTER TABLE cleaning_schedule 
  ADD COLUMN IF NOT EXISTS next_guests integer DEFAULT 4,
  ADD COLUMN IF NOT EXISTS cleaning_date date;

ALTER TABLE cleaning_assignments
  ADD COLUMN IF NOT EXISTS receipt_url text,
  ADD COLUMN IF NOT EXISTS receipt_amount numeric,
  ADD COLUMN IF NOT EXISTS receipt_store text,
  ADD COLUMN IF NOT EXISTS next_guests integer;
