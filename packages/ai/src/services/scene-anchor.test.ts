import { describe, expect, it } from "vitest";
import {
  buildSceneAnchor,
  buildSceneAnchorPromptBlock,
  composeProjectStyleAnchor,
} from "./scene-anchor";

describe("buildSceneAnchor — anchor-by-scene (Option 1)", () => {
  it("construit un anchor minimal sans ancres établies", () => {
    const anchor = buildSceneAnchor({
      sceneId: "scene_1",
      castLineup: ["Robin", "Florent"],
      location: "ruelle cyberpunk",
      mood: "tense",
    });
    expect(anchor.sceneId).toBe("scene_1");
    expect(anchor.dominantLocation).toBe("ruelle cyberpunk");
    expect(anchor.characterPositions).toEqual({ Robin: "left", Florent: "center" });
    expect(anchor.mainCastAnchors).toEqual([]);
    expect(anchor.recurringNpcAnchors).toEqual([]);
    expect(anchor.establishedLocationBrief).toBeNull();
    expect(anchor.styleAnchor).toBeNull();
  });

  it("persiste les ancres établies (style, lieu, cast, PNJ récurrents)", () => {
    const anchor = buildSceneAnchor({
      sceneId: "scene_2",
      castLineup: ["Robin"],
      location: "toit de la tour Naka",
      mood: "dramatic",
      establishedLocationBrief: "néons bleus, dalles de béton, panneaux publicitaires holographiques",
      mainCastAnchors: [
        { name: "Robin", shortVisualCore: "female, black hair, red eyes, signature outfit: long coat" },
      ],
      recurringNpcAnchors: [
        { label: "mercenaire fidèle", shortVisualCore: "tall man, scarred face", outfitSignature: "kevlar tactical" },
      ],
      styleAnchor: "cyberpunk neon aesthetic, rain-slicked streets",
    });
    expect(anchor.establishedLocationBrief).toContain("néons bleus");
    expect(anchor.mainCastAnchors).toHaveLength(1);
    expect(anchor.recurringNpcAnchors).toHaveLength(1);
    expect(anchor.styleAnchor).toContain("cyberpunk");
  });
});

describe("buildSceneAnchorPromptBlock", () => {
  it("n'inclut PAS les blocs d'ancrage établi si absents", () => {
    const anchor = buildSceneAnchor({
      sceneId: "s1",
      castLineup: ["Robin"],
      location: "ruelle",
      mood: "tense",
    });
    const block = buildSceneAnchorPromptBlock(anchor);
    expect(block).toContain("Scene anchor:");
    expect(block).not.toContain("Project style lock");
    expect(block).not.toContain("Canonical location brief");
    expect(block).not.toContain("Main cast visual lock");
    expect(block).not.toContain("Recurring NPC visual lock");
  });

  it("injecte TOUS les blocs d'ancrage établi quand fournis", () => {
    const anchor = buildSceneAnchor({
      sceneId: "s1",
      castLineup: ["Robin"],
      location: "toit de la tour Naka",
      mood: "dramatic",
      establishedLocationBrief: "néons bleus, béton, panneaux holographiques",
      mainCastAnchors: [
        { name: "Robin", shortVisualCore: "female, black hair, red eyes" },
      ],
      recurringNpcAnchors: [
        { label: "mercenaire fidèle", shortVisualCore: "tall scarred man", outfitSignature: "kevlar tactical" },
      ],
      styleAnchor: "cyberpunk neon aesthetic",
    });
    const block = buildSceneAnchorPromptBlock(anchor);
    expect(block).toContain("Project style lock: cyberpunk neon aesthetic");
    expect(block).toContain("Canonical location brief");
    expect(block).toContain("néons bleus");
    expect(block).toContain("Main cast visual lock");
    expect(block).toContain("Robin: female, black hair, red eyes");
    expect(block).toContain("Recurring NPC visual lock");
    expect(block).toContain("mercenaire fidèle");
    expect(block).toContain("[outfit: kevlar tactical]");
  });

  it("tronque un brief de lieu trop long à 220 caractères", () => {
    const longBrief = "a".repeat(500);
    const anchor = buildSceneAnchor({
      sceneId: "s1",
      castLineup: [],
      location: "lieu",
      mood: "calm",
      establishedLocationBrief: longBrief,
    });
    const block = buildSceneAnchorPromptBlock(anchor);
    const match = block.match(/Canonical location brief[^:]*: (a+)/);
    expect(match).not.toBeNull();
    expect(match![1]!.length).toBe(220);
  });

  it("limite main cast à 4 et PNJ à 3 dans le bloc prompt", () => {
    const anchor = buildSceneAnchor({
      sceneId: "s1",
      castLineup: [],
      location: "lieu",
      mood: "calm",
      mainCastAnchors: Array.from({ length: 6 }, (_, i) => ({
        name: `Char${i}`,
        shortVisualCore: "core",
      })),
      recurringNpcAnchors: Array.from({ length: 6 }, (_, i) => ({
        label: `Npc${i}`,
        shortVisualCore: "core",
      })),
    });
    const block = buildSceneAnchorPromptBlock(anchor);
    expect(block).toContain("Char0");
    expect(block).toContain("Char3");
    expect(block).not.toContain("Char4");
    expect(block).toContain("Npc0");
    expect(block).toContain("Npc2");
    expect(block).not.toContain("Npc3");
  });
});

describe("composeProjectStyleAnchor", () => {
  it("retourne null si aucun genre fourni", () => {
    expect(composeProjectStyleAnchor({ genre: null, tone: null, visualStyle: null })).toBeNull();
    expect(composeProjectStyleAnchor({ genre: "", tone: "", visualStyle: "" })).toBeNull();
    expect(composeProjectStyleAnchor({ genre: "  ", tone: null, visualStyle: null })).toBeNull();
  });

  it("produit une signature cyberpunk avec tone brutal", () => {
    const style = composeProjectStyleAnchor({
      genre: "cyberpunk",
      tone: "sombre et brutal",
      visualStyle: "manga",
    });
    expect(style).toBeTruthy();
    expect(style).toContain("cyberpunk");
    expect(style).toContain("neon");
    expect(style).toContain("brutal");
    expect(style).toContain("manga rendering");
  });

  it("produit une signature fantasy de base sans tone", () => {
    const style = composeProjectStyleAnchor({
      genre: "fantasy",
      tone: null,
      visualStyle: "manga",
    });
    expect(style).toContain("fantasy manga");
    expect(style).toContain("manga rendering");
  });

  it("fallback gracieux sur un genre inconnu", () => {
    const style = composeProjectStyleAnchor({
      genre: "steampunk-pirate",
      tone: null,
      visualStyle: "manga",
    });
    expect(style).toContain("steampunk-pirate");
    expect(style).toContain("consistent visual identity");
  });

  it("détecte un genre composé via substring (dark fantasy)", () => {
    const style = composeProjectStyleAnchor({
      genre: "dark fantasy grim",
      tone: null,
      visualStyle: "manga",
    });
    expect(style).toContain("dark fantasy");
    expect(style).toContain("desaturated");
  });
});
