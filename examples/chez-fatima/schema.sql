-- ============================================================
--  Chez Fatima — SQLite schema
--
--  This is a SQLite subset of the Solution360 (Postgres/Supabase)
--  schema, containing ONLY the tables the margin agent reads:
--
--    tenants, stores,
--    menu_categories, menu_items, item_variants, item_modifiers,
--    ingredients, recipes,
--    stock_movements,
--    orders, order_items
--
--  Type mapping vs Postgres:
--    uuid          -> TEXT  (36-char UUID v4-style string)
--    numeric(x,y)  -> REAL
--    timestamptz   -> TEXT  (ISO 8601 UTC)
--    jsonb         -> TEXT  (JSON string)
--    text[]        -> TEXT  (JSON array string)
--
--  The production Solution360 adapter targets the same table
--  and column names on Postgres, so agent tools require no
--  schema translation when swapping the SQLite adapter out.
-- ============================================================

PRAGMA foreign_keys = ON;

-- tenants
CREATE TABLE IF NOT EXISTS tenants (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- stores
CREATE TABLE IF NOT EXISTS stores (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  city       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

-- menu_categories
CREATE TABLE IF NOT EXISTS menu_categories (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#10B981',
  position   INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

-- menu_items
CREATE TABLE IF NOT EXISTS menu_items (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id)         ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  price       REAL NOT NULL DEFAULT 0,
  position    INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);

-- item_variants (Petit / Grand, price_delta added to menu_items.price)
CREATE TABLE IF NOT EXISTS item_variants (
  id          TEXT PRIMARY KEY,
  item_id     TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  price_delta REAL NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- item_modifiers (optional / required extras; modifiers have no recipe -> ~100% margin)
CREATE TABLE IF NOT EXISTS item_modifiers (
  id          TEXT PRIMARY KEY,
  item_id     TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  price_delta REAL NOT NULL DEFAULT 0,
  is_required INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  group_name  TEXT
);

-- ingredients (tenant-wide catalog)
CREATE TABLE IF NOT EXISTS ingredients (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  unit          TEXT NOT NULL DEFAULT 'unité'
                  CHECK (unit IN ('kg','g','L','cl','ml','pièce','unité')),
  cost_per_unit REAL NOT NULL DEFAULT 0,
  category      TEXT NOT NULL DEFAULT 'autre'
                  CHECK (category IN ('viande','légumes','boissons','épices','emballage','autre')),
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  UNIQUE (tenant_id, name)
);

-- recipes (item x ingredient x quantity; variant_id NULL = base recipe)
CREATE TABLE IF NOT EXISTS recipes (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id)     ON DELETE CASCADE,
  item_id       TEXT NOT NULL REFERENCES menu_items(id)  ON DELETE CASCADE,
  variant_id    TEXT REFERENCES item_variants(id)        ON DELETE CASCADE,
  ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity_used REAL NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS recipes_base_unique
  ON recipes (item_id, ingredient_id) WHERE variant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS recipes_variant_unique
  ON recipes (item_id, variant_id, ingredient_id) WHERE variant_id IS NOT NULL;

-- stock_movements (append-only; only 'purchase' rows carry unit_cost history)
CREATE TABLE IF NOT EXISTS stock_movements (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id)     ON DELETE CASCADE,
  store_id       TEXT NOT NULL REFERENCES stores(id)      ON DELETE CASCADE,
  ingredient_id  TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  movement_type  TEXT NOT NULL CHECK (movement_type IN ('purchase','adjustment','waste')),
  quantity_delta REAL NOT NULL,
  unit_cost      REAL,
  note           TEXT,
  created_at     TEXT NOT NULL
);

-- orders
CREATE TABLE IF NOT EXISTS orders (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_id       TEXT NOT NULL REFERENCES stores(id)  ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'completed'
                   CHECK (status IN ('pending','open','completed','refunded')),
  payment_method TEXT CHECK (payment_method IS NULL
                             OR payment_method IN ('cash','tpe','mixte','card','mobile')),
  order_type     TEXT CHECK (order_type IS NULL
                             OR order_type IN ('sur_place','emporter','livraison','plateforme')),
  subtotal       REAL NOT NULL DEFAULT 0,
  tax            REAL NOT NULL DEFAULT 0,
  discount       REAL NOT NULL DEFAULT 0,
  total          REAL NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL
);

-- order_items (snapshotted item data for historical accuracy)
CREATE TABLE IF NOT EXISTS order_items (
  id             TEXT PRIMARY KEY,
  order_id       TEXT NOT NULL REFERENCES orders(id)      ON DELETE CASCADE,
  item_id        TEXT REFERENCES menu_items(id)           ON DELETE SET NULL,
  variant_id     TEXT REFERENCES item_variants(id)        ON DELETE SET NULL,
  item_name      TEXT NOT NULL,
  variant_name   TEXT,
  modifier_names TEXT NOT NULL DEFAULT '[]',
  quantity       INTEGER NOT NULL DEFAULT 1,
  unit_price     REAL NOT NULL,
  line_total     REAL NOT NULL,
  discount       REAL NOT NULL DEFAULT 0
);

-- indexes
CREATE INDEX IF NOT EXISTS idx_menu_items_tenant       ON menu_items(tenant_id, category_id, position);
CREATE INDEX IF NOT EXISTS idx_orders_store_date       ON orders(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order       ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_ing_date ON stock_movements(ingredient_id, created_at DESC);
