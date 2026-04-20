
-- Fix 1: Allow all users to update task_steps (not just admins/coordinators)
DROP POLICY IF EXISTS "Admins and coordinators can update task_steps" ON public.task_steps;
CREATE POLICY "All users can update task_steps" ON public.task_steps
  FOR UPDATE USING (true);

-- Fix 2: Storage policies for task-attachments bucket — ensure INSERT works for all
DO $$
BEGIN
  -- Drop existing storage policies if any
  DELETE FROM storage.policies WHERE bucket_id = 'task-attachments';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('task-attachments', 'task-attachments', true, 52428800, null)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 52428800;

-- Storage RLS policies
DO $$
BEGIN
  DROP POLICY IF EXISTS "task_attachments_select" ON storage.objects;
  DROP POLICY IF EXISTS "task_attachments_insert" ON storage.objects;
  DROP POLICY IF EXISTS "task_attachments_delete" ON storage.objects;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "task_attachments_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'task-attachments');

CREATE POLICY "task_attachments_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'task-attachments');

CREATE POLICY "task_attachments_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'task-attachments');
