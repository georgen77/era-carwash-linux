
-- Create a public bucket for task/note attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read on attachments
DO $$
BEGIN
  BEGIN
    CREATE POLICY "Public read attachments"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'attachments');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    CREATE POLICY "Anyone can upload attachments"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'attachments');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    CREATE POLICY "Public read card-backgrounds"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'card-backgrounds');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    CREATE POLICY "Anyone can upload card-backgrounds"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'card-backgrounds');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
