CREATE TABLE public.telegram_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text NOT NULL,
  user_name text,
  user_first_name text,
  message_text text,
  message_type text NOT NULL DEFAULT 'text',
  photo_url text,
  direction text NOT NULL DEFAULT 'incoming',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view telegram_messages"
  ON public.telegram_messages FOR SELECT TO public USING (true);

CREATE POLICY "Anyone can insert telegram_messages"
  ON public.telegram_messages FOR INSERT TO public WITH CHECK (true);