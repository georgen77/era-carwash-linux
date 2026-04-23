
CREATE TABLE public.ai_prompt_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  description text,
  data_source text,
  example_answer text,
  category text DEFAULT 'general',
  active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.ai_prompt_journal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to ai_prompt_journal"
  ON public.ai_prompt_journal FOR ALL USING (true) WITH CHECK (true);
