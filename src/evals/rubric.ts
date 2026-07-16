// Deterministic rubric for grading a Chez Fatima brief.
//
// The rubric encodes the four planted problems in the fixture. Scoring is
// pure string/number matching — no LLM, no randomness — so runs are
// comparable across models, prompt tweaks, and commits.
//
// Each item has (a) keyword groups (at least one keyword from each group
// must appear) and (b) optional numbers the brief should reference within
// a percentage tolerance. Both must pass for the item to score a hit.

export type ExpectedNumber = {
  value: number;
  tolerance_pct: number;
  label: string;
};

export type RubricItem = {
  id: string;
  title: string;
  description: string;
  severity: "high" | "medium" | "low";
  must_mention: string[][];
  must_include_number?: ExpectedNumber[];
};

export type RubricHit = {
  id: string;
  title: string;
  severity: RubricItem["severity"];
  hit: boolean;
  missing_keyword_groups: string[][];
  missing_numbers: string[];
};

export type RubricResult = {
  items: RubricHit[];
  hit_count: number;
  total: number;
  score: number;
};

export const CHEZ_FATIMA_RUBRIC: RubricItem[] = [
  {
    id: "over_portioned_tagine",
    title: "Grand tagine is over-portioned vs Petit",
    description:
      "Grand uses 0.8 kg of lamb vs 0.25 kg for Petit — 3.2× the meat for only ~45% more price.",
    severity: "high",
    must_mention: [
      ["tagine", "agneau", "lamb"],
      ["grand"],
      ["portion", "re-portion", "reportion", "recipe", "petit", "size", "0.8", "0.25"],
    ],
  },
  {
    id: "baklava_hidden_gem",
    title: "Baklava is a hidden gem",
    description: "~88% effective margin at ~3 units/week — under-promoted.",
    severity: "medium",
    must_mention: [["baklava"], ["margin", "hidden", "promote", "under"]],
    must_include_number: [{ value: 88, tolerance_pct: 15, label: "baklava margin ~88%" }],
  },
  {
    id: "saturday_brochette_stockout",
    title: "Saturday-night brochette stockout",
    description: "5 Saturdays with zero post-8pm brochette sales — probable stockout.",
    severity: "medium",
    must_mention: [
      ["brochette"],
      ["saturday", "samedi", "weekend"],
      ["stockout", "out of stock", "sold out", "no sales", "missing"],
    ],
  },
  {
    id: "lamb_supplier_creep",
    title: "Silent lamb supplier cost creep",
    description: "Effective agneau cost drifted ~8.8% above reported (85 → ~92.5 MAD/kg).",
    severity: "high",
    must_mention: [
      ["agneau", "lamb"],
      ["cost", "supplier", "creep", "drift", "increase", "rise"],
    ],
    must_include_number: [
      { value: 8.8, tolerance_pct: 40, label: "agneau drift ~8.8%" },
      { value: 92.5, tolerance_pct: 8, label: "agneau effective cost ~92.5 MAD/kg" },
    ],
  },
];

export function scoreBrief(brief: string, rubric: RubricItem[] = CHEZ_FATIMA_RUBRIC): RubricResult {
  const lower = brief.toLowerCase();
  const numbers = extractNumbers(brief);

  const items: RubricHit[] = rubric.map((item) => {
    const missingKw = item.must_mention.filter(
      (group) => !group.some((kw) => lower.includes(kw.toLowerCase())),
    );
    const missingNums = (item.must_include_number ?? [])
      .filter((n) => !numbers.some((x) => within(x, n.value, n.tolerance_pct)))
      .map((n) => n.label);
    return {
      id: item.id,
      title: item.title,
      severity: item.severity,
      hit: missingKw.length === 0 && missingNums.length === 0,
      missing_keyword_groups: missingKw,
      missing_numbers: missingNums,
    };
  });

  const hit = items.filter((i) => i.hit).length;
  return {
    items,
    hit_count: hit,
    total: rubric.length,
    score: rubric.length === 0 ? 1 : hit / rubric.length,
  };
}

/** Turn missed rubric items into a targeted critique the drafter can act on. */
export function critiqueFromMisses(result: RubricResult, rubric: RubricItem[]): string {
  const misses = result.items.filter((i) => !i.hit);
  if (misses.length === 0) return "";
  const byId = new Map(rubric.map((r) => [r.id, r]));
  const lines = misses.map((m) => {
    const src = byId.get(m.id);
    const missingKw = m.missing_keyword_groups.map((g) => `one of {${g.join(", ")}}`).join("; ");
    const missingNums = m.missing_numbers.join("; ");
    const parts = [`- ${m.title} (${m.severity})`, `  Why it matters: ${src?.description ?? ""}`];
    if (missingKw) parts.push(`  Missing mentions: ${missingKw}`);
    if (missingNums) parts.push(`  Missing numbers: ${missingNums}`);
    return parts.join("\n");
  });
  return `The draft missed the following:\n${lines.join("\n")}`;
}

function extractNumbers(text: string): number[] {
  const rgx = /-?\d+(?:[.,]\d+)?/g;
  const out: number[] = [];
  let m: RegExpExecArray | null = rgx.exec(text);
  while (m !== null) {
    const n = Number(m[0].replace(",", "."));
    if (!Number.isNaN(n)) out.push(n);
    m = rgx.exec(text);
  }
  return out;
}

function within(x: number, target: number, tolerancePct: number): boolean {
  if (target === 0) return Math.abs(x) <= tolerancePct / 100;
  return (Math.abs(x - target) / Math.abs(target)) * 100 <= tolerancePct;
}
