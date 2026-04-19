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

describe("P0.2 — détection des contradictions de cadrage", () => {
  it("détecte 'close-up portrait' sur un panel environment", () => {
    const result = validatePreflightPanel({
      panelId: "env_1",
      positivePrompt: "wide establishing shot, close-up portrait, full environment visible",
      shotType: "wide",
      purpose: "establishing",
      mustShow: ["castle walls"],
      backgroundExtras: [],
      hasSceneKeyframe: true,
      hasCharacterLock: false,
      characterCount: 0,
      panelCategory: "ESTABLISHING_ENVIRONMENT",
      subjectFocus: "environment",
    });

    expect(result.warnings.some(w => w.includes("framing_contradiction:environment"))).toBe(true);
  });

  it("détecte 'hero panel' sur un cutaway prop", () => {
    const result = validatePreflightPanel({
      panelId: "prop_1",
      positivePrompt: "macro close-up insert panel, hero panel, object detail",
      shotType: "closeup",
      purpose: "reveal",
      mustShow: ["letter"],
      backgroundExtras: [],
      hasSceneKeyframe: false,
      hasCharacterLock: false,
      characterCount: 0,
      subjectFocus: "prop",
      cutawayType: "prop_insert",
    });

    expect(result.warnings.some(w => w.includes("framing_contradiction:prop"))).toBe(true);
  });

  it("détecte 'protagonist centered' sur un cutaway crowd", () => {
    const result = validatePreflightPanel({
      panelId: "crowd_1",
      positivePrompt: "crowd scene, multiple figures, protagonist centered, depth of field",
      shotType: "wide",
      purpose: "reaction",
      mustShow: ["marketplace crowd"],
      backgroundExtras: [],
      hasSceneKeyframe: true,
      hasCharacterLock: false,
      characterCount: 5,
      subjectFocus: "group",
      cutawayType: "crowd",
    });

    expect(result.warnings.some(w => w.includes("framing_contradiction:crowd"))).toBe(true);
  });

  it("détecte 'hero showcase' sur un cutaway reaction non-héros", () => {
    const result = validatePreflightPanel({
      panelId: "reaction_1",
      positivePrompt: "extreme close-up face, manga reaction panel, hero showcase, emotion lines",
      shotType: "extreme_closeup",
      purpose: "reaction",
      mustShow: [],
      backgroundExtras: [],
      hasSceneKeyframe: false,
      hasCharacterLock: true,
      characterCount: 2,
      subjectFocus: "reaction",
      cutawayType: "reaction_insert",
    });

    expect(result.warnings.some(w => w.includes("framing_contradiction:reaction"))).toBe(true);
  });

  it("n'émet pas de warning pour un hero panel sans subjectFocus spécial", () => {
    const result = validatePreflightPanel({
      panelId: "hero_1",
      positivePrompt: "medium shot, manga hero panel, dynamic pose, detailed costume",
      shotType: "medium",
      purpose: "action",
      mustShow: [],
      backgroundExtras: [],
      hasSceneKeyframe: true,
      hasCharacterLock: true,
      characterCount: 1,
      panelCategory: "CHARACTER_LOCK",
      subjectFocus: "hero",
    });

    expect(result.warnings.some(w => w.includes("framing_contradiction"))).toBe(false);
  });

  it("n'émet pas de warning pour un environment panel sans tokens hero", () => {
    const result = validatePreflightPanel({
      panelId: "env_clean",
      positivePrompt: "wide establishing shot, full background detail, characters small in frame, manga environmental panel",
      shotType: "wide",
      purpose: "establishing",
      mustShow: ["city skyline"],
      backgroundExtras: ["distant figures"],
      hasSceneKeyframe: true,
      hasCharacterLock: false,
      characterCount: 0,
      panelCategory: "ESTABLISHING_ENVIRONMENT",
      subjectFocus: "environment",
    });

    expect(result.warnings.filter(w => w.includes("framing_contradiction"))).toHaveLength(0);
  });
});
