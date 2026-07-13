import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCache } from "../src/config/env.js";
import { assertKeyAvailable, getModel, getModelId } from "../src/models/index.js";

const originalEnv = { ...process.env };

function setEnv(patch: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetEnvCache();
}

describe("getModel", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    resetEnvCache();
  });
  afterEach(() => {
    process.env = { ...originalEnv };
    resetEnvCache();
  });

  it("returns a LanguageModel for the free tier", () => {
    setEnv({ MODEL_TIER: "free" });
    const model = getModel();
    expect(model).toBeDefined();
    expect(getModelId()).toBe("gemini-2.5-flash");
  });

  it("returns a LanguageModel for the pro tier", () => {
    setEnv({ MODEL_TIER: "pro" });
    const model = getModel();
    expect(model).toBeDefined();
    expect(getModelId()).toBe("claude-sonnet-4-6");
  });

  it("defaults to the free tier when MODEL_TIER is unset", () => {
    setEnv({ MODEL_TIER: undefined });
    expect(getModelId()).toBe("gemini-2.5-flash");
  });

  it("lets an explicit argument override the env tier", () => {
    setEnv({ MODEL_TIER: "free" });
    expect(getModelId("pro")).toBe("claude-sonnet-4-6");
  });

  it("throws a readable error when MODEL_TIER is invalid", () => {
    setEnv({ MODEL_TIER: "ultra" });
    expect(() => getModel()).toThrowError(/MODEL_TIER/);
  });
});

describe("assertKeyAvailable", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    resetEnvCache();
  });
  afterEach(() => {
    process.env = { ...originalEnv };
    resetEnvCache();
  });

  it("passes when the free-tier key is set", () => {
    setEnv({
      MODEL_TIER: "free",
      GOOGLE_GENERATIVE_AI_API_KEY: "test-google-key",
      ANTHROPIC_API_KEY: undefined,
    });
    expect(() => assertKeyAvailable()).not.toThrow();
  });

  it("throws with a helpful message when the free-tier key is missing", () => {
    setEnv({
      MODEL_TIER: "free",
      GOOGLE_GENERATIVE_AI_API_KEY: undefined,
      ANTHROPIC_API_KEY: undefined,
    });
    expect(() => assertKeyAvailable()).toThrowError(/GOOGLE_GENERATIVE_AI_API_KEY/);
  });

  it("passes when the pro-tier key is set", () => {
    setEnv({
      MODEL_TIER: "pro",
      GOOGLE_GENERATIVE_AI_API_KEY: undefined,
      ANTHROPIC_API_KEY: "test-anthropic-key",
    });
    expect(() => assertKeyAvailable()).not.toThrow();
  });

  it("throws with a helpful message when the pro-tier key is missing", () => {
    setEnv({
      MODEL_TIER: "pro",
      GOOGLE_GENERATIVE_AI_API_KEY: undefined,
      ANTHROPIC_API_KEY: undefined,
    });
    expect(() => assertKeyAvailable()).toThrowError(/ANTHROPIC_API_KEY/);
  });
});
