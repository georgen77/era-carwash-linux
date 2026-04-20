-- Create apartment enum type if not exists
DO $$ BEGIN
  CREATE TYPE apartment_type AS ENUM ('salvador', 'oasis_1', 'oasis_2', 'oasis_grande');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create bookings table
CREATE TABLE public.bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  apartment apartment_type NOT NULL,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  guest_name TEXT,
  guest_count INTEGER NOT NULL CHECK (guest_count > 0),
  cleaner_id UUID REFERENCES public.cleaning_users(id),
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Everyone can view bookings
CREATE POLICY "Everyone can view bookings"
ON public.bookings
FOR SELECT
USING (true);

-- Coordinators can create bookings
CREATE POLICY "Coordinators can create bookings"
ON public.bookings
FOR INSERT
WITH CHECK (is_admin_or_coordinator((current_setting('app.current_user_id'::text))::uuid));

-- Coordinators can update bookings
CREATE POLICY "Coordinators can update bookings"
ON public.bookings
FOR UPDATE
USING (is_admin_or_coordinator((current_setting('app.current_user_id'::text))::uuid));

-- Admins can delete bookings
CREATE POLICY "Admins can delete bookings"
ON public.bookings
FOR DELETE
USING (has_cleaning_role((current_setting('app.current_user_id'::text))::uuid, 'admin'));

-- Create trigger for updated_at
CREATE TRIGGER update_bookings_updated_at
BEFORE UPDATE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.update_cleaning_updated_at();