
-- Add cleaner_name to movements table
ALTER TABLE public.movements ADD COLUMN IF NOT EXISTS cleaner_name text;

-- Create pending_movements table
CREATE TABLE IF NOT EXISTS public.pending_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_location text,
  to_location text,
  items jsonb,
  apartment_name text,
  original_message text,
  cleaner_name text,
  source text,
  chat_id text,
  telegram_message_id text,
  whatsapp_message_sid text,
  confirmed boolean DEFAULT false,
  needs_clarification boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.pending_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert pending_movements"
  ON public.pending_movements FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can view pending_movements"
  ON public.pending_movements FOR SELECT
  USING (true);

CREATE POLICY "Anyone can update pending_movements"
  ON public.pending_movements FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete pending_movements"
  ON public.pending_movements FOR DELETE
  USING (true);
