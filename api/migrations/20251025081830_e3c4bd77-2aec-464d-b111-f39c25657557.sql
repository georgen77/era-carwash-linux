-- Add laundry accounting columns to movements table
ALTER TABLE movements 
ADD COLUMN laundry_item_cost DECIMAL(10,2),
ADD COLUMN delivery_cost DECIMAL(10,2),
ADD COLUMN large_stain_count INTEGER DEFAULT 0,
ADD COLUMN small_stain_count INTEGER DEFAULT 0,
ADD COLUMN large_stain_cost DECIMAL(10,2) DEFAULT 3.00,
ADD COLUMN small_stain_cost DECIMAL(10,2) DEFAULT 1.50,
ADD COLUMN manual_adjustment DECIMAL(10,2) DEFAULT 0,
ADD COLUMN total_laundry_cost DECIMAL(10,2);

-- Add comment explaining the laundry cost structure
COMMENT ON COLUMN movements.laundry_item_cost IS 'Cost per item for laundry service';
COMMENT ON COLUMN movements.delivery_cost IS 'Delivery cost: 15 EUR weekday, 22 EUR weekend';
COMMENT ON COLUMN movements.large_stain_count IS 'Number of items with large stains';
COMMENT ON COLUMN movements.small_stain_count IS 'Number of items with small stains';
COMMENT ON COLUMN movements.manual_adjustment IS 'Manual adjustment to the total cost';
COMMENT ON COLUMN movements.total_laundry_cost IS 'Total cost including items, delivery, stains, and adjustments';