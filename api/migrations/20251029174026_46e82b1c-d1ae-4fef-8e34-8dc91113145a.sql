-- Создание enum для ролей пользователей
CREATE TYPE public.user_role AS ENUM ('admin', 'coordinator', 'cleaner');

-- Создание enum для апартаментов
CREATE TYPE public.apartment_type AS ENUM ('oasis1', 'oasis2', 'salvador');

-- Создание enum для типов уборок
CREATE TYPE public.cleaning_type AS ENUM ('regular', 'double');

-- Создание enum для статусов уборок
CREATE TYPE public.cleaning_status AS ENUM ('planned', 'completed', 'paid');

-- Создание enum для источников выплат
CREATE TYPE public.payment_source AS ENUM ('emma_cash', 'george_cash');

-- Создание enum для типов операций с кассой
CREATE TYPE public.transaction_type AS ENUM ('income', 'expense');

-- Таблица пользователей системы уборок
CREATE TABLE public.cleaning_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role user_role NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Таблица уборок
CREATE TABLE public.cleanings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  apartment apartment_type NOT NULL,
  cleaning_type cleaning_type NOT NULL,
  cleaning_date TIMESTAMP WITH TIME ZONE NOT NULL,
  cleaner_id UUID NOT NULL REFERENCES public.cleaning_users(id),
  status cleaning_status NOT NULL DEFAULT 'planned',
  amount NUMERIC(10, 2) NOT NULL,
  comment TEXT,
  payment_source payment_source,
  payment_date TIMESTAMP WITH TIME ZONE,
  created_by UUID NOT NULL REFERENCES public.cleaning_users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Таблица операций кассы Эммы
CREATE TABLE public.emma_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_type transaction_type NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  description TEXT NOT NULL,
  payment_source payment_source,
  related_cleaning_id UUID REFERENCES public.cleanings(id),
  transaction_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES public.cleaning_users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION public.update_cleaning_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Триггеры для обновления updated_at
CREATE TRIGGER update_cleaning_users_updated_at
  BEFORE UPDATE ON public.cleaning_users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_cleaning_updated_at();

CREATE TRIGGER update_cleanings_updated_at
  BEFORE UPDATE ON public.cleanings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_cleaning_updated_at();

-- Функция для проверки роли пользователя (security definer для избежания рекурсии RLS)
CREATE OR REPLACE FUNCTION public.has_cleaning_role(user_id UUID, required_role user_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cleaning_users
    WHERE id = user_id
      AND role = required_role
      AND is_active = true
  )
$$;

-- Функция для проверки, является ли пользователь администратором или координатором
CREATE OR REPLACE FUNCTION public.is_admin_or_coordinator(user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cleaning_users
    WHERE id = user_id
      AND role IN ('admin', 'coordinator')
      AND is_active = true
  )
$$;

-- Enable RLS на всех таблицах
ALTER TABLE public.cleaning_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleanings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emma_transactions ENABLE ROW LEVEL SECURITY;

-- RLS политики для cleaning_users
-- Все могут видеть активных пользователей
CREATE POLICY "Everyone can view active users"
  ON public.cleaning_users
  FOR SELECT
  USING (is_active = true);

-- Только админы могут создавать/обновлять пользователей
CREATE POLICY "Admins can manage users"
  ON public.cleaning_users
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.cleaning_users cu
      WHERE cu.id = current_setting('app.current_user_id')::UUID
        AND cu.role = 'admin'
        AND cu.is_active = true
    )
  );

-- RLS политики для cleanings
-- Уборщицы видят только свои уборки
CREATE POLICY "Cleaners can view their own cleanings"
  ON public.cleanings
  FOR SELECT
  USING (
    cleaner_id = current_setting('app.current_user_id')::UUID
    OR public.is_admin_or_coordinator(current_setting('app.current_user_id')::UUID)
  );

-- Координаторы и админы могут создавать уборки
CREATE POLICY "Coordinators can create cleanings"
  ON public.cleanings
  FOR INSERT
  WITH CHECK (
    public.is_admin_or_coordinator(current_setting('app.current_user_id')::UUID)
  );

-- Координаторы и админы могут обновлять уборки (только если не оплачены)
CREATE POLICY "Coordinators can update unpaid cleanings"
  ON public.cleanings
  FOR UPDATE
  USING (
    public.is_admin_or_coordinator(current_setting('app.current_user_id')::UUID)
    AND status != 'paid'
  );

-- Только админы могут удалять уборки
CREATE POLICY "Admins can delete cleanings"
  ON public.cleanings
  FOR DELETE
  USING (
    public.has_cleaning_role(current_setting('app.current_user_id')::UUID, 'admin')
  );

-- RLS политики для emma_transactions
-- Координаторы и админы видят все транзакции
CREATE POLICY "Coordinators can view transactions"
  ON public.emma_transactions
  FOR SELECT
  USING (
    public.is_admin_or_coordinator(current_setting('app.current_user_id')::UUID)
  );

-- Координаторы и админы могут создавать транзакции
CREATE POLICY "Coordinators can create transactions"
  ON public.emma_transactions
  FOR INSERT
  WITH CHECK (
    public.is_admin_or_coordinator(current_setting('app.current_user_id')::UUID)
  );

-- Только админы могут обновлять/удалять транзакции
CREATE POLICY "Admins can manage transactions"
  ON public.emma_transactions
  FOR ALL
  USING (
    public.has_cleaning_role(current_setting('app.current_user_id')::UUID, 'admin')
  );

-- Вставка начальных пользователей (пароли будут захэшированы в edge функции)
INSERT INTO public.cleaning_users (username, password_hash, full_name, role) VALUES
  ('george', 'TEMP_HASH_ADMIN', 'Георгий', 'admin'),
  ('irina_coord', '0809', 'Ирина (Координатор)', 'coordinator'),
  ('irina_cleaner', '1980', 'Ирина (Уборщица)', 'cleaner'),
  ('maryana', '1986', 'Марьяна', 'cleaner'),
  ('victoria', '1654', 'Виктория', 'cleaner');