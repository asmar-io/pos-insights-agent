// Integration tests — run against the seeded Chez Fatima fixture and
// assert that the adapter surfaces the planted problems correctly.
// These are also what pins down the fixture's expected shape for the
// golden tests (Step 5).

import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Adapter, createAdapter } from "../src/adapters/sqlite.js";

const TENANT_ID = "00000000-0000-4000-8000-000000000001";
const STORE_ID = "00000000-0000-4000-8000-000000000002";
const DB_PATH = join(__dirname, "..", "examples", "chez-fatima", "data.db");
const ANCHOR_ISO = "2026-07-13T23:59:59.000Z";

describe("createAdapter (Chez Fatima)", () => {
  let db: Adapter;

  beforeAll(() => {
    db = createAdapter({ dbPath: DB_PATH, tenantId: TENANT_ID, storeId: STORE_ID });
  });
  afterAll(() => {
    db.close();
  });

  it("finds the latest order date at the end of the seeded window", () => {
    const max = db.maxOrderDate();
    expect(max).not.toBeNull();
    expect(max?.slice(0, 10)).toBe("2026-07-13");
  });

  it("lists the full menu with variant + modifier counts", () => {
    const dishes = db.listDishes();
    expect(dishes).toHaveLength(24);
    const tagineAgneau = dishes.find((d) => d.name.startsWith("Tagine d'agneau"));
    expect(tagineAgneau?.variant_count).toBe(2);
    const teaMint = dishes.find((d) => d.name === "Thé à la menthe");
    expect(teaMint?.modifier_count).toBe(2);
  });

  it("finds dishes case-insensitively with partial names", () => {
    const dish = db.findDishByName("tagine agneau");
    expect(dish?.name).toBe("Tagine d'agneau aux pruneaux");
    expect(dish?.category).toBe("Tagines");
  });

  it("returns base + variant recipes for tagine d'agneau", () => {
    const dish = db.findDishByName("tagine agneau");
    if (!dish) throw new Error("tagine agneau missing from fixture");
    const variants = db.variantsFor(dish.item_id);
    expect(variants.map((v) => v.name).sort()).toEqual(["Grand", "Petit"]);

    const grand = variants.find((v) => v.name === "Grand");
    const petit = variants.find((v) => v.name === "Petit");
    if (!grand || !petit) throw new Error("variants missing");

    const grandRecipe = db.recipeFor(dish.item_id, grand.variant_id);
    const petitRecipe = db.recipeFor(dish.item_id, petit.variant_id);
    const grandLamb = grandRecipe.find((r) => r.ingredient_name === "Agneau");
    const petitLamb = petitRecipe.find((r) => r.ingredient_name === "Agneau");
    expect(petitLamb?.quantity_used).toBeCloseTo(0.25, 5);
    expect(grandLamb?.quantity_used).toBeCloseTo(0.8, 5);
    expect(petitLamb?.reported_cost_per_unit).toBe(85);
  });

  it("detects agneau supplier cost creep in the last 90 days", () => {
    const costs = db.effectiveCosts(90, ANCHOR_ISO);
    const agneau = costs.find((c) => c.ingredient_name === "Agneau");
    expect(agneau?.reported_cost_per_unit).toBe(85);
    // 13 purchases ramping 85 → 100, weighted avg is (85+86.25+...+100)/13 = 92.5
    expect(agneau?.effective_cost_per_unit).toBeCloseTo(92.5, 1);
    expect(agneau?.purchases_used).toBe(13);
    // delta_pct = (92.5 - 85) / 85 * 100 ≈ 8.8%
    expect(agneau?.delta_pct).toBeCloseTo(8.82, 1);
  });

  it("returns per-ingredient window_days on every row (fallback aware)", () => {
    const costs = db.effectiveCosts(30, ANCHOR_ISO);
    expect(costs.every((c) => c.window_days === 30)).toBe(true);
    // Ingredients with no purchases in-window should surface null effective cost
    const untouched = costs.filter((c) => c.purchases_used === 0);
    expect(untouched.length).toBeGreaterThan(0);
    expect(untouched.every((c) => c.effective_cost_per_unit === null)).toBe(true);
  });

  it("aggregates sales in a date window ordered by revenue", () => {
    const sales = db.salesInWindow("2026-07-07T00:00:00.000Z", "2026-07-14T00:00:00.000Z");
    expect(sales.length).toBeGreaterThan(0);
    // Rows should be sorted revenue DESC
    for (let i = 1; i < sales.length; i++) {
      const prev = sales[i - 1];
      const curr = sales[i];
      if (prev && curr) expect(prev.revenue).toBeGreaterThanOrEqual(curr.revenue);
    }
  });

  it("finds baklava_miel as a low-volume, high-margin candidate", () => {
    const dish = db.findDishByName("baklava au miel");
    if (!dish) throw new Error("baklava missing from fixture");
    const sales = db.salesForDish(
      dish.item_id,
      "2026-04-15T00:00:00.000Z",
      "2026-07-14T00:00:00.000Z",
    );
    const totalUnits = sales.reduce((s, r) => s + r.units_sold, 0);
    // 90 days at ~3.3 units/week ≈ 42
    expect(totalUnits).toBeGreaterThan(30);
    expect(totalUnits).toBeLessThan(70);
    expect(dish.price).toBe(20);
  });
});
