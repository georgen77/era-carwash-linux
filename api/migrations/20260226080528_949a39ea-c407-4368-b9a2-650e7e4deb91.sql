
-- Tasks table
CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  emoji text NOT NULL DEFAULT '📋',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  initiated_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and coordinators can manage tasks"
ON public.tasks FOR ALL
USING (is_admin_or_coordinator((current_setting('app.current_user_id'))::uuid));

CREATE POLICY "All active users can view tasks"
ON public.tasks FOR SELECT
USING (true);

-- Task steps (subtasks)
CREATE TABLE public.task_steps (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  description text NOT NULL,
  emoji text NOT NULL DEFAULT '📝',
  contact_info text,
  documents_submitted text,
  documents_received text,
  information_obtained text,
  completed_date date,
  is_completed boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.task_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and coordinators can manage task_steps"
ON public.task_steps FOR ALL
USING (is_admin_or_coordinator((current_setting('app.current_user_id'))::uuid));

CREATE POLICY "All can view task_steps"
ON public.task_steps FOR SELECT
USING (true);

-- Task step attachments
CREATE TABLE public.task_attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_step_id uuid REFERENCES public.task_steps(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text NOT NULL, -- 'image', 'document', 'audio', 'voice'
  transcription text,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and coordinators can manage task_attachments"
ON public.task_attachments FOR ALL
USING (is_admin_or_coordinator((current_setting('app.current_user_id'))::uuid));

CREATE POLICY "All can view task_attachments"
ON public.task_attachments FOR SELECT
USING (true);

-- Task AI chats
CREATE TABLE public.task_chats (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.task_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and coordinators can manage task_chats"
ON public.task_chats FOR ALL
USING (is_admin_or_coordinator((current_setting('app.current_user_id'))::uuid));

-- Storage bucket for task attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('task-attachments', 'task-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view task attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'task-attachments');

CREATE POLICY "Authenticated can upload task attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'task-attachments');

CREATE POLICY "Authenticated can delete task attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'task-attachments');

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_task_steps_updated_at BEFORE UPDATE ON public.task_steps
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
