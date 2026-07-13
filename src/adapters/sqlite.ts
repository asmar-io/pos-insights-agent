// SQLite adapter for the Chez Fatima fixture.
//
// Wraps a `better-sqlite3` connection with prepared statements scoped
// to a single (tenant_id, store_id). Every query the agent's tools
// need to answer margin/trend/ranking questions is exposed here so
// the tools never see raw SQL — that keeps them testable in isolation
// and makes the eventual Postgres adapter (Step 6) a drop-in swap.

import type { Database as DatabaseType } from "better-sqlite3";
import Database from "better-sqlite3";

// ────────────────────────────────────────────────────────────
// Row shapes returned by the adapter (already joined + typed)
// ────────────────────────────────────────────────────────────

export type DishRow = {
  item_id: string;
  name: string;
  description: string | null;
  category: string;
  price: number;
  variant_count: number;
  modifier_count: number;
};

export type VariantRow = {
  variant_id: string;
  item_id: string;
  name: string;
  price_delta: number;
};

export type RecipeRow = {
  item_id: string;
  variant_id: string | null;
  ingredient_id: string;
  ingredient_name: string;
  unit: string;
  quantity_used: number;
  reported_cost_per_unit: number;
};

export type EffectiveCostRow = {
  ingredient_id: string;
  ingredient_name: string;
  unit: string;
  reported_cost_per_unit: number;
  effective_cost_per_unit: number | null;
  delta_pct: number | null;
  purchases_used: number;
  window_days: number;
};

export type SalesRow = {
  item_id: string;
  variant_id: string | null;
  item_name: string;
  variant_name: string | null;
  units_sold: number;
  revenue: number;
  avg_unit_price: number;
};

// ────────────────────────────────────────────────────────────
// Adapter
// ────────────────────────────────────────────────────────────

export type AdapterOptions = {
  dbPath: string;
  tenantId: string;
  storeId: string;
};

export type Adapter = {
  close(): void;
  maxOrderDate(): string | null;
  listDishes(): DishRow[];
  findDishByName(name: string): DishRow | null;
  variantsFor(itemId: string): VariantRow[];
  recipeFor(itemId: string, variantId: string | null): RecipeRow[];
  effectiveCosts(windowDays: number, anchorIso: string): EffectiveCostRow[];
  salesInWindow(startIso: string, endIso: string): SalesRow[];
  salesForDish(itemId: string, startIso: string, endIso: string): SalesRow[];
};

export function createAdapter(opts: AdapterOptions): Adapter {
  const db = new Database(opts.dbPath, { readonly: true });
  db.pragma("foreign_keys = ON");
  const { tenantId, storeId } = opts;

  const stmts = prepareStatements(db);

  return {
    close(): void {
      db.close();
    },

    maxOrderDate(): string | null {
      const row = stmts.maxOrderDate.get(tenantId, storeId) as
        | { max_created_at: string | null }
        | undefined;
      return row?.max_created_at ?? null;
    },

    listDishes(): DishRow[] {
      return stmts.listDishes.all(tenantId) as DishRow[];
    },

    findDishByName(name: string): DishRow | null {
      const tokens = name.toLowerCase().trim().split(/\s+/).filter(Boolean);
      if (tokens.length === 0) return null;
      const pattern = `%${tokens.join("%")}%`;
      const row = stmts.findDishByName.get(tenantId, pattern) as DishRow | undefined;
      return row ?? null;
    },

    variantsFor(itemId: string): VariantRow[] {
      return stmts.variantsFor.all(itemId) as VariantRow[];
    },

    recipeFor(itemId: string, variantId: string | null): RecipeRow[] {
      if (variantId === null) {
        return stmts.recipeBase.all(tenantId, itemId) as RecipeRow[];
      }
      return stmts.recipeVariant.all(tenantId, itemId, variantId) as RecipeRow[];
    },

    effectiveCosts(windowDays: number, anchorIso: string): EffectiveCostRow[] {
      const rows = stmts.effectiveCosts.all({
        tenant: tenantId,
        store: storeId,
        days: windowDays,
        anchor: anchorIso,
      }) as Omit<EffectiveCostRow, "window_days">[];
      return rows.map((r) => ({ ...r, window_days: windowDays }));
    },

    salesInWindow(startIso: string, endIso: string): SalesRow[] {
      return stmts.salesWindow.all(tenantId, storeId, startIso, endIso) as SalesRow[];
    },

    salesForDish(itemId: string, startIso: string, endIso: string): SalesRow[] {
      return stmts.salesForDish.all(tenantId, storeId, itemId, startIso, endIso) as SalesRow[];
    },
  };
}

// ────────────────────────────────────────────────────────────
// Prepared statements
// ────────────────────────────────────────────────────────────

function prepareStatements(db: DatabaseType) {
  return {
    maxOrderDate: db.prepare(`
      SELECT MAX(created_at) AS max_created_at
      FROM orders
      WHERE tenant_id = ? AND store_id = ? AND status = 'completed'
    `),

    listDishes: db.prepare(`
      SELECT
        mi.id            AS item_id,
        mi.name          AS name,
        mi.description   AS description,
        mc.name          AS category,
        mi.price         AS price,
        (SELECT COUNT(*) FROM item_variants  v WHERE v.item_id = mi.id) AS variant_count,
        (SELECT COUNT(*) FROM item_modifiers m WHERE m.item_id = mi.id) AS modifier_count
      FROM menu_items mi
      JOIN menu_categories mc ON mc.id = mi.category_id
      WHERE mi.tenant_id = ? AND mi.active = 1
      ORDER BY mc.position, mi.position
    `),

    findDishByName: db.prepare(`
      SELECT
        mi.id            AS item_id,
        mi.name          AS name,
        mi.description   AS description,
        mc.name          AS category,
        mi.price         AS price,
        (SELECT COUNT(*) FROM item_variants  v WHERE v.item_id = mi.id) AS variant_count,
        (SELECT COUNT(*) FROM item_modifiers m WHERE m.item_id = mi.id) AS modifier_count
      FROM menu_items mi
      JOIN menu_categories mc ON mc.id = mi.category_id
      WHERE mi.tenant_id = ?
        AND mi.active = 1
        AND LOWER(mi.name) LIKE ?
      ORDER BY LENGTH(mi.name) ASC
      LIMIT 1
    `),

    variantsFor: db.prepare(`
      SELECT id AS variant_id, item_id, name, price_delta
      FROM item_variants
      WHERE item_id = ?
      ORDER BY sort_order
    `),

    recipeBase: db.prepare(`
      SELECT
        r.item_id                        AS item_id,
        r.variant_id                     AS variant_id,
        r.ingredient_id                  AS ingredient_id,
        i.name                           AS ingredient_name,
        i.unit                           AS unit,
        r.quantity_used                  AS quantity_used,
        i.cost_per_unit                  AS reported_cost_per_unit
      FROM recipes r
      JOIN ingredients i ON i.id = r.ingredient_id
      WHERE r.tenant_id = ? AND r.item_id = ? AND r.variant_id IS NULL
    `),

    recipeVariant: db.prepare(`
      SELECT
        r.item_id                        AS item_id,
        r.variant_id                     AS variant_id,
        r.ingredient_id                  AS ingredient_id,
        i.name                           AS ingredient_name,
        i.unit                           AS unit,
        r.quantity_used                  AS quantity_used,
        i.cost_per_unit                  AS reported_cost_per_unit
      FROM recipes r
      JOIN ingredients i ON i.id = r.ingredient_id
      WHERE r.tenant_id = ? AND r.item_id = ? AND r.variant_id = ?
    `),

    // Effective cost = qty-weighted avg unit_cost across purchase movements
    // in the window anchored to @anchor. Falls back to NULL when the ingredient
    // has no purchases in-window (agent then reads the reported cost).
    effectiveCosts: db.prepare(`
      WITH window_purchases AS (
        SELECT sm.ingredient_id,
               SUM(sm.quantity_delta * sm.unit_cost) AS spend,
               SUM(sm.quantity_delta)                AS qty,
               COUNT(*)                              AS n
        FROM stock_movements sm
        WHERE sm.tenant_id = @tenant
          AND sm.store_id  = @store
          AND sm.movement_type = 'purchase'
          AND sm.unit_cost IS NOT NULL
          AND julianday(@anchor) - julianday(sm.created_at) <= @days
        GROUP BY sm.ingredient_id
      )
      SELECT
        i.id                                     AS ingredient_id,
        i.name                                   AS ingredient_name,
        i.unit                                   AS unit,
        i.cost_per_unit                          AS reported_cost_per_unit,
        CASE WHEN wp.qty > 0 THEN wp.spend / wp.qty END AS effective_cost_per_unit,
        CASE
          WHEN wp.qty > 0 AND i.cost_per_unit > 0
          THEN ((wp.spend / wp.qty) - i.cost_per_unit) * 100.0 / i.cost_per_unit
        END                                      AS delta_pct,
        COALESCE(wp.n, 0)                        AS purchases_used
      FROM ingredients i
      LEFT JOIN window_purchases wp ON wp.ingredient_id = i.id
      WHERE i.tenant_id = @tenant
      ORDER BY ABS(COALESCE(delta_pct, 0)) DESC, i.name
    `),

    salesWindow: db.prepare(`
      SELECT
        oi.item_id                        AS item_id,
        oi.variant_id                     AS variant_id,
        oi.item_name                      AS item_name,
        oi.variant_name                   AS variant_name,
        SUM(oi.quantity)                  AS units_sold,
        ROUND(SUM(oi.line_total), 2)      AS revenue,
        ROUND(SUM(oi.line_total) / NULLIF(SUM(oi.quantity), 0), 2) AS avg_unit_price
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.tenant_id = ?
        AND o.store_id  = ?
        AND o.status = 'completed'
        AND o.created_at >= ?
        AND o.created_at <  ?
      GROUP BY oi.item_id, oi.variant_id, oi.item_name, oi.variant_name
      ORDER BY revenue DESC
    `),

    salesForDish: db.prepare(`
      SELECT
        oi.item_id                        AS item_id,
        oi.variant_id                     AS variant_id,
        oi.item_name                      AS item_name,
        oi.variant_name                   AS variant_name,
        SUM(oi.quantity)                  AS units_sold,
        ROUND(SUM(oi.line_total), 2)      AS revenue,
        ROUND(SUM(oi.line_total) / NULLIF(SUM(oi.quantity), 0), 2) AS avg_unit_price
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.tenant_id = ?
        AND o.store_id  = ?
        AND o.status = 'completed'
        AND oi.item_id = ?
        AND o.created_at >= ?
        AND o.created_at <  ?
      GROUP BY oi.item_id, oi.variant_id, oi.item_name, oi.variant_name
    `),
  };
}
