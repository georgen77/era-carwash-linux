
INSERT INTO storage.buckets (id, name, public) VALUES ('card-backgrounds', 'card-backgrounds', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Card backgrounds are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'card-backgrounds');

CREATE POLICY "Anyone can upload card backgrounds"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'card-backgrounds');

CREATE POLICY "Anyone can delete card backgrounds"
ON storage.objects FOR DELETE
USING (bucket_id = 'card-backgrounds');
