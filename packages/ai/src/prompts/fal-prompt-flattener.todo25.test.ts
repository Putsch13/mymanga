/**
 * TODO-25 (MAJEUR) — Tests du parseur tolérant SUBJECT:/[SUBJECT] et
 * de la validation post-flatten "blocs requis".
 *
 * Avant ce TODO :
 *   - le parseur ne reconnaissait que `[TAG] contenu`. Un packet construit
 *     par `prompt-blocks.ts` (qui produit `SUBJECT: ...`, `ENVIRONMENT: ...`)
 *     était reparsé en prompt vide.
 *   - aucune assertion n'empêchait un prompt FAL d'être envoyé sans
 *     personnage / action / environnement / caméra.
 */
import { describe, expect, it } from "vitest";
import {
  FalFlattenedPromptMissingBlocksError,
  assertFlattenedPromptHasRequiredBlocks,
  findMissingFalPromptBlocks,
  flattenStructuredPromptForFal,
} from "./fal-prompt-flattener";

describe("TODO-25 parser tolérant — formats SUBJECT: et [SUBJECT]", () => {
  it("reconnaît un prompt structuré au format `TAG: ...` (prompt-blocks)", () => {
    const structured = [
      "MANGA_MEDIUM: manga panel, panel composition",
      "VISUAL_STYLE: shonen ink shading, screentones",
      "SCENE_ACTION: hero charges into battle",
      "ENVIRONMENT: cyberpunk rooftop at night",
      "HERO_DESCRIPTION: Lyra, dark hair, scarred eye",
    ].join("\n");
    const out = flattenStructuredPromptForFal(structured);
    expect(out.toLowerCase()).toContain("manga panel");
    expect(out.toLowerCase()).toContain("hero charges");
    expect(out.toLowerCase()).toContain("cyberpunk rooftop");
  });

  it("reconnaît le format historique `[TAG] ...`", () => {
    const structured = [
      "[MANGA_MEDIUM] manga panel, panel composition",
      "[VISUAL_STYLE] shonen ink shading",
      "[SCENE_ACTION] hero leaps from rooftop",
      "[ENVIRONMENT] city skyline",
      "[HERO_DESCRIPTION] Lyra, scarred eye",
    ].join("\n");
    const out = flattenStructuredPromptForFal(structured);
    expect(out.toLowerCase()).toContain("manga panel");
    expect(out.toLowerCase()).toContain("hero leaps");
  });

  it("supporte un mélange `[TAG]` + `TAG:` dans le même prompt", () => {
    const structured = [
      "[MANGA_MEDIUM] manga panel",
      "VISUAL_STYLE: clean inking, screentones",
      "SCENE_ACTION: hero confronts enemy",
      "[ENVIRONMENT] dark alley",
    ].join("\n");
    const out = flattenStructuredPromptForFal(structured);
    expect(out.toLowerCase()).toContain("hero confronts");
    expect(out.toLowerCase()).toContain("dark alley");
  });
});

describe("TODO-25 assertFlattenedPromptHasRequiredBlocks", () => {
  it("ne throw pas pour un prompt complet (character + action + env + camera)", () => {
    const prompt =
      "manga panel, clean inking, hero protagonist Lux, gazing at the temple, environment: dense jungle, medium shot, eye-level angle";
    expect(findMissingFalPromptBlocks(prompt)).toEqual([]);
    expect(() => assertFlattenedPromptHasRequiredBlocks(prompt)).not.toThrow();
  });

  it("throw FalFlattenedPromptMissingBlocksError si character manque", () => {
    const prompt = "manga panel, dense jungle scenery, wide establishing shot, eye-level angle, environment lush";
    expect(() => assertFlattenedPromptHasRequiredBlocks(prompt)).toThrow(
      FalFlattenedPromptMissingBlocksError,
    );
  });

  it("liste plusieurs blocs manquants sans en oublier", () => {
    const prompt = "manga panel, clean inking, screentones, palette grayscale";
    const missing = findMissingFalPromptBlocks(prompt);
    expect(missing).toContain("character");
    expect(missing).toContain("environment");
    expect(missing).toContain("camera");
    expect(missing).toContain("action");
  });

  it("le post-flatten d'un structuré complet passe la validation", () => {
    // Le builder réel injecte le rôle (protagonist/support/...) dans
    // HERO_DESCRIPTION et un mode caméra (medium shot, eye-level...) dans
    // CANON_CONSTRAINTS. On reproduit cette forme typique.
    const structured = [
      "MANGA_MEDIUM: manga panel",
      "HERO_DESCRIPTION: hero protagonist Lux, scarred eye, in a wide stance",
      "SCENE_ACTION: Lux gazes at the temple, body tense",
      "ENVIRONMENT: dense jungle around an ancient temple",
      "CANON_CONSTRAINTS: medium shot, eye-level angle, camera framing balanced",
    ].join("\n");
    const out = flattenStructuredPromptForFal(structured);
    expect(() => assertFlattenedPromptHasRequiredBlocks(out)).not.toThrow();
  });
});
