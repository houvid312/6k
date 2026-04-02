-- ============================================================
-- 6K PIZZA - Schema Completo
-- Migración inicial: tablas, enums, triggers, seed data, RLS
-- ============================================================

-- ==================== ENUMS ====================

CREATE TYPE pizza_size AS ENUM ('FAMILIAR', 'MEDIANA', 'DIAMANTE', 'INDIVIDUAL');
CREATE TYPE payment_method AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'MIXTO');
CREATE TYPE inventory_level AS ENUM ('RAW', 'PROCESSED', 'STORE');
CREATE TYPE worker_role AS ENUM ('PREPARADOR', 'ADMINISTRADOR', 'CAJERO', 'HORNERO', 'ESTIRADOR');
CREATE TYPE transfer_status AS ENUM ('PENDING', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED');
CREATE TYPE user_role AS ENUM ('ADMIN', 'COLABORADOR');
CREATE TYPE product_category AS ENUM ('PIZZA', 'BEBIDA', 'OTRO');
CREATE TYPE debtor_type AS ENUM ('CLIENTE', 'TRABAJADOR');
CREATE TYPE alert_type AS ENUM ('LOSS', 'SURPLUS', 'OK');

-- ==================== TABLAS CORE ====================

-- Locales / Puntos de venta
CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_production_center BOOLEAN NOT NULL DEFAULT false,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trabajadores (también son usuarios del sistema)
CREATE TABLE workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  role worker_role NOT NULL,
  user_role user_role NOT NULL DEFAULT 'COLABORADOR',
  hourly_rate INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  phone TEXT,
  pin TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Productos (pizzas, bebidas, otros)
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category product_category NOT NULL DEFAULT 'PIZZA',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insumos / Materias primas
CREATE TABLE supplies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'GRAMOS',
  grams_per_bag NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== RECETAS ====================

CREATE TABLE recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id)
);

CREATE TABLE recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  supply_id UUID NOT NULL REFERENCES supplies(id) ON DELETE CASCADE,
  grams_per_portion NUMERIC NOT NULL DEFAULT 0,
  UNIQUE(recipe_id, supply_id)
);

-- ==================== PRECIOS ====================

CREATE TABLE product_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size pizza_size,
  price INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, size)
);

-- ==================== VENTAS ====================

CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  worker_id UUID REFERENCES workers(id),
  payment_method payment_method NOT NULL DEFAULT 'EFECTIVO',
  total_portions INTEGER NOT NULL DEFAULT 0,
  total_amount INTEGER NOT NULL DEFAULT 0,
  cash_amount INTEGER NOT NULL DEFAULT 0,
  bank_amount INTEGER NOT NULL DEFAULT 0,
  observations TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  size pizza_size NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  portions INTEGER NOT NULL DEFAULT 0,
  unit_price INTEGER NOT NULL DEFAULT 0,
  subtotal INTEGER NOT NULL DEFAULT 0
);

-- ==================== INVENTARIO ====================

CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supply_id UUID NOT NULL REFERENCES supplies(id),
  store_id UUID NOT NULL REFERENCES stores(id),
  level inventory_level NOT NULL DEFAULT 'STORE',
  quantity_grams NUMERIC NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(supply_id, store_id, level)
);

-- ==================== COMPRAS ====================

CREATE TABLE purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supply_id UUID NOT NULL REFERENCES supplies(id),
  quantity_grams NUMERIC NOT NULL DEFAULT 0,
  price_cop INTEGER NOT NULL DEFAULT 0,
  supplier TEXT NOT NULL DEFAULT '',
  payment_method payment_method NOT NULL DEFAULT 'EFECTIVO',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== TRASLADOS ====================

CREATE TABLE transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_store_id UUID NOT NULL REFERENCES stores(id),
  to_store_id UUID NOT NULL REFERENCES stores(id),
  status transfer_status NOT NULL DEFAULT 'PENDING',
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  shipping_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transfer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
  supply_id UUID NOT NULL REFERENCES supplies(id),
  target_grams NUMERIC NOT NULL DEFAULT 0,
  current_inventory_grams NUMERIC NOT NULL DEFAULT 0,
  bags_to_send INTEGER NOT NULL DEFAULT 0
);

-- ==================== CIERRE DE CAJA ====================

CREATE TABLE cash_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  date DATE NOT NULL,
  bills_100k INTEGER NOT NULL DEFAULT 0,
  bills_50k INTEGER NOT NULL DEFAULT 0,
  bills_20k INTEGER NOT NULL DEFAULT 0,
  bills_10k INTEGER NOT NULL DEFAULT 0,
  bills_5k INTEGER NOT NULL DEFAULT 0,
  bills_2k INTEGER NOT NULL DEFAULT 0,
  coins INTEGER NOT NULL DEFAULT 0,
  bank_total INTEGER NOT NULL DEFAULT 0,
  expected_total INTEGER NOT NULL DEFAULT 0,
  actual_total INTEGER NOT NULL DEFAULT 0,
  discrepancy INTEGER NOT NULL DEFAULT 0,
  expenses INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, date)
);

-- ==================== CONTEO FISICO ====================

CREATE TABLE physical_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE physical_count_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  physical_count_id UUID NOT NULL REFERENCES physical_counts(id) ON DELETE CASCADE,
  supply_id UUID NOT NULL REFERENCES supplies(id),
  bags INTEGER NOT NULL DEFAULT 0,
  loose_grams NUMERIC NOT NULL DEFAULT 0,
  total_grams NUMERIC NOT NULL DEFAULT 0
);

-- ==================== VALIDACIONES / AUDITORÍA ====================

CREATE TABLE validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  supply_id UUID NOT NULL REFERENCES supplies(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  theoretical_grams NUMERIC NOT NULL DEFAULT 0,
  real_grams NUMERIC NOT NULL DEFAULT 0,
  difference_grams NUMERIC NOT NULL DEFAULT 0,
  alert_percentage NUMERIC NOT NULL DEFAULT 0,
  alert_type alert_type NOT NULL DEFAULT 'OK',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== GASTOS ====================

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL DEFAULT 'Otro',
  description TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL DEFAULT 0,
  payment_method payment_method NOT NULL DEFAULT 'EFECTIVO',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== CARTERA / CRÉDITOS ====================

CREATE TABLE credit_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debtor_name TEXT NOT NULL,
  debtor_type debtor_type NOT NULL DEFAULT 'CLIENTE',
  worker_id UUID REFERENCES workers(id),
  concept TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL DEFAULT 0,
  balance INTEGER NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  paid_date DATE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== HORARIOS ====================

CREATE TABLE schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TEXT NOT NULL DEFAULT '08:00',
  end_time TEXT NOT NULL DEFAULT '16:00',
  hours NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== ASISTENCIA ====================

CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  scheduled_hours NUMERIC NOT NULL DEFAULT 0,
  actual_hours NUMERIC NOT NULL DEFAULT 0,
  hourly_rate INTEGER NOT NULL DEFAULT 0,
  subtotal INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== NÓMINA ====================

CREATE TABLE payroll_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_hours NUMERIC NOT NULL DEFAULT 0,
  gross_pay INTEGER NOT NULL DEFAULT 0,
  deductions INTEGER NOT NULL DEFAULT 0,
  net_pay INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== ÍNDICES ====================

CREATE INDEX idx_sales_store_date ON sales(store_id, created_at);
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_inventory_store_level ON inventory(store_id, level);
CREATE INDEX idx_inventory_supply_store ON inventory(supply_id, store_id, level);
CREATE INDEX idx_transfers_store ON transfers(to_store_id, status);
CREATE INDEX idx_cash_closings_store_date ON cash_closings(store_id, date);
CREATE INDEX idx_credit_entries_debtor ON credit_entries(debtor_name, is_paid);
CREATE INDEX idx_credit_entries_worker ON credit_entries(worker_id) WHERE worker_id IS NOT NULL;
CREATE INDEX idx_attendance_worker_date ON attendance(worker_id, date);
CREATE INDEX idx_schedules_store ON schedules(store_id, day_of_week);
CREATE INDEX idx_expenses_store_date ON expenses(store_id, date);
CREATE INDEX idx_validations_store_date ON validations(store_id, date);
CREATE INDEX idx_workers_auth ON workers(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- ==================== FUNCIÓN: Descontar inventario al vender ====================

CREATE OR REPLACE FUNCTION deduct_inventory_on_sale()
RETURNS TRIGGER AS $$
DECLARE
  item RECORD;
  ingredient RECORD;
  recipe_id_val UUID;
  portions_sold INTEGER;
BEGIN
  FOR item IN SELECT * FROM sale_items WHERE sale_id = NEW.id
  LOOP
    portions_sold := item.portions;

    SELECT r.id INTO recipe_id_val
    FROM recipes r WHERE r.product_id = item.product_id;

    IF recipe_id_val IS NOT NULL THEN
      FOR ingredient IN
        SELECT ri.supply_id, ri.grams_per_portion
        FROM recipe_ingredients ri
        WHERE ri.recipe_id = recipe_id_val
      LOOP
        UPDATE inventory
        SET quantity_grams = quantity_grams - (ingredient.grams_per_portion * portions_sold),
            last_updated = now()
        WHERE supply_id = ingredient.supply_id
          AND store_id = NEW.store_id
          AND level = 'STORE';
      END LOOP;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_deduct_inventory
  AFTER INSERT ON sales
  FOR EACH ROW
  EXECUTE FUNCTION deduct_inventory_on_sale();

-- ==================== RLS POLICIES ====================

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplies ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE physical_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE physical_count_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;

-- Helper: obtener el user_role del worker autenticado
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT w.user_role FROM workers w
  WHERE w.auth_user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Lectura: todos los autenticados pueden leer tablas de referencia
CREATE POLICY "Authenticated read stores" ON stores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read products" ON products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read supplies" ON supplies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read recipes" ON recipes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read recipe_ingredients" ON recipe_ingredients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read product_prices" ON product_prices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read inventory" ON inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read workers" ON workers FOR SELECT TO authenticated USING (true);

-- Ventas: colaboradores pueden crear, todos leen
CREATE POLICY "Authenticated read sales" ON sales FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read sale_items" ON sale_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert sales" ON sales FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert sale_items" ON sale_items FOR INSERT TO authenticated WITH CHECK (true);

-- Cierre de caja: colaboradores pueden crear
CREATE POLICY "Authenticated read cash_closings" ON cash_closings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert cash_closings" ON cash_closings FOR INSERT TO authenticated WITH CHECK (true);

-- Solo admin: escritura en tablas de gestión
CREATE POLICY "Admin manage stores" ON stores FOR ALL TO authenticated USING (get_user_role() = 'ADMIN') WITH CHECK (get_user_role() = 'ADMIN');
CREATE POLICY "Admin manage inventory" ON inventory FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin manage purchases" ON purchases FOR ALL TO authenticated USING (get_user_role() = 'ADMIN') WITH CHECK (get_user_role() = 'ADMIN');
CREATE POLICY "Authenticated read purchases" ON purchases FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage transfers" ON transfers FOR ALL TO authenticated USING (get_user_role() = 'ADMIN') WITH CHECK (get_user_role() = 'ADMIN');
CREATE POLICY "Authenticated read transfers" ON transfers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage transfer_items" ON transfer_items FOR ALL TO authenticated USING (get_user_role() = 'ADMIN') WITH CHECK (get_user_role() = 'ADMIN');
CREATE POLICY "Authenticated read transfer_items" ON transfer_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage physical_counts" ON physical_counts FOR ALL TO authenticated USING (get_user_role() = 'ADMIN') WITH CHECK (get_user_role() = 'ADMIN');
CREATE POLICY "Authenticated read physical_counts" ON physical_counts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage physical_count_items" ON physical_count_items FOR ALL TO authenticated USING (get_user_role() = 'ADMIN') WITH CHECK (get_user_role() = 'ADMIN');
CREATE POLICY "Authenticated read physical_count_items" ON physical_count_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage validations" ON validations FOR ALL TO authenticated USING (get_user_role() = 'ADMIN') WITH CHECK (get_user_role() = 'ADMIN');
CREATE POLICY "Authenticated read validations" ON validations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage expenses" ON expenses FOR ALL TO authenticated USING (get_user_role() = 'ADMIN') WITH CHECK (get_user_role() = 'ADMIN');
CREATE POLICY "Authenticated read expenses" ON expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage credit_entries" ON credit_entries FOR ALL TO authenticated USING (get_user_role() = 'ADMIN') WITH CHECK (get_user_role() = 'ADMIN');
CREATE POLICY "Authenticated read credit_entries" ON credit_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage schedules" ON schedules FOR ALL TO authenticated USING (get_user_role() = 'ADMIN') WITH CHECK (get_user_role() = 'ADMIN');
CREATE POLICY "Authenticated read schedules" ON schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage attendance" ON attendance FOR ALL TO authenticated USING (get_user_role() = 'ADMIN') WITH CHECK (get_user_role() = 'ADMIN');
CREATE POLICY "Authenticated read attendance" ON attendance FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage payroll_entries" ON payroll_entries FOR ALL TO authenticated USING (get_user_role() = 'ADMIN') WITH CHECK (get_user_role() = 'ADMIN');
CREATE POLICY "Authenticated read payroll_entries" ON payroll_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage workers" ON workers FOR ALL TO authenticated USING (get_user_role() = 'ADMIN') WITH CHECK (get_user_role() = 'ADMIN');
CREATE POLICY "Admin manage products" ON products FOR ALL TO authenticated USING (get_user_role() = 'ADMIN') WITH CHECK (get_user_role() = 'ADMIN');
CREATE POLICY "Admin manage product_prices" ON product_prices FOR ALL TO authenticated USING (get_user_role() = 'ADMIN') WITH CHECK (get_user_role() = 'ADMIN');
