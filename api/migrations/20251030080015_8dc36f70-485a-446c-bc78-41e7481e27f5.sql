-- Add missing apartment types
ALTER TYPE apartment_type ADD VALUE IF NOT EXISTS 'oasis_1';
ALTER TYPE apartment_type ADD VALUE IF NOT EXISTS 'oasis_2';
ALTER TYPE apartment_type ADD VALUE IF NOT EXISTS 'oasis_grande';

-- Add missing payment sources
ALTER TYPE payment_source ADD VALUE IF NOT EXISTS 'emma_card';
ALTER TYPE payment_source ADD VALUE IF NOT EXISTS 'emma_bank';
ALTER TYPE payment_source ADD VALUE IF NOT EXISTS 'george_card';
ALTER TYPE payment_source ADD VALUE IF NOT EXISTS 'george_bank';