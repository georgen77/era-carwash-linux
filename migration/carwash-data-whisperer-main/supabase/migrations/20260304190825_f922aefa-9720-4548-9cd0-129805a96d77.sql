
CREATE TABLE public.task_activity_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL,
  task_title text NOT NULL,
  task_snapshot jsonb NOT NULL,
  action text NOT NULL,
  old_status text,
  new_status text,
  performed_by text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.task_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to task_activity_log"
ON public.task_activity_log FOR ALL
USING (true)
WITH CHECK (true);

CREATE INDEX idx_task_activity_log_task_id ON public.task_activity_log(task_id);
CREATE INDEX idx_task_activity_log_created_at ON public.task_activity_log(created_at DESC);
CREATE INDEX idx_task_activity_log_action ON public.task_activity_log(action);
