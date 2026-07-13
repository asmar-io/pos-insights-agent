#!/usr/bin/env node
// CLI entry point.
//
//   pos-insights-agent report <db-path> [--tenant <uuid>] [--store <uuid>]
//                                       [--tier free|pro]
//
// Prints the generated markdown brief to stdout so it can be piped into a
// file, a Slack webhook, or paged with less. Errors go to stderr with
// exit code 1.

import { writeFileSync } from "node:fs";
import { Command } from "commander";
import { generateWeeklyBrief } from "./agent/weekly_brief.js";

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

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`ERROR: ${message}`);
  process.exit(1);
});
