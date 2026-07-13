// The five tools the agent uses to reason about the restaurant.
//
// Each tool is a thin, deterministic wrapper around the SQLite adapter
// plus a small piece of business math (cost roll-up, elasticity, etc.).
// No LLM logic here — the agent decides *when* to call these, but the
// numbers a tool returns are always reproducible.
//
// createTools({ adapter, anchorIso }) returns a ToolSet keyed by the
// exact names the LLM will use. Pass to generateText({ tools }).

import { tool } from "ai";
import { z } from "zod";
import type {
  Adapter,
  DishRow,
  EffectiveCostRow,
  RecipeRow,
  VariantRow,
} from "../adapters/sqlite.js";

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;

function daysToWindow(days: number, anchorIso: string): { startIso: string; endIso: string } {
  const end = new Date(anchorIso);
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

type CostIndex = Map<string, EffectiveCostRow>;

function indexCosts(rows: EffectiveCostRow[]): CostIndex {
  return new Map(rows.map((r) => [r.ingredient_id, r]));
}

/** Effective unit cost falls back to the ERP's reported cost when the
 *  ingredient has no purchases in the window. */
function effectiveUnitCost(line: RecipeRow, costs: CostIndex): number {
  const row = costs.get(line.ingredient_id);
  return row?.effective_cost_per_unit ?? line.reported_cost_per_unit;
}

function computeCostBreakdown(
  recipe: RecipeRow[],
  costs: CostIndex,
): {
  breakdown: {
    ingredient: string;
    quantity: number;
    unit: string;
    reported_cost_per_unit: number;
    effective_cost_per_unit: number;
    reported_line_cost: number;
    effective_line_cost: number;
  }[];
  reportedCostTotal: number;
  effectiveCostTotal: number;
} {
  const breakdown = recipe.map((line) => {
    const reportedUnit = line.reported_cost_per_unit;
    const effectiveUnit = effectiveUnitCost(line, costs);
    return {
      ingredient: line.ingredient_name,
      quantity: line.quantity_used,
      unit: line.unit,
      reported_cost_per_unit: round2(reportedUnit),
      effective_cost_per_unit: round2(effectiveUnit),
      reported_line_cost: round2(line.quantity_used * reportedUnit),
      effective_line_cost: round2(line.quantity_used * effectiveUnit),
    };
  });
  const reportedCostTotal = round2(breakdown.reduce((s, b) => s + b.reported_line_cost, 0));
  const effectiveCostTotal = round2(breakdown.reduce((s, b) => s + b.effective_line_cost, 0));
  return { breakdown, reportedCostTotal, effectiveCostTotal };
}

function resolveDishAndVariant(
  adapter: Adapter,
  dishName: string,
  variantName: string | undefined,
): { dish: DishRow; variant: VariantRow | null; price: number } | { error: string } {
  const dish = adapter.findDishByName(dishName);
  if (!dish) return { error: `No dish found matching '${dishName}'.` };
  if (!variantName) return { dish, variant: null, price: dish.price };
  const variants = adapter.variantsFor(dish.item_id);
  const v = variants.find((x) => x.name.toLowerCase() === variantName.toLowerCase());
  if (!v) {
    const available = variants.map((x) => x.name).join(", ") || "(none)";
    return {
      error: `Variant '${variantName}' not found for '${dish.name}'. Available: ${available}.`,
    };
  }
  return { dish, variant: v, price: dish.price + v.price_delta };
}

// ────────────────────────────────────────────────────────────
// Factory
// ────────────────────────────────────────────────────────────

export type ToolContext = {
  adapter: Adapter;
  anchorIso: string;
};

const COST_WINDOW_DAYS = 90;

export function createTools(ctx: ToolContext) {
  const { adapter, anchorIso } = ctx;

  const list_dishes = tool({
    description:
      "List every active dish on the menu with its category, base price, whether it has size variants, and how many modifiers it exposes. Call this once at the start of a report to understand the menu shape.",
    inputSchema: z.object({}),
    execute: async () => adapter.listDishes(),
  });

  const margin_calc = tool({
    description:
      "For a single dish (optionally a specific size variant), compute the ingredient cost, the selling price, and the margin — both the 'reported' margin (using the ERP's cost_per_unit) and the 'effective' margin (using the qty-weighted average of the last 90 days of purchase unit_costs from stock_movements). A large gap between reported and effective means the ERP is running on stale cost data.",
    inputSchema: z.object({
      dish_name: z.string().describe("Free-text dish name. Case-insensitive substring match."),
      variant: z
        .string()
        .optional()
        .describe("Variant name like 'Grand' or 'Petit'. Omit to use the base recipe."),
    }),
    execute: async ({ dish_name, variant }) => {
      const resolved = resolveDishAndVariant(adapter, dish_name, variant);
      if ("error" in resolved) return resolved;
      const { dish, variant: v, price } = resolved;
      const recipe = adapter.recipeFor(dish.item_id, v?.variant_id ?? null);
      if (recipe.length === 0) {
        return { error: `No recipe defined for '${dish.name}'${v ? ` (${v.name})` : ""}.` };
      }
      const costs = indexCosts(adapter.effectiveCosts(COST_WINDOW_DAYS, anchorIso));
      const { breakdown, reportedCostTotal, effectiveCostTotal } = computeCostBreakdown(
        recipe,
        costs,
      );
      const reportedMargin = round2(price - reportedCostTotal);
      const effectiveMargin = round2(price - effectiveCostTotal);
      return {
        dish: dish.name,
        variant: v?.name ?? null,
        category: dish.category,
        price,
        reported_cost_total: reportedCostTotal,
        reported_margin: reportedMargin,
        reported_margin_pct: round1((reportedMargin / price) * 100),
        effective_cost_total: effectiveCostTotal,
        effective_margin: effectiveMargin,
        effective_margin_pct: round1((effectiveMargin / price) * 100),
        breakdown,
      };
    },
  });

  const reprice_sim = tool({
    description:
      "Simulate the revenue and margin impact of changing a dish's price. Uses the last N days of sales as the baseline, and a constant-elasticity demand model (default elasticity = -1.2, i.e. a 10% price hike reduces demand by 12%). Costs are computed with effective (purchase-derived) unit costs, so the projected margin reflects real supplier prices.",
    inputSchema: z.object({
      dish_name: z.string(),
      new_price: z.number().positive(),
      variant: z.string().optional(),
      elasticity: z
        .number()
        .max(0)
        .optional()
        .describe("Own-price elasticity of demand. Must be <= 0. Default -1.2."),
      window_days: z
        .number()
        .int()
        .positive()
        .max(90)
        .optional()
        .describe("Days of sales history used as baseline. Default 28."),
    }),
    execute: async ({ dish_name, new_price, variant, elasticity, window_days }) => {
      const resolved = resolveDishAndVariant(adapter, dish_name, variant);
      if ("error" in resolved) return resolved;
      const { dish, variant: v, price: currentPrice } = resolved;
      const days = window_days ?? 28;
      const eps = elasticity ?? -1.2;

      const recipe = adapter.recipeFor(dish.item_id, v?.variant_id ?? null);
      const costs = indexCosts(adapter.effectiveCosts(COST_WINDOW_DAYS, anchorIso));
      const { effectiveCostTotal: unitCost } = computeCostBreakdown(recipe, costs);

      const { startIso, endIso } = daysToWindow(days, anchorIso);
      const rows = adapter.salesForDish(dish.item_id, startIso, endIso);
      const filtered = v
        ? rows.filter((r) => r.variant_id === v.variant_id)
        : rows.filter((r) => r.variant_id === null);

      if (filtered.length === 0) {
        return {
          error: `No sales for '${dish.name}'${v ? ` (${v.name})` : ""} in the last ${days} days.`,
        };
      }
      const baselineUnits = filtered.reduce((s, r) => s + r.units_sold, 0);
      const baselineRevenue = filtered.reduce((s, r) => s + r.revenue, 0);
      const observedAvgPrice = baselineRevenue / baselineUnits;

      const priceChange = (new_price - observedAvgPrice) / observedAvgPrice;
      const demandChange = eps * priceChange;
      const projectedUnits = Math.max(0, baselineUnits * (1 + demandChange));
      const projectedRevenue = new_price * projectedUnits;
      const projectedMargin = (new_price - unitCost) * projectedUnits;
      const baselineMargin = (observedAvgPrice - unitCost) * baselineUnits;

      return {
        dish: dish.name,
        variant: v?.name ?? null,
        window_days: days,
        elasticity: eps,
        current_price: currentPrice,
        observed_avg_price: round2(observedAvgPrice),
        new_price,
        unit_cost: unitCost,
        baseline: {
          units: baselineUnits,
          revenue: round2(baselineRevenue),
          margin: round2(baselineMargin),
        },
        projected: {
          units: round1(projectedUnits),
          revenue: round2(projectedRevenue),
          margin: round2(projectedMargin),
        },
        delta: {
          units_pct: round1(demandChange * 100),
          revenue: round2(projectedRevenue - baselineRevenue),
          margin: round2(projectedMargin - baselineMargin),
        },
      };
    },
  });

  const trend_detector = tool({
    description:
      "Detect ingredients whose actual purchase cost (from stock_movements) has drifted from the ERP's reported cost_per_unit. Returns ingredients ranked by absolute drift, filtered to those with |delta_pct| >= min_delta_pct. Use this to catch silent supplier cost creep before it eats margin.",
    inputSchema: z.object({
      window_days: z
        .number()
        .int()
        .positive()
        .max(180)
        .default(90)
        .describe("Look back this many days of purchases."),
      min_delta_pct: z
        .number()
        .min(0)
        .default(3)
        .describe("Ignore drifts smaller than this percentage."),
    }),
    execute: async ({ window_days, min_delta_pct }) => {
      const rows = adapter.effectiveCosts(window_days, anchorIso);
      return rows
        .filter(
          (r) =>
            r.delta_pct !== null &&
            r.effective_cost_per_unit !== null &&
            Math.abs(r.delta_pct) >= min_delta_pct,
        )
        .map((r) => ({
          ingredient: r.ingredient_name,
          unit: r.unit,
          reported_cost_per_unit: r.reported_cost_per_unit,
          effective_cost_per_unit: round2(r.effective_cost_per_unit ?? 0),
          delta_pct: round1(r.delta_pct ?? 0),
          purchases_used: r.purchases_used,
          window_days: r.window_days,
        }));
    },
  });

  const dish_ranker = tool({
    description:
      "Rank dishes sold in the last N days by a chosen metric. Returns units sold, revenue, effective ingredient cost, and margin per dish/variant. Use 'margin_pct' to find hidden gems (high-margin, under-promoted). Use 'revenue' or 'volume' to find top earners / bestsellers. Use 'absolute_margin' to find where total gross profit actually comes from.",
    inputSchema: z.object({
      metric: z.enum(["margin_pct", "revenue", "volume", "absolute_margin"]),
      window_days: z.number().int().positive().max(90).default(7),
      limit: z.number().int().positive().max(50).default(10),
      order: z.enum(["desc", "asc"]).default("desc"),
    }),
    execute: async ({ metric, window_days, limit, order }) => {
      const { startIso, endIso } = daysToWindow(window_days, anchorIso);
      const sales = adapter.salesInWindow(startIso, endIso);
      const costs = indexCosts(adapter.effectiveCosts(COST_WINDOW_DAYS, anchorIso));

      const rows = sales.map((s) => {
        const recipe = adapter.recipeFor(s.item_id, s.variant_id);
        const { effectiveCostTotal: unitCost } = computeCostBreakdown(recipe, costs);
        const margin = round2((s.avg_unit_price - unitCost) * s.units_sold);
        const marginPct =
          s.avg_unit_price > 0
            ? round1(((s.avg_unit_price - unitCost) / s.avg_unit_price) * 100)
            : 0;
        return {
          dish: s.item_name,
          variant: s.variant_name,
          units_sold: s.units_sold,
          revenue: s.revenue,
          avg_unit_price: s.avg_unit_price,
          unit_cost: unitCost,
          margin,
          margin_pct: marginPct,
        };
      });

      const key: keyof (typeof rows)[number] =
        metric === "margin_pct"
          ? "margin_pct"
          : metric === "revenue"
            ? "revenue"
            : metric === "volume"
              ? "units_sold"
              : "margin";

      rows.sort((a, b) => {
        const av = Number(a[key]);
        const bv = Number(b[key]);
        return order === "desc" ? bv - av : av - bv;
      });

      return {
        metric,
        window_days,
        window: { start: startIso, end: endIso },
        rows: rows.slice(0, limit),
      };
    },
  });

  return {
    list_dishes,
    margin_calc,
    reprice_sim,
    trend_detector,
    dish_ranker,
  };
}
