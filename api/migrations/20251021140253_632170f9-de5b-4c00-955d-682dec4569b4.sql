-- Create enum for locations
CREATE TYPE location_type AS ENUM (
  'piral_1',
  'piral_2',
  'salvador',
  'dirty_linen_piral',
  'dirty_linen_salvador',
  'clean_linen_piral',
  'clean_linen_salvador',
  'albert_laundry'
);

-- Create enum for item types
CREATE TYPE item_type AS ENUM (
  'sheets',
  'duvet_covers',
  'pillowcases',
  'large_towels',
  'small_towels'
);

-- Create movements table to track all linen transfers
CREATE TABLE public.movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_location location_type NOT NULL,
  to_location location_type NOT NULL,
  item_type item_type NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

-- Enable RLS on movements table
ALTER TABLE public.movements ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anyone to view movements (public data)
CREATE POLICY "Anyone can view movements"
  ON public.movements
  FOR SELECT
  USING (true);

-- Create policy to allow anyone to create movements (public data)
CREATE POLICY "Anyone can create movements"
  ON public.movements
  FOR INSERT
  WITH CHECK (true);

-- Create a materialized view for current inventory at each location
CREATE MATERIALIZED VIEW public.current_inventory AS
WITH incoming AS (
  SELECT 
    to_location AS location,
    item_type,
    SUM(quantity) AS quantity
  FROM public.movements
  GROUP BY to_location, item_type
),
outgoing AS (
  SELECT 
    from_location AS location,
    item_type,
    SUM(quantity) AS quantity
  FROM public.movements
  GROUP BY from_location, item_type
)
SELECT 
  COALESCE(incoming.location, outgoing.location) AS location,
  COALESCE(incoming.item_type, outgoing.item_type) AS item_type,
  COALESCE(incoming.quantity, 0) - COALESCE(outgoing.quantity, 0) AS quantity
FROM incoming
FULL OUTER JOIN outgoing 
  ON incoming.location = outgoing.location 
  AND incoming.item_type = outgoing.item_type;

-- Create function to refresh inventory view
CREATE OR REPLACE FUNCTION refresh_inventory()
RETURNS TRIGGER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.current_inventory;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-refresh inventory after movements
CREATE TRIGGER refresh_inventory_on_movement
AFTER INSERT OR UPDATE OR DELETE ON public.movements
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_inventory();

-- Initial refresh of materialized view
REFRESH MATERIALIZED VIEW public.current_inventory;