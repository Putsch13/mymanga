import { describe, expect, it } from "vitest";
import { resolveDialogueSpeakerId } from "./resolve-dialogue-speaker-id";

const characters = [
  { id: "char_lux", name: "Lux", aliases: ["Lux le marin"] },
  { id: "char_kai", name: "Kai" },
];

const npcGroups = [
  { id: "npc_pecheurs", keywords: ["pecheur", "pêcheur"], label: "Pêcheurs" },
  { id: "npc_gardes", keywords: ["garde"], label: "Gardes royaux" },
];

describe("resolveDialogueSpeakerId (TODO-29)", () => {
  it("matche un personnage par nom canon (case insensible, accent insensible)", () => {
    const r = resolveDialogueSpeakerId({
      label: "lux",
      characters,
      npcGroups,
    });
    expect(r).toEqual({
      speakerId: "char_lux",
      speakerType: "character",
      matchedOn: "exact_name",
    });
  });

  it("matche un personnage via un alias", () => {
    const r = resolveDialogueSpeakerId({
      label: "Lux le marin",
      characters,
      npcGroups,
    });
    expect(r.speakerId).toBe("char_lux");
    expect(r.matchedOn).toBe("alias");
  });

  it("matche un groupe PNJ via un mot-clé (Pêcheurs / pecheur)", () => {
    const r = resolveDialogueSpeakerId({
      label: "Les pêcheurs du port",
      characters,
      npcGroups,
    });
    expect(r.speakerId).toBe("npc_pecheurs");
    expect(r.speakerType).toBe("npc_group");
  });

  it("matche un groupe PNJ via son label visible", () => {
    const r = resolveDialogueSpeakerId({
      label: "Gardes royaux",
      characters,
      npcGroups,
    });
    expect(r.speakerId).toBe("npc_gardes");
  });

  it("retourne null si aucun match", () => {
    const r = resolveDialogueSpeakerId({
      label: "Le boulanger",
      characters,
      npcGroups,
    });
    expect(r.speakerId).toBeNull();
    expect(r.speakerType).toBeNull();
  });

  it("retourne null sur label vide / null", () => {
    expect(
      resolveDialogueSpeakerId({ label: "", characters, npcGroups }).speakerId,
    ).toBeNull();
    expect(
      resolveDialogueSpeakerId({ label: null, characters, npcGroups }).speakerId,
    ).toBeNull();
  });

  it("priorise un match exact personnage devant un keyword PNJ partiel", () => {
    // Edge case : si un personnage s'appelle exactement "Garde" et qu'un
    // PNJ a aussi le keyword "garde", on doit privilégier le personnage.
    const charsWithGuard = [{ id: "char_garde", name: "Garde" }];
    const r = resolveDialogueSpeakerId({
      label: "Garde",
      characters: charsWithGuard,
      npcGroups,
    });
    expect(r.speakerId).toBe("char_garde");
    expect(r.speakerType).toBe("character");
  });
});
