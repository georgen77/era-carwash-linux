
CREATE TABLE public.guest_checkins (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  portal_token text NOT NULL,
  apartment text NOT NULL,
  guest_name text,
  country text,
  guests_count integer,
  arrival_time text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.guest_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view guest_checkins" ON public.guest_checkins FOR SELECT USING (true);
CREATE POLICY "Anyone can insert guest_checkins" ON public.guest_checkins FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update guest_checkins" ON public.guest_checkins FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete guest_checkins" ON public.guest_checkins FOR DELETE USING (true);
