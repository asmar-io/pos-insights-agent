// Orchestrates a full eval run: draft → rubric score → optional LLM
// critique → optional revision → re-score. This is the heart of the
// "does the agent actually work?" answer.

import { generateWeeklyBrief } from "../agent/weekly_brief.js";
import { isJudgeAvailable, type JudgeResult, judgeBrief } from "./judge.js";
import {
  CHEZ_FATIMA_RUBRIC,
  critiqueFromMisses,
  type RubricItem,
  type RubricResult,
  scoreBrief,
} from "./rubric.js";

export type EvalOptions = {
  dbPath: string;
  tenantId: string;
  storeId: string;
  anchorIso?: string;
  /** Rubric score below which we trigger a revision pass. 0..1. Default 0.75. */
  threshold?: number;
  /** Whether to run a revision pass at all when below threshold. Default true. */
  revise?: boolean;
  /** Whether to call the LLM judge for a narrative critique. Default true. */
  useLlmJudge?: boolean;
  /** Rubric to grade against. Defaults to the Chez Fatima planted problems. */
  rubric?: RubricItem[];
};

export type BriefPass = {
  brief: string;
  rubric: RubricResult;
  judge: JudgeResult | null;
  usage: {
    inputTokens: number | undefined;
    outputTokens: number | undefined;
    totalTokens: number | undefined;
  };
};

export type EvalRun = {
  modelId: string;
  anchorIso: string;
  threshold: number;
  draft: BriefPass;
  revision: BriefPass | null;
  final: BriefPass;
  totalUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

export async function runEval(opts: EvalOptions): Promise<EvalRun> {
  const rubric = opts.rubric ?? CHEZ_FATIMA_RUBRIC;
  const threshold = opts.threshold ?? 0.75;
  const revise = opts.revise ?? true;
  const useLlmJudge = opts.useLlmJudge ?? true;

  const draftResult = await generateWeeklyBrief({
    dbPath: opts.dbPath,
    tenantId: opts.tenantId,
    storeId: opts.storeId,
    anchorIso: opts.anchorIso,
  });

  const draftRubric = scoreBrief(draftResult.markdown, rubric);
  const draftJudge =
    useLlmJudge && isJudgeAvailable() ? await judgeBrief(draftResult.markdown, rubric) : null;

  const draft: BriefPass = {
    brief: draftResult.markdown,
    rubric: draftRubric,
    judge: draftJudge,
    usage: draftResult.usage,
  };

  const shouldRevise = revise && draftRubric.score < threshold;
  let revision: BriefPass | null = null;

  if (shouldRevise) {
    const critique = buildRevisionCritique(draftRubric, rubric, draftJudge);
    const revised = await generateWeeklyBrief({
      dbPath: opts.dbPath,
      tenantId: opts.tenantId,
      storeId: opts.storeId,
      anchorIso: opts.anchorIso,
      revision: { previousDraft: draftResult.markdown, critique },
    });
    const revRubric = scoreBrief(revised.markdown, rubric);
    const revJudge =
      useLlmJudge && isJudgeAvailable() ? await judgeBrief(revised.markdown, rubric) : null;
    revision = {
      brief: revised.markdown,
      rubric: revRubric,
      judge: revJudge,
      usage: revised.usage,
    };
  }

  const final = revision ?? draft;
  const totalUsage = sumUsage([draft.usage, ...(revision ? [revision.usage] : [])]);

  return {
    modelId: draftResult.modelId,
    anchorIso: draftResult.anchorIso,
    threshold,
    draft,
    revision,
    final,
    totalUsage,
  };
}

function buildRevisionCritique(
  rubric: RubricResult,
  items: RubricItem[],
  judge: JudgeResult | null,
): string {
  const parts: string[] = [];
  const rubricNotes = critiqueFromMisses(rubric, items);
  if (rubricNotes) parts.push(rubricNotes);
  if (judge?.overall_critique) parts.push(`Reviewer notes: ${judge.overall_critique}`);
  const perItem =
    judge?.items
      .filter((i) => !i.addressed || !i.numbers_accurate)
      .map((i) => `- ${i.id}: ${i.critique}`)
      .join("\n") ?? "";
  if (perItem) parts.push(`Per-item feedback:\n${perItem}`);
  return parts.join("\n\n");
}

function sumUsage(
  usages: {
    inputTokens: number | undefined;
    outputTokens: number | undefined;
    totalTokens: number | undefined;
  }[],
): { inputTokens: number; outputTokens: number; totalTokens: number } {
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  for (const u of usages) {
    inputTokens += u.inputTokens ?? 0;
    outputTokens += u.outputTokens ?? 0;
    totalTokens += u.totalTokens ?? 0;
  }
  return { inputTokens, outputTokens, totalTokens };
}
