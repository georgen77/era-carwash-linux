CREATE TABLE IF NOT EXISTS public.login_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  logged_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  device_name text,
  status text NOT NULL DEFAULT 'success',
  error_message text
);

ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "login_logs_insert_anon" ON public.login_logs
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "login_logs_select_anon" ON public.login_logs
  FOR SELECT TO anon USING (true);