
-- Fix tasks RLS: allow all users to create tasks (not just admin/coordinator)
-- Drop old restrictive ALL policies and replace with proper per-operation policies

DROP POLICY IF EXISTS "Admins and coordinators can manage tasks" ON public.tasks;
DROP POLICY IF EXISTS "All active users can view tasks" ON public.tasks;

CREATE POLICY "All can view tasks"
  ON public.tasks FOR SELECT USING (true);

CREATE POLICY "All users can create tasks"
  ON public.tasks FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins and coordinators can update tasks"
  ON public.tasks FOR UPDATE
  USING (is_admin_or_coordinator((current_setting('app.current_user_id'::text, true))::uuid));

CREATE POLICY "Admins can delete tasks"
  ON public.tasks FOR DELETE
  USING (has_cleaning_role((current_setting('app.current_user_id'::text, true))::uuid, 'admin'::user_role));

-- Fix task_steps RLS similarly
DROP POLICY IF EXISTS "Admins and coordinators can manage task_steps" ON public.task_steps;
DROP POLICY IF EXISTS "All can view task_steps" ON public.task_steps;

CREATE POLICY "All can view task_steps"
  ON public.task_steps FOR SELECT USING (true);

CREATE POLICY "All users can create task_steps"
  ON public.task_steps FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins and coordinators can update task_steps"
  ON public.task_steps FOR UPDATE
  USING (is_admin_or_coordinator((current_setting('app.current_user_id'::text, true))::uuid));

CREATE POLICY "Admins can delete task_steps"
  ON public.task_steps FOR DELETE
  USING (has_cleaning_role((current_setting('app.current_user_id'::text, true))::uuid, 'admin'::user_role));

-- Fix task_attachments RLS similarly
DROP POLICY IF EXISTS "Admins and coordinators can manage task_attachments" ON public.task_attachments;
DROP POLICY IF EXISTS "All can view task_attachments" ON public.task_attachments;

CREATE POLICY "All can view task_attachments"
  ON public.task_attachments FOR SELECT USING (true);

CREATE POLICY "All users can create task_attachments"
  ON public.task_attachments FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can delete task_attachments"
  ON public.task_attachments FOR DELETE
  USING (has_cleaning_role((current_setting('app.current_user_id'::text, true))::uuid, 'admin'::user_role));
