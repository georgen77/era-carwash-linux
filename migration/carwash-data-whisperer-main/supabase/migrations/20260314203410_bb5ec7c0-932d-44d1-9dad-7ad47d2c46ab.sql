
-- Enable pgcrypto in extensions schema (Supabase uses extensions schema)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.hash_password(p_password TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = extensions, public
AS $$
  SELECT extensions.crypt(p_password, extensions.gen_salt('bf'));
$$;

CREATE OR REPLACE FUNCTION public.verify_user_password(p_username TEXT, p_password TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = extensions, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users
    WHERE username = p_username
      AND is_active = true
      AND password_hash = extensions.crypt(p_password, password_hash)
  );
$$;
