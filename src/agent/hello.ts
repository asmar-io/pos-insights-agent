// Smoke test — proves the model abstraction reaches the provider and
// gets back a real completion. Run with:
//
//   npm run hello               # uses the tier from MODEL_TIER (default: free)
//   MODEL_TIER=pro npm run hello
//
// Requires the matching API key in .env.

import { generateText } from "ai";
import { getEnv } from "../config/env.js";
import { assertKeyAvailable, getModel, getModelId } from "../models/index.js";

async function main(): Promise<void> {
  const env = getEnv();
  assertKeyAvailable();

  const model = getModel();
  const modelId = getModelId();

  console.log(`> tier: ${env.MODEL_TIER}`);
  console.log(`> model: ${modelId}`);
  console.log("> prompt: Say hello to Chez Fatima in Moroccan Darija, one sentence.");
  console.log("");

  const { text, usage } = await generateText({
    model,
    prompt: "Say hello to Chez Fatima in Moroccan Darija, one sentence.",
  });

  console.log(text.trim());
  console.log("");
  console.log(
    `> usage: input=${usage.inputTokens ?? "?"} output=${usage.outputTokens ?? "?"} total=${usage.totalTokens ?? "?"}`,
  );
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`ERROR: ${message}`);
  process.exit(1);
});
