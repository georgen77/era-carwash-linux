-- Add columns for receipt photo and purchase location
ALTER TABLE movements 
ADD COLUMN IF NOT EXISTS receipt_url TEXT,
ADD COLUMN IF NOT EXISTS purchase_location TEXT;

-- Create storage bucket for receipts
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for receipts
CREATE POLICY "Anyone can view receipts"
ON storage.objects FOR SELECT
USING (bucket_id = 'receipts');

CREATE POLICY "Anyone can upload receipts"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'receipts');

CREATE POLICY "Anyone can update receipts"
ON storage.objects FOR UPDATE
USING (bucket_id = 'receipts');