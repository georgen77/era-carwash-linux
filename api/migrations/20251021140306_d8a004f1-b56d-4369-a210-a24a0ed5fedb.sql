-- Fix: Set proper search_path for the function
CREATE OR REPLACE FUNCTION refresh_inventory()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.current_inventory;
  RETURN NEW;
END;
$$;

-- Fix: Revoke API access to the materialized view
REVOKE SELECT ON public.current_inventory FROM anon, authenticated;