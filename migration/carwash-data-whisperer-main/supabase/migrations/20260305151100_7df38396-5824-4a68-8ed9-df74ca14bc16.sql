
-- Create public storage bucket for card background images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('card-backgrounds', 'card-backgrounds', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read public images
CREATE POLICY "card-backgrounds public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'card-backgrounds');

-- Allow insert (service role / anon for generation)
CREATE POLICY "card-backgrounds insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'card-backgrounds');

-- Allow delete
CREATE POLICY "card-backgrounds delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'card-backgrounds');
