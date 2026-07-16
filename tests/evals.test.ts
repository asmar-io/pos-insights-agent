// Tests for the deterministic parts of the eval system: rubric scoring
// and report rendering. The LLM judge + full runner require API keys and
// live outside this file.

import { describe, expect, it } from "vitest";
import { renderEvalReport } from "../src/evals/report.js";
import { CHEZ_FATIMA_RUBRIC, critiqueFromMisses, scoreBrief } from "../src/evals/rubric.js";
import type { EvalRun } from "../src/evals/runner.js";

const PERFECT_BRIEF = `## Menu Profitability Brief

### 1. Top revenue drivers
- Tagine d'agneau (Grand): MAD 3,630

### 2. Hidden gems
- Baklava is a hidden gem at ~88% margin, only 3 units per week — underpromoted.

### 3. Supplier cost creep
- Agneau (lamb) supplier cost has drifted 8.8% above the reported ERP figure —
  effective is ~92.5 MAD/kg, reported is 85 MAD/kg.

### 4. Deep-dive
The Grand tagine is over-portioned. It uses 0.8 kg of lamb versus 0.25 kg for
Petit — a 3.2× cost blowout for only ~45% more menu price. Re-portion the recipe.

### 5. Saturday brochette stockout
Brochettes have been missing every Saturday night — 5 weekend evenings with no
post-8pm sales suggests a stockout pattern.

### 6. Recommended actions
- Re-portion Grand tagine
- Promote baklava
- Renegotiate lamb supplier
- Fix Saturday brochette prep`;

const EMPTY_BRIEF = "This week was a quiet one. No major concerns.";

describe("scoreBrief", () => {
  it("gives a perfect brief 4/4", () => {
    const r = scoreBrief(PERFECT_BRIEF);
    expect(r.total).toBe(4);
    expect(r.hit_count).toBe(4);
    expect(r.score).toBe(1);
    for (const item of r.items) expect(item.hit).toBe(true);
  });

  it("gives an empty brief 0/4", () => {
    const r = scoreBrief(EMPTY_BRIEF);
    expect(r.hit_count).toBe(0);
    expect(r.score).toBe(0);
    for (const item of r.items) {
      expect(item.hit).toBe(false);
      expect(item.missing_keyword_groups.length).toBeGreaterThan(0);
    }
  });

  it("flags the lamb-creep item when the number is wrong (15.4% not 8.8%)", () => {
    // Reproduce the actual first-draft failure: brief names lamb + drift
    // but attributes 15.4% (wrong; truth is 8.8%). Even with keywords hit,
    // the number tolerance should reject.
    const brief = `Agneau supplier cost has risen 15.4%, effective 98.13 MAD/kg vs reported 85.`;
    const r = scoreBrief(brief);
    const creep = r.items.find((i) => i.id === "lamb_supplier_creep");
    expect(creep).toBeDefined();
    expect(creep?.hit).toBe(false);
    expect(creep?.missing_numbers.some((n) => n.includes("8.8"))).toBe(true);
  });

  it("hits baklava when margin ~88% is present", () => {
    const brief = `Baklava: 87% margin, hidden gem, under-promoted.`;
    const r = scoreBrief(brief);
    const b = r.items.find((i) => i.id === "baklava_hidden_gem");
    expect(b?.hit).toBe(true);
  });

  it("misses over-portioned tagine when only 'tagine' appears (no grand/petit context)", () => {
    const brief = `Tagine is our top seller.`;
    const r = scoreBrief(brief);
    const t = r.items.find((i) => i.id === "over_portioned_tagine");
    expect(t?.hit).toBe(false);
  });
});

describe("critiqueFromMisses", () => {
  it("returns empty string when nothing was missed", () => {
    const r = scoreBrief(PERFECT_BRIEF);
    expect(critiqueFromMisses(r, CHEZ_FATIMA_RUBRIC)).toBe("");
  });

  it("names the missed items and severity", () => {
    const r = scoreBrief(EMPTY_BRIEF);
    const c = critiqueFromMisses(r, CHEZ_FATIMA_RUBRIC);
    expect(c).toContain("high");
    expect(c).toContain("Grand tagine");
    expect(c).toContain("Baklava");
  });

  it("lists the missing keyword groups and numbers", () => {
    const brief = `Agneau supplier cost has risen 15.4%.`;
    const r = scoreBrief(brief);
    const c = critiqueFromMisses(r, CHEZ_FATIMA_RUBRIC);
    expect(c).toContain("Missing numbers");
    expect(c).toContain("8.8");
  });
});

describe("renderEvalReport", () => {
  it("renders coverage, per-item table, and the final brief", () => {
    const draftScore = scoreBrief(EMPTY_BRIEF);
    const finalScore = scoreBrief(PERFECT_BRIEF);
    const run: EvalRun = {
      modelId: "test-model",
      anchorIso: "2026-07-13T23:59:59.000Z",
      threshold: 0.75,
      draft: {
        brief: EMPTY_BRIEF,
        rubric: draftScore,
        judge: null,
        usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
      },
      revision: {
        brief: PERFECT_BRIEF,
        rubric: finalScore,
        judge: null,
        usage: { inputTokens: 200, outputTokens: 40, totalTokens: 240 },
      },
      final: {
        brief: PERFECT_BRIEF,
        rubric: finalScore,
        judge: null,
        usage: { inputTokens: 200, outputTokens: 40, totalTokens: 240 },
      },
      totalUsage: { inputTokens: 300, outputTokens: 60, totalTokens: 360 },
    };

    const md = renderEvalReport(run);
    expect(md).toContain("# Eval report");
    expect(md).toContain("draft **0%**");
    expect(md).toContain("revised **100%**");
    expect(md).toContain("Rubric per-item");
    // The perfect brief becomes the final; the empty one is stashed under a
    // <details> disclosure.
    expect(md).toContain(PERFECT_BRIEF);
    expect(md).toContain("Show original draft");
  });
});
