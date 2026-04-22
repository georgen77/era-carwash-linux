
CREATE TABLE public.report_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  report_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_report_cache_key ON public.report_cache(cache_key);
-- Index for cleanup of old entries
CREATE INDEX idx_report_cache_created ON public.report_cache(created_at);

-- Allow all access (no auth in this app)
ALTER TABLE public.report_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to report_cache"
ON public.report_cache
FOR ALL
USING (true)
WITH CHECK (true);
