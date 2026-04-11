import { describe, it, expect } from "vitest";
import { inferGenreMode, getGenreDirectorConfig, buildGenreDirectorPromptHints } from "./genre-director";
import { directCombatPanel } from "./combat-panel-director";
import { directRomanceDramaScene } from "./romance-drama-director";
import { detectVisualDrift } from "./visual-drift-detector";

// ── Genre Director ────────────────────────────────────────────────────────────

describe("inferGenreMode — propagation creativityControls", () => {
  it("retourne shonen_combat pour novelty élevée et worldStrictness faible", () => {
    const mode = inferGenreMode({ noveltyLevel: 80, worldStrictness: 50 });
    expect(mode).toBe("shonen_combat");
  });

  it("retourne thriller_horror pour selectedPlotLabel=shock", () => {
    const mode = inferGenreMode({}, "shock");
    expect(mode).toBe("thriller_horror");
  });

  it("retourne romance_shojo pour selectedPlotLabel=safe", () => {
    const mode = inferGenreMode({}, "safe");
    expect(mode).toBe("romance_shojo");
  });

  it("retourne quiet_aftermath pour novelty très faible et worldStrictness élevée", () => {
    const mode = inferGenreMode({ noveltyLevel: 20, worldStrictness: 90 });
    expect(mode).toBe("quiet_aftermath");
  });

  it("retourne seinen_tension pour selectedPlotLabel=bold", () => {
    const mode = inferGenreMode({}, "bold");
    expect(mode).toBe("seinen_tension");
  });
});

describe("getGenreDirectorConfig — configuration cohérente", () => {
  it("shonen_combat a un rythme rapide et un bonus combat élevé", () => {
    const config = getGenreDirectorConfig("shonen_combat");
    expect(config.beatRhythm).toBe("fast");
    expect(config.combatReadabilityBonus).toBeGreaterThan(0);
    expect(config.panelDensity).toBe("dense");
  });

  it("romance_shojo a un rythme lent et un bonus romance élevé", () => {
    const config = getGenreDirectorConfig("romance_shojo");
    expect(config.beatRhythm).toBe("slow");
    expect(config.romanceTensionBonus).toBeGreaterThan(0);
    expect(config.panelDensity).toBe("airy");
  });

  it("buildGenreDirectorPromptHints retourne des hints non vides", () => {
    const config = getGenreDirectorConfig("seinen_tension");
    const hints = buildGenreDirectorPromptHints(config);
    expect(hints.length).toBeGreaterThan(3);
    expect(hints.some((h) => h.includes("Rythme"))).toBe(true);
  });
});

// ── Combat Director ───────────────────────────────────────────────────────────

describe("directCombatPanel — combatReadabilityBonus du genre director", () => {
  it("applique le bonus de lisibilité issu du genre director", () => {
    const withoutBonus = directCombatPanel({
      beatText: "Ryuu frappe violemment l'adversaire",
      scenePurpose: "action",
    });
    const withBonus = directCombatPanel({
      beatText: "Ryuu frappe violemment l'adversaire",
      scenePurpose: "action",
      combatReadabilityBonus: 20,
    });
    expect(withBonus.actionReadabilityScore).toBeGreaterThan(withoutBonus.actionReadabilityScore);
  });

  it("ne dépasse pas 100 même avec un bonus élevé", () => {
    const result = directCombatPanel({
      beatText: "combat intense",
      combatReadabilityBonus: 50,
    });
    expect(result.actionReadabilityScore).toBeLessThanOrEqual(100);
  });
});

// ── Romance Drama Director ────────────────────────────────────────────────────

describe("directRomanceDramaScene — beats émotionnels", () => {
  it("détecte un beat gaze_lock sur un texte de regard", () => {
    const result = directRomanceDramaScene({
      sceneText: "Ils se regardent fixement, les yeux dans les yeux.",
      involvedCharacters: ["Yuki", "Hiro"],
      currentTensionLevel: 30,
    });
    expect(result.detectedBeat).toBe("gaze_lock");
    expect(result.tensionAfter).toBeGreaterThan(30);
  });

  it("propose un beat suivant cohérent", () => {
    const result = directRomanceDramaScene({
      sceneText: "Elle hésite à parler, sa voix tremble.",
      involvedCharacters: ["Sakura"],
      currentTensionLevel: 50,
    });
    expect(result.suggestedBeat).toBeDefined();
    expect(result.suggestedBeat.panelSuggestions.length).toBeGreaterThan(0);
  });

  it("retourne une suggestion narrative avec les noms des personnages", () => {
    const result = directRomanceDramaScene({
      sceneText: "Un moment de silence s'installe.",
      involvedCharacters: ["Aoi", "Ren"],
    });
    expect(result.narrativeSuggestion).toContain("Aoi");
  });
});

// ── Visual Drift Detector — recommendedAction ─────────────────────────────────

describe("detectVisualDrift — recommendedAction et continuityRisk", () => {
  const baseCharacter = {
    name: "Ryuu",
    gender: "male",
    hairColor: "black",
    eyeColor: "red",
    bodyDetails: null,
    appearance: "tall, muscular",
    canonicalReferenceAvailable: true,
  };

  it("retourne keep pour un prompt cohérent avec refs utilisées", () => {
    const result = detectVisualDrift({
      prompt: "male character with black hair red eyes tall muscular",
      characters: [baseCharacter],
      usedLoras: true,
      usedRefs: true,
    });
    expect(result.recommendedAction).toBe("keep");
    expect(result.continuityRisk).toBe(false);
  });

  it("retourne character_reroll pour un conflit de genre", () => {
    const result = detectVisualDrift({
      prompt: "female character with blonde hair blue eyes",
      characters: [baseCharacter],
      usedLoras: false,
      usedRefs: false,
    });
    expect(result.recommendedAction).toBe("character_reroll");
    expect(result.continuityRisk).toBe(true);
  });

  it("retourne keep pour un panel décor sans conflit de personnage", () => {
    const result = detectVisualDrift({
      prompt: "wide establishing shot of a forest at night",
      characters: [],
      usedLoras: false,
      usedRefs: false,
      panelCategory: "ESTABLISHING_ENVIRONMENT",
    });
    expect(result.recommendedAction).toBe("keep");
  });

  it("retourne soft_reroll pour un score bas avec traits manquants", () => {
    const result = detectVisualDrift({
      prompt: "a character standing in the rain",
      characters: [baseCharacter],
      usedLoras: false,
      usedRefs: false,
    });
    // Score bas car traits manquants sans lock
    expect(["soft_reroll", "flag_for_review", "character_reroll"]).toContain(result.recommendedAction);
  });

  it("expose continuityRisk=true si couleur de cheveux en conflit", () => {
    const result = detectVisualDrift({
      prompt: "male character with blonde hair red eyes",
      characters: [baseCharacter],
      usedLoras: false,
      usedRefs: false,
    });
    expect(result.continuityRisk).toBe(true);
  });
});
