import { describe, it, expect } from "vitest";
import { applyPromptAntiRepeat } from "./prompt-anti-repeat";

describe("applyPromptAntiRepeat", () => {
  it("calcule un hash stable et ne modifie pas le prompt en l'absence de collision", () => {
    const promptHashByScene = new Map<string, string>();
    const result = applyPromptAntiRepeat({
      positivePrompt: "manga panel, wide establishing, rainy rooftop",
      sceneId: "scene_1",
      promptHashByScene,
    });

    expect(result.promptHash).toHaveLength(16);
    expect(result.hadCollision).toBe(false);
    expect(result.effectivePrompt).toBe("manga panel, wide establishing, rainy rooftop");
    expect(result.antiRepeatSeed).toBeUndefined();
    expect(promptHashByScene.get("scene_1")).toBe(result.promptHash);
  });

  it("detecte une collision et applique une variation + seed", () => {
    const promptHashByScene = new Map<string, string>();
    const prompt = "manga panel, closeup, hero reaction";
    applyPromptAntiRepeat({
      positivePrompt: prompt,
      sceneId: "scene_A",
      promptHashByScene,
    });

    const second = applyPromptAntiRepeat({
      positivePrompt: prompt,
      sceneId: "scene_A",
      promptHashByScene,
    });

    expect(second.hadCollision).toBe(true);
    expect(second.antiRepeatSeed).toBeGreaterThanOrEqual(0);
    expect(second.effectivePrompt).not.toBe(prompt);
    expect(second.effectivePrompt.startsWith(prompt)).toBe(true);
    expect(second.effectivePrompt).toMatch(/camera angle|different angle|,/);
  });

  it("utilise cameraAngleHint quand disponible pour la variation", () => {
    const promptHashByScene = new Map<string, string>();
    const prompt = "manga panel, over shoulder, tense dialogue";
    applyPromptAntiRepeat({ positivePrompt: prompt, sceneId: "s1", promptHashByScene });
    const second = applyPromptAntiRepeat({
      positivePrompt: prompt,
      sceneId: "s1",
      cameraAngleHint: "low angle from behind",
      promptHashByScene,
    });
    expect(second.effectivePrompt).toContain("low angle from behind");
  });

  it("ne confond pas deux scenes differentes", () => {
    const promptHashByScene = new Map<string, string>();
    const r1 = applyPromptAntiRepeat({
      positivePrompt: "same prompt",
      sceneId: "scene_X",
      promptHashByScene,
    });
    const r2 = applyPromptAntiRepeat({
      positivePrompt: "same prompt",
      sceneId: "scene_Y",
      promptHashByScene,
    });
    expect(r1.hadCollision).toBe(false);
    expect(r2.hadCollision).toBe(false);
  });
});
