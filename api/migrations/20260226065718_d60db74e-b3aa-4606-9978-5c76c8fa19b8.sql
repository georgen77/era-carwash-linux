
-- Create audit log table for emma_transactions changes
CREATE TABLE IF NOT EXISTS public.emma_transaction_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id uuid NOT NULL,
  action text NOT NULL, -- 'create', 'update', 'delete'
  changed_by uuid NOT NULL,
  changed_at timestamp with time zone NOT NULL DEFAULT now(),
  old_data jsonb,
  new_data jsonb
);

ALTER TABLE public.emma_transaction_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and coordinators can view logs"
ON public.emma_transaction_log FOR SELECT
USING (is_admin_or_coordinator((current_setting('app.current_user_id'::text))::uuid));

CREATE POLICY "Admins and coordinators can insert logs"
ON public.emma_transaction_log FOR INSERT
WITH CHECK (is_admin_or_coordinator((current_setting('app.current_user_id'::text))::uuid));
