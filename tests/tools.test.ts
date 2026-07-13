// Unit tests for the five agent tools against the Chez Fatima fixture.
// Each tool's `execute` is invoked directly to keep the LLM out of the loop.
// The assertions pin down the planted problems: over-portioned Grand tagine,
// hidden-gem baklava, agneau supplier cost creep, and revenue-driving rankings.

import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Adapter, createAdapter } from "../src/adapters/sqlite.js";
import { createTools } from "../src/tools/index.js";

const TENANT_ID = "00000000-0000-4000-8000-000000000001";
const STORE_ID = "00000000-0000-4000-8000-000000000002";
const DB_PATH = join(__dirname, "..", "examples", "chez-fatima", "data.db");
const ANCHOR_ISO = "2026-07-13T23:59:59.000Z";

// Minimal shape assumption used to invoke tools directly in tests.
// The AI SDK's `tool()` returns an object whose `execute` we can call.
type ExecutableTool<I, O> = { execute: (input: I) => Promise<O> };

function invoke<I, O>(t: unknown, input: I): Promise<O> {
  const tool = t as ExecutableTool<I, O>;
  return tool.execute(input);
}

describe("tools (Chez Fatima)", () => {
  let db: Adapter;
  let tools: ReturnType<typeof createTools>;

  beforeAll(() => {
    db = createAdapter({ dbPath: DB_PATH, tenantId: TENANT_ID, storeId: STORE_ID });
    tools = createTools({ adapter: db, anchorIso: ANCHOR_ISO });
  });
  afterAll(() => {
    db.close();
  });

  // ── list_dishes ─────────────────────────────────────────────
  it("list_dishes returns the full menu", async () => {
    const rows = await invoke<Record<string, never>, Array<{ name: string }>>(
      tools.list_dishes,
      {},
    );
    expect(rows).toHaveLength(24);
    expect(rows.some((r) => r.name === "Thé à la menthe")).toBe(true);
  });

  // ── margin_calc ─────────────────────────────────────────────
  it("margin_calc surfaces the Grand tagine cost blowout vs Petit", async () => {
    const grand = await invoke<
      { dish_name: string; variant: string },
      {
        effective_cost_total: number;
        effective_margin: number;
        effective_margin_pct: number;
        price: number;
      }
    >(tools.margin_calc, { dish_name: "tagine agneau", variant: "Grand" });

    const petit = await invoke<
      { dish_name: string; variant: string },
      {
        effective_cost_total: number;
        effective_margin: number;
        effective_margin_pct: number;
        price: number;
      }
    >(tools.margin_calc, { dish_name: "tagine agneau", variant: "Petit" });

    // Grand uses 0.8kg lamb vs Petit's 0.25kg → Grand's cost should dwarf Petit's.
    expect(grand.effective_cost_total).toBeGreaterThan(petit.effective_cost_total * 2);
    // And Petit should still be more profitable per unit as a %.
    expect(petit.effective_margin_pct).toBeGreaterThan(grand.effective_margin_pct);
  });

  it("margin_calc reports a positive gap between reported and effective cost for agneau dishes", async () => {
    const result = await invoke<
      { dish_name: string; variant: string },
      { reported_cost_total: number; effective_cost_total: number }
    >(tools.margin_calc, { dish_name: "tagine agneau", variant: "Grand" });
    // Effective > reported because agneau's real purchase price crept 85 → ~92.5.
    expect(result.effective_cost_total).toBeGreaterThan(result.reported_cost_total);
  });

  it("margin_calc returns an error when the dish cannot be resolved", async () => {
    const result = await invoke<{ dish_name: string }, { error?: string }>(tools.margin_calc, {
      dish_name: "not-a-real-dish-12345",
    });
    expect(result.error).toMatch(/No dish found/);
  });

  // ── reprice_sim ─────────────────────────────────────────────
  it("reprice_sim projects a demand drop when raising baklava's price", async () => {
    const result = await invoke<
      { dish_name: string; new_price: number; window_days: number },
      {
        baseline: { units: number; revenue: number };
        projected: { units: number; revenue: number };
        delta: { units_pct: number };
      }
    >(tools.reprice_sim, { dish_name: "baklava au miel", new_price: 24, window_days: 90 });

    expect(result.baseline.units).toBeGreaterThan(0);
    expect(result.delta.units_pct).toBeLessThan(0); // higher price → lower demand
    expect(result.projected.units).toBeLessThan(result.baseline.units);
  });

  it("reprice_sim honors the elasticity argument (more elastic → bigger units drop)", async () => {
    const soft = await invoke<
      { dish_name: string; new_price: number; window_days: number; elasticity: number },
      { delta: { units_pct: number } }
    >(tools.reprice_sim, {
      dish_name: "baklava au miel",
      new_price: 24,
      window_days: 90,
      elasticity: -0.5,
    });
    const hard = await invoke<
      { dish_name: string; new_price: number; window_days: number; elasticity: number },
      { delta: { units_pct: number } }
    >(tools.reprice_sim, {
      dish_name: "baklava au miel",
      new_price: 24,
      window_days: 90,
      elasticity: -2.0,
    });
    expect(hard.delta.units_pct).toBeLessThan(soft.delta.units_pct);
  });

  // ── trend_detector ──────────────────────────────────────────
  it("trend_detector flags agneau supplier cost creep at ~8.8%", async () => {
    const rows = await invoke<
      { window_days: number; min_delta_pct: number },
      Array<{ ingredient: string; delta_pct: number; purchases_used: number }>
    >(tools.trend_detector, { window_days: 90, min_delta_pct: 3 });

    const agneau = rows.find((r) => r.ingredient === "Agneau");
    expect(agneau).toBeDefined();
    expect(agneau?.delta_pct).toBeCloseTo(8.8, 0);
    expect(agneau?.purchases_used).toBe(13);
  });

  it("trend_detector filters ingredients below the min_delta_pct threshold", async () => {
    const rows = await invoke<
      { window_days: number; min_delta_pct: number },
      Array<{ delta_pct: number }>
    >(tools.trend_detector, { window_days: 90, min_delta_pct: 50 });
    // No ingredient in the fixture has drifted 50%+, so this should be empty.
    expect(rows).toHaveLength(0);
  });

  // ── dish_ranker ─────────────────────────────────────────────
  it("dish_ranker by revenue sorts descending and respects the limit", async () => {
    const result = await invoke<
      { metric: "revenue"; window_days: number; limit: number; order: "desc" },
      { rows: Array<{ dish: string; revenue: number }> }
    >(tools.dish_ranker, { metric: "revenue", window_days: 7, limit: 5, order: "desc" });

    expect(result.rows.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < result.rows.length; i++) {
      const prev = result.rows[i - 1];
      const curr = result.rows[i];
      if (prev && curr) expect(prev.revenue).toBeGreaterThanOrEqual(curr.revenue);
    }
  });

  it("dish_ranker by margin_pct puts high-margin items at the top", async () => {
    const result = await invoke<
      { metric: "margin_pct"; window_days: number; limit: number; order: "desc" },
      { rows: Array<{ dish: string; margin_pct: number }> }
    >(tools.dish_ranker, { metric: "margin_pct", window_days: 90, limit: 10, order: "desc" });

    expect(result.rows.length).toBeGreaterThan(0);
    for (let i = 1; i < result.rows.length; i++) {
      const prev = result.rows[i - 1];
      const curr = result.rows[i];
      if (prev && curr) expect(prev.margin_pct).toBeGreaterThanOrEqual(curr.margin_pct);
    }
  });

  it("dish_ranker by volume ascending finds the least-sold dishes", async () => {
    const result = await invoke<
      { metric: "volume"; window_days: number; limit: number; order: "asc" },
      { rows: Array<{ dish: string; units_sold: number }> }
    >(tools.dish_ranker, { metric: "volume", window_days: 90, limit: 3, order: "asc" });

    expect(result.rows.length).toBeGreaterThan(0);
    for (let i = 1; i < result.rows.length; i++) {
      const prev = result.rows[i - 1];
      const curr = result.rows[i];
      if (prev && curr) expect(prev.units_sold).toBeLessThanOrEqual(curr.units_sold);
    }
  });
});
