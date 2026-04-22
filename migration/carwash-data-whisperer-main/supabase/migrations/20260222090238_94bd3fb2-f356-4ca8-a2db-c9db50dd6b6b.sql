
-- Table to store unique contractors
CREATE TABLE public.contractors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to contractors"
  ON public.contractors
  FOR ALL
  USING (true)
  WITH CHECK (true);
