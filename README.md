# pos-insights-agent

> An AI agent that reads restaurant POS data and delivers weekly CFO-level insights on menu profitability.

Built with the [Vercel AI SDK](https://sdk.vercel.ai), targeting **Google Gemini** (free tier) or **Anthropic Claude** (pro tier) with a one-line model swap.

---

## What it does

Every week, the agent reads a store's POS database and produces a markdown brief that answers the questions a good owner *should* be asking but usually isn't:

- Which dishes are actually making money once you use **real** supplier costs, not the ERP's stale ones?
- Which high-margin items are hiding on the menu, under-promoted?
- Which ingredients have quietly crept up in cost since the last time recipes were priced?
- What happens to revenue if you raise the price of your bestseller by 10%?

## Sample output

From the demo restaurant `examples/chez-fatima` (a seeded Moroccan restaurant with 4 planted problems):

```
## Menu Profitability Brief

### 1. Top revenue drivers
1. Tagine d'agneau aux pruneaux (Grand): MAD 3,630
2. Tagine de poulet aux olives et citron confit: MAD 3,290
3. Brochettes de poulet: MAD 2,585
...

### 3. Supplier cost creep
* Agneau: The effective cost is MAD 98.13/kg, a 15.4% increase over the
  reported ERP cost of MAD 85.00/kg. This is directly impacting the
  profitability of all lamb-based dishes.

### 4. Deep-dive: one at-risk dish
The Tagine d'agneau aux pruneaux (Grand) is our most significant margin risk.
| Metric     | Reported  | Effective |
| Total Cost | MAD 88.60 | MAD 94.60 |
| Margin     | MAD 21.40 | MAD 15.40 |
| Margin %   | 19.5%     | 14.0%     |

### 5. Recommended actions
* Reprice Tagine d'agneau "Grand" to MAD 125...
* Renegotiate lamb procurement...
```

The full brief is checked in at [`examples/chez-fatima/brief.md`](./examples/chez-fatima/brief.md).

## Quickstart

```bash
git clone https://github.com/asmar-io/pos-insights-agent.git
cd pos-insights-agent
npm install
cp .env.example .env       # then edit .env and add your Gemini key
npm run seed               # generates the "Chez Fatima" demo restaurant
npm run report examples/chez-fatima/data.db
```

Get a free Gemini key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

## How it works

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ POS Database │──▶│   Adapter    │──▶│    Tools     │──▶│  LLM Agent   │
│  (SQLite/PG) │   │ (typed rows) │   │ (5 functions)│   │ (Gemini/    │
└──────────────┘   └──────────────┘   └──────────────┘   │  Claude)     │
                                                          └──────┬───────┘
                                                                 │
                                                                 ▼
                                                          ┌──────────────┐
                                                          │  Markdown    │
                                                          │    Brief     │
                                                          └──────────────┘
```

- **Adapter** (`src/adapters/sqlite.ts`) — wraps `better-sqlite3` with prepared statements scoped to a `(tenant_id, store_id)` pair. Every read the agent needs is exposed here; SQL never leaks upward.
- **Tools** (`src/tools/index.ts`) — five deterministic functions the agent can call:
  - `list_dishes` — the menu shape
  - `margin_calc` — reported vs. **effective** margin (effective = qty-weighted avg of the last 90 days of purchase unit-costs)
  - `reprice_sim` — constant-elasticity demand simulation (default ε = -1.2)
  - `trend_detector` — flags ingredients whose real cost has drifted from the ERP's reported cost
  - `dish_ranker` — sort by revenue, volume, margin%, or absolute margin
- **Agent** (`src/agent/weekly_brief.ts`) — a `generateText()` call with a CFO-style system prompt, tool loop capped at 12 steps.
- **CLI** (`src/cli.ts`) — `commander`-based; writes the brief to stdout or `--out <path>`.

## Model tiers

| Tier | Model | Cost | Use case |
|---|---|---|---|
| `free` | `gemini-flash-lite-latest` | free tier | demos, open-source, low-stakes |
| `pro` | `claude-sonnet-4-6` | pay-per-token | production, higher stakes |

Swap tiers with one env var. Same tools, same prompts, same output shape.

```bash
MODEL_TIER=pro npm run report examples/chez-fatima/data.db
```

## The Chez Fatima fixture

The demo restaurant has four planted problems, all discoverable by the tools:

1. **Over-portioned "Grand" tagine** — 0.8 kg of lamb per serving vs. 0.25 kg for the "Petit" (3.2× more meat for a 45% higher price)
2. **Baklava hidden gem** — 88% margin, ~3 units/week, under-promoted
3. **Saturday-night stockout** — 5 Saturdays with zero post-8pm brochette sales
4. **Silent supplier creep** — lamb cost drifted 85 → 100 MAD/kg over 90 days while the ERP still shows 85

The seed is deterministic (`SEED = 42`), so every clone produces the exact same database. Golden snapshot tests under `tests/golden/` pin every tool's output against this fixture — any drift in the seed, adapter math, or tool logic surfaces as a visible diff.

## Testing

```bash
npm test          # 38 tests: 8 adapter + 9 model + 11 tools + 9 golden + 1 hello
npm run typecheck
npm run lint
```

## Roadmap

- [x] SQLite adapter + Chez Fatima fixture
- [x] Free/pro model abstraction
- [x] Five agent tools with golden snapshots
- [x] Weekly-brief agent + CLI
- [ ] Postgres adapter (targets the same schema — drop-in swap for real restaurants)
- [ ] Web demo (browse-generate-share)
- [ ] Slack / email delivery

## License

MIT © Tohami Ben ([asmar-io](https://github.com/asmar-io))
