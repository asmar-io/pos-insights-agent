// Loads and validates environment variables via zod.
// dotenv is a side effect — importing this file loads .env into process.env.

import "dotenv/config";
import { z } from "zod";

const TierSchema = z.enum(["free", "pro"]);
export type Tier = z.infer<typeof TierSchema>;

// Treat empty-string env values (e.g. `KEY=` in .env) as absent.
const OptionalNonEmpty = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().min(1).optional(),
);

const EnvSchema = z.object({
  MODEL_TIER: TierSchema.default("free"),
  GOOGLE_GENERATIVE_AI_API_KEY: OptionalNonEmpty,
  ANTHROPIC_API_KEY: OptionalNonEmpty,
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/**
 * Returns the validated environment. Cached on first call.
 * Throws with a readable message if MODEL_TIER is invalid.
 * API keys are NOT required at load time — providers only need
 * them when a request is actually sent.
 */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/**
 * Test-only. Resets the module-level cache so subsequent
 * getEnv() calls re-read process.env.
 */
export function resetEnvCache(): void {
  cached = undefined;
}
