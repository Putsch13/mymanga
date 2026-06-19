import { describe, expect, it } from "vitest";
import {
  addCharacterEntry,
  addEnvironmentEntry,
  createEmptyChapterVisualMemory,
  MissingMainCharacterRefError,
  resolvePanelReferences,
} from "./chapter-visual-memory";

describe("chapter-visual-memory", () => {
  it("lève MissingMainCharacterRefError si un hero est demandé sans ref", () => {
    const m = createEmptyChapterVisualMemory("c");
    expect(() =>
      resolvePanelReferences(m, {
        characterIds: ["hero-1"],
        mainCharacterIds: ["hero-1"],
      }),
    ).toThrow(MissingMainCharacterRefError);
  });

  it("retourne une ref perso quand disponible", () => {
    const m = createEmptyChapterVisualMemory("c");
    addCharacterEntry(m, {
      characterId: "hero-1",
      name: "Hero",
      role: "hero",
      faceRefUrl: "https://x/face.png",
      silhouetteRefUrl: null,
      outfitRefUrl: null,
      defaultWeight: 1,
    });
    const r = resolvePanelReferences(m, {
      characterIds: ["hero-1"],
      mainCharacterIds: ["hero-1"],
    });
    expect(r.characterRefs.length).toBe(1);
    expect(r.characterRefs[0]!.url).toContain("face.png");
  });

  it("résout un anchor environnement par anchorId (pas de fallback sur 3 premiers mots du prompt)", () => {
    const m = createEmptyChapterVisualMemory("c");
    addEnvironmentEntry(m, {
      anchorId: "ENV_LAB_01",
      locationId: "lab",
      locationName: "Laboratoire",
      refUrl: "https://x/env.png",
      defaultWeight: 0.8,
    });
    const r = resolvePanelReferences(m, {
      characterIds: [],
      environmentAnchorId: "ENV_LAB_01",
    });
    expect(r.environmentRefs[0]!.url).toBe("https://x/env.png");
  });
});
