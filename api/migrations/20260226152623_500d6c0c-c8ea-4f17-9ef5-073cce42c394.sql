
-- Create task-attachments storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'task-attachments',
  'task-attachments', 
  true,
  52428800,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','audio/webm','audio/wav','audio/mp3','audio/ogg','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv']
)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 52428800;

-- Allow all reads (bucket is public)
DROP POLICY IF EXISTS "task_attachments_public_read" ON storage.objects;
CREATE POLICY "task_attachments_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'task-attachments');

-- Allow all uploads (custom auth system, not supabase auth)
DROP POLICY IF EXISTS "task_attachments_upload" ON storage.objects;
CREATE POLICY "task_attachments_upload"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'task-attachments');

DROP POLICY IF EXISTS "task_attachments_delete" ON storage.objects;
CREATE POLICY "task_attachments_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'task-attachments');
