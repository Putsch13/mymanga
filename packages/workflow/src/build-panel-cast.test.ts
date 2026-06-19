import { describe, it, expect } from "vitest";
import { buildPanelCast } from "./build-panel-cast";

const HERO = {
  id: "char-hero",
  name: "Kaito",
  roleType: "hero",
  recurrencePolicy: "permanent",
  canonicalImageUrl: "https://example.com/kaito.jpg",
};
const ANTAGONIST = {
  id: "char-antag",
  name: "Raijin",
  roleType: "antagonist",
  recurrencePolicy: "permanent",
  canonicalImageUrl: "https://example.com/raijin.jpg",
};
const NPC = {
  id: "char-npc",
  name: "Merchant",
  roleType: "recurring_npc",
  recurrencePolicy: "recurring",
  canonicalImageUrl: null,
};

describe("buildPanelCast", () => {
  it("résout le focus sur l'antagoniste quand subjectFocus=enemy", () => {
    const cast = buildPanelCast({
      panelCharacterNames: ["Kaito", "Raijin"],
      rawCharacters: [HERO, ANTAGONIST],
      subjectFocus: "enemy",
    });
    expect(cast.focus).not.toBeNull();
    expect(cast.focus!.characterId).toBe("char-antag");
    expect(cast.focus!.isFocus).toBe(true);
    expect(cast.focus!.role).toBe("antagonist");
  });

  it("résout le focus sur le héros quand subjectFocus=hero", () => {
    const cast = buildPanelCast({
      panelCharacterNames: ["Kaito", "Raijin"],
      rawCharacters: [HERO, ANTAGONIST],
      subjectFocus: "hero",
    });
    expect(cast.focus!.characterId).toBe("char-hero");
  });

  it("focus=null quand subjectFocus=environment", () => {
    const cast = buildPanelCast({
      panelCharacterNames: ["Kaito"],
      rawCharacters: [HERO],
      subjectFocus: "environment",
    });
    expect(cast.focus).toBeNull();
  });

  it("focus=null quand subjectFocus=npc mais aucun NPC dans le panel", () => {
    const cast = buildPanelCast({
      panelCharacterNames: ["Kaito"],
      rawCharacters: [HERO],
      subjectFocus: "npc",
    });
    expect(cast.focus).toBeNull();
  });

  it("résout le NPC en focus quand subjectFocus=npc", () => {
    const cast = buildPanelCast({
      panelCharacterNames: ["Kaito", "Merchant"],
      rawCharacters: [HERO, NPC],
      subjectFocus: "npc",
    });
    expect(cast.focus!.characterId).toBe("char-npc");
  });

  it("ne duplique jamais un personnage", () => {
    const cast = buildPanelCast({
      panelCharacterNames: ["Kaito", "Kaito"],
      rawCharacters: [HERO],
      subjectFocus: "hero",
    });
    const allIds = [
      cast.focus?.characterId,
      ...cast.supporting.map((m) => m.characterId),
      ...cast.background.map((m) => m.characterId),
    ].filter(Boolean);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("marque le speaker correctement", () => {
    const cast = buildPanelCast({
      panelCharacterNames: ["Kaito", "Raijin"],
      rawCharacters: [HERO, ANTAGONIST],
      subjectFocus: "hero",
      speakerName: "Raijin",
    });
    const raijin = [cast.focus, ...cast.supporting, ...cast.background]
      .filter(Boolean)
      .find((m) => m!.name === "Raijin");
    expect(raijin!.isSpeaker).toBe(true);
  });

  it("ne retombe JAMAIS sur le héros quand subjectFocus=enemy sans antagoniste", () => {
    const cast = buildPanelCast({
      panelCharacterNames: ["Kaito"],
      rawCharacters: [HERO],
      subjectFocus: "enemy",
    });
    expect(cast.focus).toBeNull();
  });
});
