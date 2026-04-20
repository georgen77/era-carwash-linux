
CREATE TABLE public.albert_visits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  visited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  source_locations TEXT[] DEFAULT '{}',
  delivered_items JSONB DEFAULT '{}',
  picked_items JSONB DEFAULT '{}',
  delivered_cost DECIMAL DEFAULT 0,
  balance_after JSONB DEFAULT '{}',
  dirty_remaining JSONB DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.albert_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view albert_visits" ON public.albert_visits FOR SELECT USING (true);
CREATE POLICY "Anyone can insert albert_visits" ON public.albert_visits FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update albert_visits" ON public.albert_visits FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete albert_visits" ON public.albert_visits FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_cleaners_active_name ON public.cleaners(name) WHERE is_active = true;
