
INSERT INTO storage.buckets (id, name, public)
VALUES ('city-assets', 'city-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "City assets are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'city-assets');

CREATE POLICY "Authenticated users can upload city assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'city-assets');

CREATE POLICY "Authenticated users can update city assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'city-assets');
