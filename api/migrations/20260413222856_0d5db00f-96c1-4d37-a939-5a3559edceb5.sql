
CREATE TABLE public.guest_portals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token text NOT NULL UNIQUE,
  apartment text NOT NULL,
  checkin_date date NOT NULL,
  checkout_date date NOT NULL,
  door_code text,
  wifi_name text,
  wifi_pass text,
  address text,
  guests_count integer,
  language text DEFAULT 'en',
  status text NOT NULL DEFAULT 'active',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.guest_portals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view guest_portals" ON public.guest_portals FOR SELECT USING (true);
CREATE POLICY "Anyone can insert guest_portals" ON public.guest_portals FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update guest_portals" ON public.guest_portals FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete guest_portals" ON public.guest_portals FOR DELETE USING (true);
