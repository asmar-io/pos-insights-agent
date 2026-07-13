// Golden snapshot tests — pin every tool's output against the Chez Fatima
// fixture so drift in the seed, adapter math, or tool logic surfaces as a
// visible diff on the next run.
//
// Snapshots live under `tests/golden/*.json`. To regenerate them after an
// intentional change, delete the target file (or all of them) and re-run
// `npm test` — vitest will write the new baseline.

import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Adapter, createAdapter } from "../src/adapters/sqlite.js";
import { createTools } from "../src/tools/index.js";

const TENANT_ID = "00000000-0000-4000-8000-000000000001";
const STORE_ID = "00000000-0000-4000-8000-000000000002";
const DB_PATH = join(__dirname, "..", "examples", "chez-fatima", "data.db");
const ANCHOR_ISO = "2026-07-13T23:59:59.000Z";
const GOLDEN_DIR = join(__dirname, "golden");

type ExecutableTool<I, O> = { execute: (input: I) => Promise<O> };
function invoke<I, O>(t: unknown, input: I): Promise<O> {
  return (t as ExecutableTool<I, O>).execute(input);
}

function stringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

describe("golden snapshots (Chez Fatima)", () => {
  let db: Adapter;
  let tools: ReturnType<typeof createTools>;

  beforeAll(() => {
    db = createAdapter({ dbPath: DB_PATH, tenantId: TENANT_ID, storeId: STORE_ID });
    tools = createTools({ adapter: db, anchorIso: ANCHOR_ISO });
  });
  afterAll(() => {
    db.close();
  });

  it("list_dishes", async () => {
    const out = await invoke(tools.list_dishes, {});
    await expect(stringify(out)).toMatchFileSnapshot(join(GOLDEN_DIR, "list_dishes.json"));
  });

  it("margin_calc — tagine d'agneau Grand", async () => {
    const out = await invoke(tools.margin_calc, {
      dish_name: "tagine agneau",
      variant: "Grand",
    });
    await expect(stringify(out)).toMatchFileSnapshot(
      join(GOLDEN_DIR, "margin_calc_tagine_grand.json"),
    );
  });

  it("margin_calc — tagine d'agneau Petit", async () => {
    const out = await invoke(tools.margin_calc, {
      dish_name: "tagine agneau",
      variant: "Petit",
    });
    await expect(stringify(out)).toMatchFileSnapshot(
      join(GOLDEN_DIR, "margin_calc_tagine_petit.json"),
    );
  });

  it("margin_calc — baklava au miel", async () => {
    const out = await invoke(tools.margin_calc, { dish_name: "baklava au miel" });
    await expect(stringify(out)).toMatchFileSnapshot(join(GOLDEN_DIR, "margin_calc_baklava.json"));
  });

  it("reprice_sim — baklava +20%", async () => {
    const out = await invoke(tools.reprice_sim, {
      dish_name: "baklava au miel",
      new_price: 24,
      window_days: 90,
    });
    await expect(stringify(out)).toMatchFileSnapshot(join(GOLDEN_DIR, "reprice_sim_baklava.json"));
  });

  it("trend_detector — 90d, min 3%", async () => {
    const out = await invoke(tools.trend_detector, { window_days: 90, min_delta_pct: 3 });
    await expect(stringify(out)).toMatchFileSnapshot(join(GOLDEN_DIR, "trend_detector_90d.json"));
  });

  it("dish_ranker — revenue 7d top 10", async () => {
    const out = await invoke(tools.dish_ranker, {
      metric: "revenue",
      window_days: 7,
      limit: 10,
      order: "desc",
    });
    await expect(stringify(out)).toMatchFileSnapshot(
      join(GOLDEN_DIR, "dish_ranker_revenue_7d.json"),
    );
  });

  it("dish_ranker — margin_pct 90d top 10", async () => {
    const out = await invoke(tools.dish_ranker, {
      metric: "margin_pct",
      window_days: 90,
      limit: 10,
      order: "desc",
    });
    await expect(stringify(out)).toMatchFileSnapshot(
      join(GOLDEN_DIR, "dish_ranker_margin_90d.json"),
    );
  });

  it("dish_ranker — volume 90d bottom 5", async () => {
    const out = await invoke(tools.dish_ranker, {
      metric: "volume",
      window_days: 90,
      limit: 5,
      order: "asc",
    });
    await expect(stringify(out)).toMatchFileSnapshot(
      join(GOLDEN_DIR, "dish_ranker_volume_low_90d.json"),
    );
  });
});
