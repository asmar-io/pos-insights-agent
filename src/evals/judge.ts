// LLM-as-judge for weekly briefs.
//
// The deterministic rubric in ./rubric.ts already answers "did the brief
// mention the topic and roughly the right number?". The judge adds the
// nuance that keyword matching cannot: is the reasoning sound, are the
// numbers *accurately* used (not just present), and what would a CFO
// tell the drafter to fix?
//
// We hard-pin the judge to gemini-flash-lite so the eval stays cheap
// even when the drafter is running on Claude Sonnet. If the free-tier
// key isn't available, the judge is skipped — deterministic scoring
// alone is still meaningful.

import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { getEnv } from "../config/env.js";
import type { RubricItem } from "./rubric.js";

const JUDGE_MODEL_ID = "gemini-flash-lite-latest";

const JudgeItemSchema = z.object({
  id: z.string(),
  addressed: z.boolean().describe("Does the brief substantively address this rubric item?"),
  numbers_accurate: z
    .boolean()
    .describe(
      "Are the numbers in the brief for this item close to the expected ones? True if no numbers are expected.",
    ),
  critique: z.string().describe("One or two sentences of concrete feedback for this item."),
});

const JudgeOutputSchema = z.object({
  items: z.array(JudgeItemSchema),
  overall_critique: z
    .string()
    .describe("2–3 sentences summarising what the CFO would want fixed in a revision."),
  overall_score: z
    .number()
    .min(0)
    .max(1)
    .describe("Holistic 0–1 quality score, weighing rubric coverage and CFO usefulness."),
});

export type JudgeResult = z.infer<typeof JudgeOutputSchema>;

export function isJudgeAvailable(): boolean {
  return Boolean(getEnv().GOOGLE_GENERATIVE_AI_API_KEY);
}

export async function judgeBrief(brief: string, rubric: RubricItem[]): Promise<JudgeResult> {
  if (!isJudgeAvailable()) {
    throw new Error(
      "Judge requires GOOGLE_GENERATIVE_AI_API_KEY (it always uses gemini-flash-lite to keep evals cheap). Set it in .env.",
    );
  }

  const rubricSummary = rubric
    .map((r) => {
      const nums =
        r.must_include_number
          ?.map((n) => `${n.label} = ${n.value} (±${n.tolerance_pct}%)`)
          .join(", ") ?? "(no numeric expectation)";
      return `- ${r.id} [${r.severity}] ${r.title}\n  ${r.description}\n  Expected numbers: ${nums}`;
    })
    .join("\n");

  const system = `You are a strict CFO reviewing a weekly menu-profitability brief for a restaurant owner.
For each rubric item below, decide whether the brief substantively addresses it and whether the numbers used are accurate relative to expectation.
Be concise. Do not invent numbers of your own; judge only what appears in the brief.`;

  const prompt = `Rubric items to grade:
${rubricSummary}

Brief to grade:
"""
${brief}
"""

Return one entry per rubric item (use its id verbatim), plus an overall critique and score.`;

  const { object } = await generateObject({
    model: google(JUDGE_MODEL_ID),
    schema: JudgeOutputSchema,
    system,
    prompt,
    temperature: 0.1,
  });

  return object;
}
