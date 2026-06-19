import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  evaluatePromptLanguage,
  enforcePromptLanguageGuard,
  ResidualFrenchPromptError,
} from "./prompt-language-guard";

const originalEnv = process.env.MANGA_PROMPT_LANGUAGE_GUARD_STRICT;

describe("prompt-language-guard (P1.1)", () => {
  beforeEach(() => {
    delete process.env.MANGA_PROMPT_LANGUAGE_GUARD_STRICT;
  });
  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.MANGA_PROMPT_LANGUAGE_GUARD_STRICT;
    } else {
      process.env.MANGA_PROMPT_LANGUAGE_GUARD_STRICT = originalEnv;
    }
  });

  it("retourne 'ok' pour un prompt entierement anglais", () => {
    const result = evaluatePromptLanguage({
      positivePrompt: "young hero with blue eyes, detailed manga panel",
    });
    expect(result.outcome).toBe("ok");
    expect(result.positiveTokens).toEqual([]);
  });

  it("retourne 'warn' pour un seul token FR isole (mode lax par defaut)", () => {
    const result = evaluatePromptLanguage({
      positivePrompt: "young hero with cheveux rouges",
    });
    expect(result.outcome).toBe("warn");
    expect(result.positiveTokens).toContain("cheveux");
  });

  it("retourne 'block' au-dela de blockThreshold (defaut=3)", () => {
    const result = evaluatePromptLanguage({
      positivePrompt: "le héros avec cheveux bleus dans une forêt, décor détaillé",
    });
    expect(result.outcome).toBe("block");
    expect(result.positiveTokens.length).toBeGreaterThanOrEqual(3);
  });

  it("mode strict : 1 token FR suffit pour bloquer", () => {
    process.env.MANGA_PROMPT_LANGUAGE_GUARD_STRICT = "true";
    const result = evaluatePromptLanguage({
      positivePrompt: "young hero with cheveux rouges",
    });
    expect(result.outcome).toBe("block");
  });

  it("detecte aussi les tokens dans le negatif (warn)", () => {
    const result = evaluatePromptLanguage({
      positivePrompt: "clean prompt in english",
      negativePrompt: "pas de héros flou",
    });
    expect(result.outcome).toBe("warn");
    expect(result.negativeTokens).toContain("héros");
  });

  it("enforcePromptLanguageGuard throw quand la politique est block", () => {
    expect(() =>
      enforcePromptLanguageGuard({
        positivePrompt: "le héros avec cheveux bleus dans une forêt, décor",
      }),
    ).toThrow(ResidualFrenchPromptError);
  });

  it("enforcePromptLanguageGuard laisse passer quand la politique est warn", () => {
    const result = enforcePromptLanguageGuard({
      positivePrompt: "young hero with cheveux rouges",
    });
    expect(result.outcome).toBe("warn");
  });
});
