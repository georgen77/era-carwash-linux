
-- Lock codes log
CREATE TABLE public.lock_codes_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment text NOT NULL,
  code text NOT NULL,
  checkin_date date,
  checkout_date date,
  valid_from timestamptz,
  valid_to timestamptz,
  action text NOT NULL DEFAULT 'create',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lock_codes_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view lock_codes_log" ON public.lock_codes_log FOR SELECT USING (true);
CREATE POLICY "Anyone can insert lock_codes_log" ON public.lock_codes_log FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update lock_codes_log" ON public.lock_codes_log FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete lock_codes_log" ON public.lock_codes_log FOR DELETE USING (true);

-- Guest messages log
CREATE TABLE public.guest_messages_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment text NOT NULL,
  code text,
  language text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  checkin_date date,
  checkout_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.guest_messages_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view guest_messages_log" ON public.guest_messages_log FOR SELECT USING (true);
CREATE POLICY "Anyone can insert guest_messages_log" ON public.guest_messages_log FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update guest_messages_log" ON public.guest_messages_log FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete guest_messages_log" ON public.guest_messages_log FOR DELETE USING (true);
