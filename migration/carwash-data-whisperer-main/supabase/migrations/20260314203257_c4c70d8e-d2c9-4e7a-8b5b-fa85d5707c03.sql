
-- Table: app_users — custom auth users managed by admin
CREATE TABLE IF NOT EXISTS public.app_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  is_active BOOLEAN NOT NULL DEFAULT true,
  two_fa_enabled BOOLEAN NOT NULL DEFAULT false,
  two_fa_method TEXT DEFAULT 'email',
  two_fa_required_each_login BOOLEAN NOT NULL DEFAULT false,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  phone_verified BOOLEAN NOT NULL DEFAULT false,
  email_verify_required BOOLEAN NOT NULL DEFAULT false,
  phone_verify_required BOOLEAN NOT NULL DEFAULT false,
  biometrics_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_login_at TIMESTAMP WITH TIME ZONE,
  created_by TEXT
);

-- Table: webauthn_credentials — biometric credentials per user
CREATE TABLE IF NOT EXISTS public.webauthn_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  sign_count BIGINT NOT NULL DEFAULT 0,
  device_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE
);

-- Table: two_fa_codes — OTP codes for 2FA
CREATE TABLE IF NOT EXISTS public.two_fa_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'login',
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_users_username ON public.app_users(username);
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user_id ON public.webauthn_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_two_fa_codes_user_id ON public.two_fa_codes(user_id);

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.two_fa_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all to app_users" ON public.app_users FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow all to webauthn_credentials" ON public.webauthn_credentials FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow all to two_fa_codes" ON public.two_fa_codes FOR ALL TO public USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_app_users_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER app_users_updated_at
BEFORE UPDATE ON public.app_users
FOR EACH ROW EXECUTE FUNCTION public.update_app_users_updated_at();

INSERT INTO public.app_users (username, password_hash, full_name, role, email_verified, two_fa_enabled, created_by)
VALUES 
  ('georgen77', crypt('@77negroeG', gen_salt('bf')), 'Georgen Admin', 'admin', true, false, 'system'),
  ('dima', crypt('kalinin', gen_salt('bf')), 'Дима Калинін', 'user', false, false, 'system')
ON CONFLICT (username) DO NOTHING;
