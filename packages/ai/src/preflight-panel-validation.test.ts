import { describe, expect, it } from "vitest";
import { validatePreflightPanel } from "./preflight-panel-validation";

describe("validatePreflightPanel", () => {
  it("bloque un panel narratif sans keyframe ni signaux d'environnement", () => {
    const result = validatePreflightPanel({
      panelId: "panel_1",
      positivePrompt: "wide scene",
      shotType: "wide",
      purpose: "establishing",
      mustShow: [],
      backgroundExtras: [],
      hasSceneKeyframe: false,
      hasCharacterLock: false,
      characterCount: 2,
    });

    expect(result.ok).toBe(false);
    // missing_scene_keyframe est désormais un avertissement (non bloquant)
    expect(result.warnings).toContain("missing_scene_keyframe");
    expect(result.reasons).toContain("missing_environment_signals");
  });

  it("autorise un panel narratif sans keyframe tant que les signaux d'environnement sont présents", () => {
    const result = validatePreflightPanel({
      panelId: "panel_1b",
      positivePrompt: "wide scene of a market",
      shotType: "wide",
      purpose: "establishing",
      mustShow: ["marketplace stalls"],
      backgroundExtras: ["passing crowd"],
      hasSceneKeyframe: false,
      hasCharacterLock: false,
      characterCount: 2,
    });

    expect(result.ok).toBe(true);
    expect(result.warnings).toContain("missing_scene_keyframe");
    expect(result.reasons).toHaveLength(0);
  });

  it("autorise un panel verrouillé correctement", () => {
    const result = validatePreflightPanel({
      panelId: "panel_2",
      positivePrompt: "clear panel with environment",
      shotType: "medium",
      purpose: "dialogue",
      mustShow: ["school architecture"],
      backgroundExtras: ["students in depth"],
      hasSceneKeyframe: true,
      hasCharacterLock: true,
      characterCount: 2,
    });

    expect(result.ok).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });
});
