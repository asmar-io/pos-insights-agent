// Renders an EvalRun as a self-contained markdown report — the artefact
// a portfolio reader (or CI job) actually looks at.

import type { EvalRun } from "./runner.js";

export function renderEvalReport(run: EvalRun): string {
  const lines: string[] = [];
  lines.push("# Eval report");
  lines.push("");
  lines.push(`- **Model:** \`${run.modelId}\``);
  lines.push(`- **Anchor:** \`${run.anchorIso}\``);
  lines.push(`- **Threshold:** ${(run.threshold * 100).toFixed(0)}%`);
  lines.push(
    `- **Rubric coverage:** draft **${(run.draft.rubric.score * 100).toFixed(0)}%** (${run.draft.rubric.hit_count}/${run.draft.rubric.total})` +
      (run.revision
        ? ` → revised **${(run.revision.rubric.score * 100).toFixed(0)}%** (${run.revision.rubric.hit_count}/${run.revision.rubric.total})`
        : ""),
  );
  if (run.draft.judge) {
    lines.push(
      `- **Judge score:** draft **${(run.draft.judge.overall_score * 100).toFixed(0)}%**` +
        (run.revision?.judge
          ? ` → revised **${(run.revision.judge.overall_score * 100).toFixed(0)}%**`
          : ""),
    );
  }
  lines.push(
    `- **Tokens:** ${run.totalUsage.totalTokens} total (in=${run.totalUsage.inputTokens}, out=${run.totalUsage.outputTokens})`,
  );
  lines.push("");

  lines.push("## Rubric per-item");
  lines.push("");
  lines.push("| Item | Severity | Draft | Revised |");
  lines.push("| --- | --- | --- | --- |");
  for (let i = 0; i < run.final.rubric.items.length; i++) {
    const d = run.draft.rubric.items[i];
    const r = run.revision?.rubric.items[i];
    if (!d) continue;
    lines.push(
      `| ${d.title} | ${d.severity} | ${d.hit ? "✓" : "✗"} | ${r ? (r.hit ? "✓" : "✗") : "—"} |`,
    );
  }
  lines.push("");

  const missDetails = run.final.rubric.items.filter((i) => !i.hit);
  if (missDetails.length > 0) {
    lines.push("### Misses in the final brief");
    lines.push("");
    for (const m of missDetails) {
      lines.push(`- **${m.title}**`);
      if (m.missing_keyword_groups.length > 0) {
        const groups = m.missing_keyword_groups.map((g) => `one of {${g.join(", ")}}`).join("; ");
        lines.push(`  - missing keywords: ${groups}`);
      }
      if (m.missing_numbers.length > 0) {
        lines.push(`  - missing numbers: ${m.missing_numbers.join("; ")}`);
      }
    }
    lines.push("");
  }

  if (run.final.judge) {
    lines.push("## Judge critique");
    lines.push("");
    lines.push(`> ${run.final.judge.overall_critique}`);
    lines.push("");
  }

  lines.push("## Final brief");
  lines.push("");
  lines.push(run.final.brief);
  lines.push("");

  if (run.revision) {
    lines.push("<details><summary>Show original draft (before revision)</summary>");
    lines.push("");
    lines.push(run.draft.brief);
    lines.push("");
    lines.push("</details>");
  }

  return lines.join("\n");
}
