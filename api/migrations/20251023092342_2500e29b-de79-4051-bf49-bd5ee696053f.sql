-- Add new location types for damaged/stolen items and purchases
ALTER TYPE location_type ADD VALUE IF NOT EXISTS 'damaged';
ALTER TYPE location_type ADD VALUE IF NOT EXISTS 'purchase';

-- Create a function to get current inventory for a specific location and item type
CREATE OR REPLACE FUNCTION get_current_inventory(
  p_location location_type,
  p_item_type item_type
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_qty INTEGER;
BEGIN
  SELECT COALESCE(SUM(
    CASE 
      WHEN to_location = p_location THEN quantity
      WHEN from_location = p_location THEN -quantity
      ELSE 0
    END
  ), 0)
  INTO current_qty
  FROM movements
  WHERE p_location IN (from_location, to_location)
    AND item_type = p_item_type;
  
  RETURN current_qty;
END;
$$;