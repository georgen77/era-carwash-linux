
-- Add counterparty column to emma_transactions
ALTER TABLE public.emma_transactions ADD COLUMN IF NOT EXISTS counterparty text;

-- Create counterparties table
CREATE TABLE IF NOT EXISTS public.counterparties (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.counterparties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and coordinators can manage counterparties"
ON public.counterparties FOR ALL
USING (is_admin_or_coordinator((current_setting('app.current_user_id'::text))::uuid));
