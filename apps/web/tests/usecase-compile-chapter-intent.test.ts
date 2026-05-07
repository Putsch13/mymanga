import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildRawUserIntent,
  compileChapterIntentUsecase,
  UsecaseFailure,
} from "@/server/usecases";

describe("compileChapterIntentUsecase", () => {
  const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = ORIGINAL_KEY;
  });

  it("buildRawUserIntent priorise rawUserIntent quand fourni", () => {
    const raw = buildRawUserIntent({
      rawUserIntent: "Idée principale",
      shortPitch: "ne devrait pas être utilisé",
    });
    expect(raw).toBe("Idée principale");
  });

  it("buildRawUserIntent concatène les champs studio si rawUserIntent absent", () => {
    const raw = buildRawUserIntent({
      shortPitch: "Le héros affronte un dragon",
      mustHappen: "le combat se déroule sur un pont",
      mustNot: "pas de mort",
      wish: "je veux du suspense",
    });
    expect(raw).toContain("Le héros affronte un dragon");
    expect(raw).toContain("le combat se déroule sur un pont");
    expect(raw).toContain("pas de mort");
    expect(raw).toContain("je veux du suspense");
  });

  it("rejette une intention trop courte avec UsecaseFailure(INTENT_RAW_TOO_SHORT)", async () => {
    await expect(
      compileChapterIntentUsecase.execute({ shortPitch: "court" }),
    ).rejects.toMatchObject({
      name: "UsecaseFailure",
      code: "INTENT_RAW_TOO_SHORT",
    });
  });

  it("compile en heuristique quand pas d’API key", async () => {
    const out = await compileChapterIntentUsecase.execute({
      shortPitch: "Le héros affronte un boss final dans une cathédrale en ruines",
      mustHappen: "le mentor sacrifie sa vie",
      pacing: "fast",
      dialogueLevel: "low",
    });
    expect(out.usedAi).toBe(false);
    expect(out.contract.understoodPitch.length).toBeGreaterThan(0);
    expect(out.contract.pacing).toBe("fast");
    expect(out.contract.dialogueDensity).toBe("low");
    expect(out.contract.confidenceScore).toBeGreaterThan(0);
    expect(out.contract.confidenceScore).toBeLessThanOrEqual(1);
  });

  it("UsecaseFailure expose un code stable typé", async () => {
    try {
      await compileChapterIntentUsecase.execute({});
      throw new Error("attendu : UsecaseFailure");
    } catch (err) {
      expect(err).toBeInstanceOf(UsecaseFailure);
      if (err instanceof UsecaseFailure) {
        expect(err.code).toBe("INTENT_RAW_TOO_SHORT");
      }
    }
  });
});
