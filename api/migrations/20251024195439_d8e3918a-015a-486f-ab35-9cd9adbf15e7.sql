-- Add new item types to the enum
ALTER TYPE item_type ADD VALUE IF NOT EXISTS 'kitchen_towels';
ALTER TYPE item_type ADD VALUE IF NOT EXISTS 'rugs';