
-- Fix overly permissive storage INSERT policy
DROP POLICY IF EXISTS "Authenticated can upload task attachments" ON storage.objects;

CREATE POLICY "Users can upload task attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'task-attachments' AND auth.role() = 'anon' OR bucket_id = 'task-attachments');
