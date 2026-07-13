// Provider-agnostic language model factory.
//
// The rest of the codebase never imports @ai-sdk/google or @ai-sdk/anthropic
// directly — everything flows through getModel(). This is what lets us swap
// tiers with a single env var without touching agent code.

import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import { getEnv, type Tier } from "../config/env.js";

const FREE_MODEL_ID = "gemini-flash-lite-latest";
const PRO_MODEL_ID = "claude-sonnet-4-6";

export function getModel(tier?: Tier): LanguageModel {
  const resolvedTier = tier ?? getEnv().MODEL_TIER;
  switch (resolvedTier) {
    case "free":
      return google(FREE_MODEL_ID);
    case "pro":
      return anthropic(PRO_MODEL_ID);
  }
}

export function getModelId(tier?: Tier): string {
  const resolvedTier = tier ?? getEnv().MODEL_TIER;
  return resolvedTier === "free" ? FREE_MODEL_ID : PRO_MODEL_ID;
}

export function assertKeyAvailable(tier?: Tier): void {
  const env = getEnv();
  const resolvedTier = tier ?? env.MODEL_TIER;
  if (resolvedTier === "free" && !env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error(
      "MODEL_TIER=free requires GOOGLE_GENERATIVE_AI_API_KEY. " +
        "Get one at https://aistudio.google.com/apikey and set it in .env.",
    );
  }
  if (resolvedTier === "pro" && !env.ANTHROPIC_API_KEY) {
    throw new Error(
      "MODEL_TIER=pro requires ANTHROPIC_API_KEY. " +
        "Get one at https://console.anthropic.com/ and set it in .env.",
    );
  }
}
