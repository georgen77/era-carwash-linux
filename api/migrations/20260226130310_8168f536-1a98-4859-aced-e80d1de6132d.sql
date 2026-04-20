
-- Fix 1: cleaning_users infinite recursion
-- The "Admins can manage users" policy references cleaning_users inside itself
DROP POLICY IF EXISTS "Admins can manage users" ON public.cleaning_users;
DROP POLICY IF EXISTS "Everyone can view active users" ON public.cleaning_users;

-- Use security definer function to avoid recursion
CREATE POLICY "Everyone can view active users"
ON public.cleaning_users FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage users"
ON public.cleaning_users FOR ALL
USING (has_cleaning_role((current_setting('app.current_user_id'::text, true))::uuid, 'admin'::user_role));

-- Fix 2: task_chats - allow all users to insert/select (custom auth app)
DROP POLICY IF EXISTS "Admins and coordinators can manage task_chats" ON public.task_chats;

CREATE POLICY "All users can view task_chats"
ON public.task_chats FOR SELECT USING (true);

CREATE POLICY "All users can insert task_chats"
ON public.task_chats FOR INSERT WITH CHECK (true);

CREATE POLICY "All users can delete task_chats"
ON public.task_chats FOR DELETE USING (true);
