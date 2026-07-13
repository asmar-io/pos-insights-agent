# Chez Fatima — synthetic demo restaurant

A 90-day POS history for a fictional Marrakech Moroccan restaurant.
Ships as an SQLite database so the agent can be tried without a Postgres
setup. Everything here is deterministic — seeded from `mulberry32(42)`
so `npm run seed` produces a byte-identical `data.db` every time.

## Files

| File          | Purpose                                                                 |
|---------------|-------------------------------------------------------------------------|
| `schema.sql`  | SQLite subset of the Solution360 schema — same tables, same columns.    |
| `catalog.ts`  | 7 categories, 31 ingredients, 24 dishes, variants, modifiers, recipes.  |
| `seed.ts`     | Builds `data.db` from `schema.sql` + `catalog.ts` and simulates 90 days.|
| `data.db`     | Generated. Not committed. Regenerate with `npm run seed`.               |

## Schema alignment with Solution360

The production adapter (Step 6) will swap `better-sqlite3` for `pg` and
point at Supabase. The table names, column names, and CHECK constraints
in `schema.sql` mirror the production schema exactly, so the agent's
tool queries need no rewriting to move between the two. Only the type
mapping differs:

| Postgres        | SQLite                        |
|-----------------|-------------------------------|
| `uuid`          | `TEXT` (36-char v4 string)    |
| `numeric(x, y)` | `REAL`                        |
| `timestamptz`   | `TEXT` (ISO 8601 UTC)         |
| `jsonb`         | `TEXT` (JSON string)          |
| `text[]`        | `TEXT` (JSON array string)    |

## The four planted problems

The dataset is intentionally engineered so a real margin agent will
find and rank these — they serve as the golden-test acceptance criteria.

1. **Grand Tagine d'agneau aux pruneaux is over-portioned.**
   Petit uses 250g of lamb, Grand uses 800g (3.2x), but the Grand
   variant only adds +25 MAD to the price. Combined with problem #4,
   the Grand margin collapses to single digits.

2. **Baklava au miel is a hidden gem.**
   Sold at 20 MAD with about 5.8 MAD of ingredient cost (~71% margin),
   but with a popularity weight of 1 it only moves 3–4 units per week.
   High-margin under-promoted item.

3. **Brochettes de poulet stock out on weekend nights.**
   On 5 randomly-picked Saturdays in the last 12, no orders for
   `brochettes_poulet` are recorded after 20:00 — simulating a
   recurring evening-service stockout the owner hasn't noticed.

4. **Silent supplier cost creep on agneau.**
   `ingredients.cost_per_unit` for agneau is 85 MAD/kg (the ERP's
   stale reported value). But `stock_movements` records 13 weekly
   purchases at unit_cost ramping linearly from 85 → 100 MAD/kg
   over the window. The running average is materially higher than
   the ERP thinks — any margin computed off `ingredients.cost_per_unit`
   is optimistic.

## Constants

| Name                | Value                                                     |
|---------------------|-----------------------------------------------------------|
| Tenant ID           | `00000000-0000-4000-8000-000000000001`                    |
| Store ID            | `00000000-0000-4000-8000-000000000002`                    |
| Date range          | 90 days ending **2026-07-13** (Monday, UTC)               |
| RNG seed            | `42` (mulberry32)                                         |
| Daily order volume  | ~30 orders × day-of-week weight (weekends ~1.5×)          |
| Hour distribution   | Lunch peak 12–14, tea 15–18, dinner peak 19–22            |
