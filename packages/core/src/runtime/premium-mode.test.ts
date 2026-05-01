import { describe, expect, it } from "vitest";
import { assertNotPremiumFallback, assertNotPremiumSilentFallback, isPremiumStrictMode } from "./premium-mode";

describe("premium-mode", () => {
  it("isPremiumStrictMode est vrai uniquement si une variable explicite === true", () => {
    const env = {
      PIPELINE_V3_PREMIUM_ONLY: "true",
      NEXT_PUBLIC_PIPELINE_V3_PREMIUM_ONLY: "",
    } as NodeJS.ProcessEnv;
    expect(isPremiumStrictMode(env)).toBe(true);
    expect(isPremiumStrictMode({ ...env, PIPELINE_V3_PREMIUM_ONLY: "false" } as NodeJS.ProcessEnv)).toBe(false);
    expect(isPremiumStrictMode({ NEXT_PUBLIC_PIPELINE_V3_PREMIUM_ONLY: "true" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("assertNotPremiumSilentFallback lève en strict si condition vraie", () => {
    const env = { PIPELINE_V3_PREMIUM_ONLY: "true" } as NodeJS.ProcessEnv;
    expect(() => assertNotPremiumSilentFallback(true, "code_x", env)).toThrow("code_x");
  });

  it("assertNotPremiumSilentFallback ne lève pas hors strict", () => {
    const env = { PIPELINE_V3_PREMIUM_ONLY: "false" } as NodeJS.ProcessEnv;
    expect(() => assertNotPremiumSilentFallback(true, "code_x", env)).not.toThrow();
  });

  it("assertNotPremiumFallback est un alias de assertNotPremiumSilentFallback", () => {
    expect(assertNotPremiumFallback).toBe(assertNotPremiumSilentFallback);
  });
});
