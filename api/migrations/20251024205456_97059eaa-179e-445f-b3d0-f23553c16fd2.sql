-- Add whatsapp_status column to movements table
ALTER TABLE movements 
ADD COLUMN whatsapp_status TEXT DEFAULT 'pending' CHECK (whatsapp_status IN ('pending', 'sent', 'failed'));

-- Add whatsapp_sent_at column to track when message was sent
ALTER TABLE movements 
ADD COLUMN whatsapp_sent_at TIMESTAMP WITH TIME ZONE;