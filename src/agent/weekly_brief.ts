// Weekly-brief agent — the main product surface.
//
// Given a SQLite fixture (a store's data.db), spins up the adapter,
// wires the five tools, and asks the model to produce a CFO-style
// markdown brief. The prompt is deliberately narrow: no free-form
// storytelling, no invented numbers, just answers grounded in tool calls.

import { generateText, stepCountIs } from "ai";
import { createAdapter } from "../adapters/sqlite.js";
import { getEnv } from "../config/env.js";
import { assertKeyAvailable, getModel, getModelId } from "../models/index.js";
import { createTools } from "../tools/index.js";

export type BriefOptions = {
  dbPath: string;
  tenantId: string;
  storeId: string;
  /** ISO end-of-window anchor. Defaults to the fixture's max order date. */
  anchorIso?: string;
  /** Cap on tool-calling steps. Default 12 — plenty for the 5 tools. */
  maxSteps?: number;
};

export type BriefResult = {
  markdown: string;
  modelId: string;
  anchorIso: string;
  usage: {
    inputTokens: number | undefined;
    outputTokens: number | undefined;
    totalTokens: number | undefined;
  };
};

const SYSTEM_PROMPT = `You are a CFO-caliber restaurant analyst writing a weekly brief for the owner.
Rules:
- Ground every number in a tool call — never invent figures.
- Prefer 'effective' costs and margins over 'reported' ones; the gap is the point.
- Currency is Moroccan Dirham (MAD). Use "MAD" as the symbol.
- Be direct: point out over-portioned dishes, hidden gems, and cost creep.
- Keep the brief tight (≤ ~500 words) and formatted as GitHub-flavored markdown.
- End with a short "Recommended actions" list of 3–5 bullet points.`;

const USER_PROMPT = `Produce this week's Menu Profitability Brief for the store.

Structure the brief with these H2 sections in order:
1. **Top revenue drivers** — the top 5 by revenue this week (dish_ranker metric=revenue, window_days=7).
2. **Hidden gems** — dishes with the highest margin_pct that are under-selling (dish_ranker metric=margin_pct, window_days=90).
3. **Supplier cost creep** — ingredients whose effective cost drifted >= 5% vs the reported cost (trend_detector).
4. **Deep-dive: one at-risk dish** — pick the dish whose reported margin most overstates its effective margin; call margin_calc on it and show the breakdown.
5. **Recommended actions** — 3 to 5 concrete bullets (reprice, re-portion, renegotiate).

Before writing, call list_dishes once to understand the menu.
Use reprice_sim if you want to justify a price-change recommendation.`;

export async function generateWeeklyBrief(opts: BriefOptions): Promise<BriefResult> {
  assertKeyAvailable();
  const env = getEnv();

  const adapter = createAdapter({
    dbPath: opts.dbPath,
    tenantId: opts.tenantId,
    storeId: opts.storeId,
  });

  try {
    const anchorIso = opts.anchorIso ?? adapter.maxOrderDate();
    if (!anchorIso) {
      throw new Error("No completed orders found in the fixture — cannot anchor the brief.");
    }

    const tools = createTools({ adapter, anchorIso });
    const model = getModel();
    const modelId = getModelId();

    const { text, usage } = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt: USER_PROMPT,
      tools,
      stopWhen: stepCountIs(opts.maxSteps ?? 12),
      temperature: env.MODEL_TIER === "free" ? 0.2 : 0.4,
    });

    return {
      markdown: text.trim(),
      modelId,
      anchorIso,
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
      },
    };
  } finally {
    adapter.close();
  }
}
