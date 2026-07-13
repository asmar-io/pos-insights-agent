# pos-insights-agent — project instructions

This file is loaded whenever Claude Code works in this repo. It captures the non-obvious decisions so future sessions don't relitigate them.

---

## What this project is

An open-source AI agent that reads restaurant POS data and produces a weekly CFO-level markdown brief on menu profitability.

**Positioning:** portfolio artifact — proves the author can ship AI agents. It is **separate** from the private Solution360 ERP SaaS, though the Chez Fatima fixture deliberately mirrors Solution360's Supabase/Postgres schema. Do not merge or cross-reference the two codebases.

## Non-negotiables

1. **Determinism.** `SEED = 42` in `examples/chez-fatima/seed.ts`. Every clone must produce the exact same `data.db`. The golden snapshots under `tests/golden/*.json` depend on it.
2. **Golden tests.** Any change to the seed, adapter math, or tool logic must be reflected as a diff in `tests/golden/`. If a snapshot changes, verify the new numbers are correct before regenerating — never blindly overwrite.
3. **Tools stay deterministic.** No LLM calls, no non-determinism inside `src/tools/`. The agent decides *when* to call a tool, but the number a tool returns must be reproducible from the fixture alone.
4. **Adapter is the SQL boundary.** Tools import types and functions from `src/adapters/sqlite.ts` — never raw SQL, never `better-sqlite3` directly. This keeps the Postgres adapter (deferred) a drop-in swap.
5. **`.env` is gitignored.** Only `.env.example` may be committed. Never log or echo API keys.

## Architecture

```
POS DB → Adapter → Tools → Agent → Markdown Brief
```

- `src/adapters/sqlite.ts` — `createAdapter({ dbPath, tenantId, storeId })`. Prepared statements scoped to a `(tenant_id, store_id)` pair. Row shapes exported as types.
- `src/tools/index.ts` — `createTools({ adapter, anchorIso })` returns a `ToolSet` with 5 tools: `list_dishes`, `margin_calc`, `reprice_sim`, `trend_detector`, `dish_ranker`. All use `tool({ description, inputSchema, execute })` from the `ai` package with zod v4 schemas.
- `src/agent/weekly_brief.ts` — `generateWeeklyBrief({ dbPath, tenantId, storeId })` runs `generateText()` with the tools and a CFO-style prompt. Tool loop capped at 12 steps via `stopWhen: stepCountIs(12)`.
- `src/cli.ts` — commander CLI: `pos-insights-agent report <db> [--tier free|pro] [--out path]`.
- `src/models/index.ts` — `getModel(tier?)` swaps between `gemini-flash-lite-latest` (free) and `claude-sonnet-4-6` (pro) via the `MODEL_TIER` env var. Add new tiers here, not inline in the agent.
- `src/config/env.ts` — zod-validated env with `resetEnvCache()` for tests. Empty strings are preprocessed to `undefined` so blank `.env` values don't fail validation.

## Pinned constants

Change these only with a clear reason and update the golden snapshots in the same commit:

| Constant | Value | Where |
|---|---|---|
| Cost lookback window | 90 days | `src/tools/index.ts` `COST_WINDOW_DAYS` |
| Default reprice elasticity | -1.2 | `src/tools/index.ts` `reprice_sim` |
| Default reprice window | 28 days | `src/tools/index.ts` `reprice_sim` |
| Default ranker window | 7 days | `src/tools/index.ts` `dish_ranker` |
| Agent max steps | 12 | `src/agent/weekly_brief.ts` |
| Seed | 42 | `examples/chez-fatima/seed.ts` |
| Fixture end date | 2026-07-13 | `examples/chez-fatima/seed.ts` |

## Chez Fatima — planted problems

The fixture is not neutral; it plants four discoverable issues. Any tool refactor must keep these detectable:

1. **Over-portioned "Grand" tagine** — 0.8 kg lamb vs 0.25 kg for "Petit" (3.2× meat for 45% higher price).
2. **Baklava hidden gem** — ~88% effective margin, ~3 units/week.
3. **Saturday-night brochette stockout** — 5 Saturdays with zero post-8pm brochette sales.
4. **Silent supplier creep** — lamb `stock_movements.unit_cost` ramps 85 → 100 MAD/kg over 90 days while `ingredients.cost_per_unit` still reports 85. Effective avg ≈ 92.5, delta ≈ 8.8%.

## Style & conventions

- **TypeScript ESM strict** + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`. All local imports end in `.js` (per ESM rules).
- **Biome 2.5** for lint + format. Run `npm run lint:fix` before committing.
- **Zod v4** for schemas. Use `.preprocess()` to normalize inputs at the boundary, not inside business logic.
- **Comments:** short "why" only. No what-comments. See existing files for tone — headers explain a module's purpose in 3–6 lines, then the code speaks for itself.
- **No barrel files.** Import from the concrete module (`src/adapters/sqlite.js`), not `src/adapters/index.js`.

## Development

```bash
npm run seed                                       # regenerate Chez Fatima
npm run report examples/chez-fatima/data.db        # end-to-end demo
npm run hello                                      # provider smoke test
npm test                                           # 38 tests including golden
npm run typecheck && npm run lint                  # must pass before commit
```

**Before declaring any task done:** run typecheck + lint + tests. This author is known to rush past testing — the golden suite is the safety net.

## Roadmap (in priority order)

1. **Postgres adapter** — same `Adapter` interface, backed by `pg`. Targets the Solution360 schema. Should be a driver swap, not a rewrite.
2. **Web demo** — Hono server that streams the tool-call sequence and renders the brief. `hono` is already a dependency for this.
3. **Slack / email delivery** — schedule the brief weekly, post it to a webhook.

Do **not** start any of these without a fresh conversation checkpoint from the user — they're each big enough to be their own step.
