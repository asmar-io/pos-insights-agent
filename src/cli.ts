#!/usr/bin/env node
// CLI entry point.
//
//   pos-insights-agent report <db-path> [--tenant <uuid>] [--store <uuid>] [--tier free|pro]
//   pos-insights-agent eval   <db-path> [--threshold 0.75] [--no-revise] [--no-judge] [--out path]
//   pos-insights-agent chat   <db-path> [--skip-brief]
//
// `report` prints a one-shot brief. `eval` scores the brief against the
// planted-problem rubric and can rewrite it after critique. `chat` opens
// a REPL that shares tools + state with the brief so the owner can ask
// follow-ups ("why baklava?", "sim +15% on tagine").

import { writeFileSync } from "node:fs";
import { Command } from "commander";
import { runChat } from "./agent/chat.js";
import { generateWeeklyBrief } from "./agent/weekly_brief.js";
import { renderEvalReport } from "./evals/report.js";
import { runEval } from "./evals/runner.js";

const DEFAULT_TENANT = "00000000-0000-4000-8000-000000000001";
const DEFAULT_STORE = "00000000-0000-4000-8000-000000000002";

const program = new Command();

program
  .name("pos-insights-agent")
  .description("AI-powered menu profitability brief for restaurant POS data")
  .version("0.1.0");

program
  .command("report")
  .description("Generate this week's menu profitability brief")
  .argument("<db-path>", "Path to the SQLite fixture (e.g. examples/chez-fatima/data.db)")
  .option("-t, --tenant <uuid>", "Tenant UUID", DEFAULT_TENANT)
  .option("-s, --store <uuid>", "Store UUID", DEFAULT_STORE)
  .option("--tier <tier>", "Model tier: free | pro (overrides MODEL_TIER env)")
  .option("--anchor <iso>", "ISO date to anchor the brief (defaults to fixture max)")
  .option("-o, --out <path>", "Write the brief to a file instead of stdout")
  .action(
    async (
      dbPath: string,
      opts: { tenant: string; store: string; tier?: string; anchor?: string; out?: string },
    ) => {
      if (opts.tier) process.env.MODEL_TIER = opts.tier;

      const result = await generateWeeklyBrief({
        dbPath,
        tenantId: opts.tenant,
        storeId: opts.store,
        anchorIso: opts.anchor,
      });

      const header = [
        `<!-- model: ${result.modelId} -->`,
        `<!-- anchor: ${result.anchorIso} -->`,
        `<!-- tokens: in=${result.usage.inputTokens ?? "?"} out=${result.usage.outputTokens ?? "?"} total=${result.usage.totalTokens ?? "?"} -->`,
        "",
      ].join("\n");
      const payload = `${header}${result.markdown}\n`;

      if (opts.out) {
        writeFileSync(opts.out, payload, "utf8");
        console.error(`> wrote ${opts.out}`);
      } else {
        process.stdout.write(payload);
      }
    },
  );

program
  .command("eval")
  .description("Grade a generated brief against the planted-problem rubric")
  .argument("<db-path>", "Path to the SQLite fixture")
  .option("-t, --tenant <uuid>", "Tenant UUID", DEFAULT_TENANT)
  .option("-s, --store <uuid>", "Store UUID", DEFAULT_STORE)
  .option("--tier <tier>", "Model tier: free | pro (overrides MODEL_TIER env)")
  .option("--anchor <iso>", "ISO date to anchor the brief")
  .option("--threshold <n>", "Rubric score below which we revise (0..1)", "0.75")
  .option("--no-revise", "Skip the revision pass even if below threshold")
  .option("--no-judge", "Skip the LLM narrative judge (rubric-only scoring)")
  .option("-o, --out <path>", "Write the eval report to a markdown file")
  .action(
    async (
      dbPath: string,
      opts: {
        tenant: string;
        store: string;
        tier?: string;
        anchor?: string;
        threshold: string;
        revise: boolean;
        judge: boolean;
        out?: string;
      },
    ) => {
      if (opts.tier) process.env.MODEL_TIER = opts.tier;

      const threshold = Number.parseFloat(opts.threshold);
      if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
        throw new Error(`--threshold must be a number in [0, 1], got: ${opts.threshold}`);
      }

      const run = await runEval({
        dbPath,
        tenantId: opts.tenant,
        storeId: opts.store,
        anchorIso: opts.anchor,
        threshold,
        revise: opts.revise,
        useLlmJudge: opts.judge,
      });

      const report = renderEvalReport(run);

      if (opts.out) {
        writeFileSync(opts.out, `${report}\n`, "utf8");
        console.error(`> wrote ${opts.out}`);
      } else {
        process.stdout.write(`${report}\n`);
      }

      const summary =
        `> draft ${pct(run.draft.rubric.score)} (${run.draft.rubric.hit_count}/${run.draft.rubric.total})` +
        (run.revision
          ? ` → revised ${pct(run.revision.rubric.score)} (${run.revision.rubric.hit_count}/${run.revision.rubric.total})`
          : "");
      console.error(summary);
    },
  );

program
  .command("chat")
  .description("Open a REPL that shares tools + state with the weekly brief")
  .argument("<db-path>", "Path to the SQLite fixture")
  .option("-t, --tenant <uuid>", "Tenant UUID", DEFAULT_TENANT)
  .option("-s, --store <uuid>", "Store UUID", DEFAULT_STORE)
  .option("--tier <tier>", "Model tier: free | pro (overrides MODEL_TIER env)")
  .option("--anchor <iso>", "ISO date to anchor the brief")
  .option("--skip-brief", "Skip the initial brief and start with an empty conversation")
  .action(
    async (
      dbPath: string,
      opts: {
        tenant: string;
        store: string;
        tier?: string;
        anchor?: string;
        skipBrief?: boolean;
      },
    ) => {
      if (opts.tier) process.env.MODEL_TIER = opts.tier;

      await runChat({
        dbPath,
        tenantId: opts.tenant,
        storeId: opts.store,
        anchorIso: opts.anchor,
        skipBrief: opts.skipBrief ?? false,
      });
    },
  );

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`ERROR: ${message}`);
  process.exit(1);
});
