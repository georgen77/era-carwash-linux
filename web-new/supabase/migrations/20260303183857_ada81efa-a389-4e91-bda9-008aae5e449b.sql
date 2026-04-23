CREATE TABLE public.ai_chat_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username text NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  image text NULL,
  error boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to ai_chat_messages"
ON public.ai_chat_messages
FOR ALL
USING (true)
WITH CHECK (true);

CREATE INDEX idx_ai_chat_messages_username_created ON public.ai_chat_messages (username, created_at DESC);