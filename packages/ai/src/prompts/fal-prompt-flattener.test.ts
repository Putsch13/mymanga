/**
 * Tests du FalPromptFlattener — Sprint A
 *
 * Invariants protégés :
 *   - le prompt commence par "manga panel" (token manga dans les 50 premiers chars)
 *   - aucun `[TAG]` résiduel dans la sortie
 *   - les sections non-visuelles (classification, story context, dialogue) sont filtrées
 *   - l'ordre de priorité est respecté : style → sujet → action → env → props → canon → interdits
 *   - la longueur est bornée
 *   - `auditFalPrompt` détecte les régressions
 */

import { describe, expect, it } from "vitest";
import type { PromptSection } from "@manga-ai-studio/core";
import {
  auditFalPrompt,
  flattenSectionsForFal,
  flattenStructuredPromptForFal,
} from "./fal-prompt-flattener";

function section(tag: PromptSection["tag"], en: string, fr = en): PromptSection {
  return { tag, languageEn: en, languageFr: fr, required: false };
}

describe("flattenSectionsForFal — invariants critiques", () => {
  it("commence par 'manga panel' même sans section VISUAL_STYLE", () => {
    const out = flattenSectionsForFal([
      section("MANGA_MEDIUM", "Manga panel, manga visual language."),
      section("SCENE_ACTION", "Scene action: hero charges into battle."),
    ]);
    expect(out.toLowerCase().startsWith("manga panel")).toBe(true);
    expect(out.toLowerCase().indexOf("manga")).toBeLessThanOrEqual(10);
  });

  it("token 'manga' apparaît dans les 50 premiers chars", () => {
    const out = flattenSectionsForFal([
      section("MANGA_MEDIUM", "Manga panel, manga visual language."),
      section("VISUAL_STYLE", "Manga reference style: shonen, inking: clean, shading: tones."),
    ]);
    const mangaIdx = out.toLowerCase().indexOf("manga");
    expect(mangaIdx).toBeLessThanOrEqual(50);
  });

  it("aucun [TAG] résiduel dans la sortie", () => {
    const out = flattenSectionsForFal([
      section("MANGA_MEDIUM", "Manga panel, manga visual language."),
      section("SCENE_ACTION", "Hero charges."),
      section("ENVIRONMENT", "Location: market. Time of day: dawn."),
    ]);
    expect(/\[[A-Z_]+\]/.test(out)).toBe(false);
  });

  it("aucun double saut de ligne", () => {
    const out = flattenSectionsForFal([
      section("MANGA_MEDIUM", "Manga panel."),
      section("SCENE_ACTION", "Scene action: fight."),
      section("ENVIRONMENT", "Location: market."),
    ]);
    expect(out.includes("\n\n")).toBe(false);
  });

  it("filtre les sections non-visuelles (CONTENT_CLASSIFICATION, STORY_CONTEXT, DIALOGUE)", () => {
    const out = flattenSectionsForFal([
      section("MANGA_MEDIUM", "Manga panel, manga visual language."),
      section("CONTENT_CLASSIFICATION", "Content rating: teen (13+), audience teen, violence moderate, sensuality mild."),
      section("STORY_CONTEXT", "Chapter \"Le sanctuaire\": hero arrives. Beat \"reveal\" (function: reveal)."),
      section("DIALOGUE_CONTEXT", "Dialogue context: Lyra: \"I see you.\"."),
      section("SCENE_ACTION", "Hero draws sword."),
    ]);
    expect(out.toLowerCase().includes("content rating")).toBe(false);
    expect(out.includes("Chapter")).toBe(false);
    expect(out.toLowerCase().includes("dialogue context")).toBe(false);
    expect(out.toLowerCase().includes("audience teen")).toBe(false);
    expect(out.toLowerCase()).toContain("hero draws sword");
  });

  it("respecte l'ordre de priorité : style → sujet → action → env", () => {
    const out = flattenSectionsForFal([
      section("ENVIRONMENT", "Location: forest. Time of day: night."),
      section("HERO_DESCRIPTION", "Hero: Lyra, silver hair."),
      section("SCENE_ACTION", "Hero runs."),
      section("MANGA_MEDIUM", "Manga panel."),
      section("VISUAL_STYLE", "Manga reference style: shonen."),
    ]);
    const idxHero = out.toLowerCase().indexOf("lyra");
    const idxAction = out.toLowerCase().indexOf("runs");
    const idxEnv = out.toLowerCase().indexOf("forest");
    // hero avant action avant env
    expect(idxHero).toBeGreaterThan(-1);
    expect(idxAction).toBeGreaterThan(idxHero);
    expect(idxEnv).toBeGreaterThan(idxAction);
  });

  it("tronque à maxLength en coupant au dernier séparateur", () => {
    const longAction = "action " + "very long description ".repeat(200);
    const out = flattenSectionsForFal(
      [
        section("MANGA_MEDIUM", "Manga panel."),
        section("SCENE_ACTION", longAction),
      ],
      { maxLength: 500 },
    );
    expect(out.length).toBeLessThanOrEqual(500);
    expect(out.toLowerCase().startsWith("manga panel")).toBe(true);
  });

  it("preserve les tokens visuels critiques : sujet, env, action", () => {
    const out = flattenSectionsForFal([
      section("MANGA_MEDIUM", "Manga panel, manga visual language."),
      section("HERO_DESCRIPTION", "Hero: Kael, dark armor, scarred face."),
      section("ENVIRONMENT", "Location: ancient ruins, moss-covered stones. Time of day: dusk."),
      section("SCENE_ACTION", "Kael raises a glowing blade."),
      section("PROP_DESCRIPTION", "Props: glowing blade (owner: hero, significance: high)."),
    ]);
    const lower = out.toLowerCase();
    expect(lower).toContain("kael");
    expect(lower).toContain("dark armor");
    expect(lower).toContain("ancient ruins");
    expect(lower).toContain("glowing blade");
  });

  it("dedoublonne le token 'manga' dans la section style", () => {
    const out = flattenSectionsForFal([
      section("MANGA_MEDIUM", "Manga panel."),
      section("VISUAL_STYLE", "Manga reference style: dark manga seinen, manga inking heavy."),
    ]);
    // le header doit rester compact "manga panel, manga linework, ..."
    // et on ne veut pas accumuler 5x le mot manga dans les 100 premiers chars
    const first100 = out.slice(0, 100).toLowerCase();
    const mangaCount = (first100.match(/\bmanga\b/g) ?? []).length;
    expect(mangaCount).toBeLessThanOrEqual(4);
  });
});

describe("flattenStructuredPromptForFal — parsing depuis un prompt [TAG] brut", () => {
  it("parse et flatten un prompt canonique brut", () => {
    const raw = [
      "[MANGA_MEDIUM] Manga panel, manga visual language.",
      "[VISUAL_STYLE] Manga reference style: shonen, inking: clean.",
      "[CONTENT_CLASSIFICATION] Content rating: teen, audience teen.",
      "[SCENE_ACTION] Scene action: hero draws sword.",
      "[ENVIRONMENT] Location: market. Time of day: noon.",
    ].join("\n");
    const out = flattenStructuredPromptForFal(raw);
    expect(out.toLowerCase().startsWith("manga panel")).toBe(true);
    expect(out.toLowerCase().includes("hero draws sword")).toBe(true);
    expect(out.toLowerCase().includes("content rating")).toBe(false);
    expect(/\[[A-Z_]+\]/.test(out)).toBe(false);
  });
});

describe("auditFalPrompt — détecteur de régressions", () => {
  it("renvoie vide pour un prompt sain", () => {
    const issues = auditFalPrompt(
      "manga panel, manga linework, hero draws sword, ancient ruins at dusk, clean inking.",
    );
    expect(issues).toEqual([]);
  });

  it("détecte un prompt qui ne commence pas par manga", () => {
    const issues = auditFalPrompt("hero draws sword, manga panel, ancient ruins.");
    expect(issues.some((i) => i.startsWith("PROMPT_NOT_MANGA_FIRST"))).toBe(true);
  });

  it("détecte le token manga trop tard", () => {
    const issues = auditFalPrompt(
      "dramatic scene with hero in a very long description that does not mention the style until much later in the prompt and here comes the manga word.",
    );
    expect(issues.some((i) => i.startsWith("MANGA_TOKEN_TOO_LATE") || i.startsWith("PROMPT_NOT_MANGA_FIRST"))).toBe(true);
  });

  it("détecte les [TAG] résiduels", () => {
    const issues = auditFalPrompt("manga panel, [STORY_CONTEXT] hero draws sword.");
    expect(issues.some((i) => i.startsWith("TAG_MARKERS_PRESENT"))).toBe(true);
  });

  it("détecte les métadonnées de classification qui leak", () => {
    const issues = auditFalPrompt(
      "manga panel, content rating: teen, audience teen, hero draws sword.",
    );
    expect(issues.some((i) => i.startsWith("CLASSIFICATION_LEAKED"))).toBe(true);
  });

  it("détecte un prompt trop court", () => {
    const issues = auditFalPrompt("manga panel, hero.");
    expect(issues.some((i) => i.startsWith("PROMPT_TOO_SHORT"))).toBe(true);
  });
});
