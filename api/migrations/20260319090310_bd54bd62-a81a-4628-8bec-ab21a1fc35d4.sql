
-- cleaning_schedule: stores bookings from iCal / manual / bot
CREATE TABLE IF NOT EXISTS public.cleaning_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment TEXT NOT NULL,
  checkin_date DATE NOT NULL,
  checkout_date DATE,
  guests_count TEXT,
  notes TEXT,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.cleaning_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view cleaning_schedule" ON public.cleaning_schedule FOR SELECT USING (true);
CREATE POLICY "Anyone can insert cleaning_schedule" ON public.cleaning_schedule FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update cleaning_schedule" ON public.cleaning_schedule FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete cleaning_schedule" ON public.cleaning_schedule FOR DELETE USING (true);

-- cleaners: list of cleaners with contact info
CREATE TABLE IF NOT EXISTS public.cleaners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  telegram_id TEXT,
  whatsapp_number TEXT,
  available_days TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.cleaners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view cleaners" ON public.cleaners FOR SELECT USING (true);
CREATE POLICY "Anyone can insert cleaners" ON public.cleaners FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update cleaners" ON public.cleaners FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete cleaners" ON public.cleaners FOR DELETE USING (true);

-- cleaning_assignments: cleaner <-> schedule assignments
CREATE TABLE IF NOT EXISTS public.cleaning_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID REFERENCES public.cleaning_schedule(id) ON DELETE SET NULL,
  apartment TEXT NOT NULL,
  cleaning_date DATE NOT NULL,
  cleaner_name TEXT,
  cleaner_telegram_id TEXT,
  status TEXT DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE,
  finished_at TIMESTAMP WITH TIME ZONE,
  payment_amount NUMERIC DEFAULT 35,
  payment_confirmed BOOLEAN DEFAULT false,
  payment_confirmed_at TIMESTAMP WITH TIME ZONE,
  payment_transaction_id UUID,
  registered_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  confirmed_at TIMESTAMP WITH TIME ZONE,
  confirmed_by TEXT
);

ALTER TABLE public.cleaning_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view cleaning_assignments" ON public.cleaning_assignments FOR SELECT USING (true);
CREATE POLICY "Anyone can insert cleaning_assignments" ON public.cleaning_assignments FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update cleaning_assignments" ON public.cleaning_assignments FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete cleaning_assignments" ON public.cleaning_assignments FOR DELETE USING (true);

-- ical_sources: iCal feed URLs per apartment/platform
CREATE TABLE IF NOT EXISTS public.ical_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment TEXT NOT NULL,
  platform TEXT NOT NULL,
  ical_url TEXT NOT NULL,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  active BOOLEAN DEFAULT true
);

ALTER TABLE public.ical_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view ical_sources" ON public.ical_sources FOR SELECT USING (true);
CREATE POLICY "Anyone can insert ical_sources" ON public.ical_sources FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update ical_sources" ON public.ical_sources FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete ical_sources" ON public.ical_sources FOR DELETE USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cleaning_assignments_date ON public.cleaning_assignments(cleaning_date);
CREATE INDEX IF NOT EXISTS idx_cleaning_assignments_telegram ON public.cleaning_assignments(cleaner_telegram_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_schedule_checkin ON public.cleaning_schedule(checkin_date);
CREATE INDEX IF NOT EXISTS idx_cleaning_schedule_apartment ON public.cleaning_schedule(apartment);
