
-- Main cashbox tables (admin-only)

CREATE TABLE IF NOT EXISTS public.main_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_type text NOT NULL CHECK (transaction_type IN ('income', 'expense')),
  amount numeric NOT NULL,
  description text NOT NULL DEFAULT '',
  counterparty text,
  category text,
  location text,
  receipt_url text,
  receipt_text text,
  created_by uuid NOT NULL,
  transaction_date timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.main_transaction_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id uuid NOT NULL,
  action text NOT NULL,
  changed_by uuid NOT NULL,
  changed_at timestamp with time zone NOT NULL DEFAULT now(),
  old_data jsonb,
  new_data jsonb
);

CREATE TABLE IF NOT EXISTS public.main_counterparties (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS: admin only
ALTER TABLE public.main_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.main_transaction_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.main_counterparties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin only main_transactions"
  ON public.main_transactions FOR ALL
  USING (has_cleaning_role((current_setting('app.current_user_id', true))::uuid, 'admin'::user_role));

CREATE POLICY "Admin only main_transaction_log"
  ON public.main_transaction_log FOR ALL
  USING (has_cleaning_role((current_setting('app.current_user_id', true))::uuid, 'admin'::user_role));

CREATE POLICY "Admin only main_counterparties"
  ON public.main_counterparties FOR ALL
  USING (has_cleaning_role((current_setting('app.current_user_id', true))::uuid, 'admin'::user_role));
