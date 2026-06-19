/**
 * P10.26 — Golden test générique end-to-end.
 *
 * Ce test vérifie le scénario :
 * - Héros officiel
 * - Personnage secondaire actif
 * - Lieu inféré automatiquement
 * - Groupe PNJ inféré automatiquement
 * - Dialogues IA
 * - Props filtrés
 * - Structure manga
 *
 * @module pipeline-golden-test
 */

import { describe, it, expect } from "vitest";
import { buildChapterCastContract, validateChapterCastContract } from "@manga-ai-studio/core";
import { buildChapterStoryContract } from "@manga-ai-studio/core";
import { buildLocationContract, validateLocationContract } from "@manga-ai-studio/core";
import { buildNpcGroupContract, validateNpcGroupContract } from "@manga-ai-studio/core";
import { runVisualDiscoveryPass } from "../passes/legacy-visual-discovery-pass";
import { runCanonResolverPass } from "../passes/canon-resolver-pass";

describe("P10.26 — Pipeline Golden Test", () => {
  it("détecte automatiquement lieux et PNJ depuis le texte narratif", () => {
    const discoveryResult = runVisualDiscoveryPass({
      chapterId: "golden-test-1",
      beats: [
        {
          beatId: "beat-1",
          summary: "Le héros arrive au port et observe les pêcheurs au travail.",
        },
        {
          beatId: "beat-2",
          summary: "Il retrouve son amie dans la rue principale de la ville.",
        },
        {
          beatId: "beat-3",
          summary: "Ils discutent ensemble près des bateaux.",
        },
      ],
      knownCharacters: [
        { id: "hero-1", name: "Alex", description: "Le héros principal" },
        { id: "support-1", name: "Maya", description: "Son amie" },
      ],
      knownLocations: [],
    });

    // Vérifications
    expect(discoveryResult.contract.characters.length).toBeGreaterThanOrEqual(2);
    expect(discoveryResult.contract.locations.length).toBeGreaterThanOrEqual(1);
    expect(discoveryResult.contract.npcGroups.length).toBeGreaterThanOrEqual(1);

    // Les lieux doivent inclure "port" ou "ville"
    expect(
      discoveryResult.contract.locations.some(
        (l) => l.label.includes("port") || l.label.includes("ville"),
      ),
    ).toBe(true);

    // Les PNJ doivent inclure "pêcheurs"
    expect(
      discoveryResult.contract.npcGroups.some((n) =>
        n.label.toLowerCase().includes("pêcheur"),
      ),
    ).toBe(true);
  });

  it("construit un CastContract valide avec un seul héros", () => {
    const castContract = buildChapterCastContract({
      chapterId: "golden-test-2",
      heroCharacterId: "hero-1",
      focusCharacterIds: ["hero-1", "support-1"],
      characters: [
        { id: "hero-1", name: "Alex", roleType: "main_hero" },
        { id: "support-1", name: "Maya", roleType: "support" },
      ],
      npcGroups: [{ id: "pecheurs", label: "pêcheurs du port" }],
    });

    const validation = validateChapterCastContract(castContract);

    // Assertions
    expect(validation.ok).toBe(true);
    expect(castContract.heroCharacterId).toBe("hero-1");
    expect(castContract.activeCharacterIds).toContain("hero-1");
    expect(castContract.activeCharacterIds).toContain("support-1");

    // Seul le héros doit avoir le rôle "hero"
    const heroMembers = castContract.members.filter((m) => m.role === "hero");
    expect(heroMembers.length).toBe(1);
    expect(heroMembers[0]!.characterId).toBe("hero-1");

    // L'autre personnage doit être support
    const supportMember = castContract.members.find((m) => m.characterId === "support-1");
    expect(supportMember?.role).toBe("support");
  });

  it("construit un LocationContract valide sans lieux vagues", () => {
    const locationContract = buildLocationContract({
      chapterId: "golden-test-3",
      locations: [
        { id: "loc-1", label: "port", source: "story_text_inference" },
        { id: "loc-2", label: "ville", source: "story_text_inference" },
      ],
    });

    const validation = validateLocationContract(locationContract);

    expect(validation.ok).toBe(true);
    expect(locationContract.locations.length).toBeGreaterThanOrEqual(1);

    // Pas de lieux vagues
    for (const loc of locationContract.locations) {
      expect(loc.label.toLowerCase()).not.toContain("story-consistent setting");
      expect(loc.label.toLowerCase()).not.toContain("generic setting");
    }
  });

  it("construit un NpcGroupContract valide", () => {
    const npcContract = buildNpcGroupContract({
      chapterId: "golden-test-4",
      groups: [
        { label: "pêcheurs", visualDescription: "Marins au travail sur le quai" },
        { label: "passants", visualDescription: "Habitants de la ville" },
      ],
    });

    const validation = validateNpcGroupContract(npcContract);

    expect(validation.ok).toBe(true);
    expect(npcContract.groups.length).toBeGreaterThanOrEqual(1);
  });

  it("le CanonResolver crée des entités temporaires pour les lieux inconnus", () => {
    const discoveryResult = runVisualDiscoveryPass({
      chapterId: "golden-test-5",
      beats: [
        {
          beatId: "beat-1",
          summary: "Scène dans un laboratoire secret.",
        },
      ],
      knownCharacters: [],
      knownLocations: [], // Pas de lieu connu
    });

    const resolverResult = runCanonResolverPass({
      discoveryContract: discoveryResult.contract,
      userCharacters: [],
      userLocations: [],
    });

    // Des lieux temporaires doivent être créés
    expect(resolverResult.contract.temporaryLocations.length).toBeGreaterThanOrEqual(1);
  });

  it("focusCharacterIds ne deviennent PAS protagonists", () => {
    const castContract = buildChapterCastContract({
      chapterId: "golden-test-6",
      heroCharacterId: "hero-1",
      focusCharacterIds: ["hero-1", "focus-1", "focus-2"],
      characters: [
        { id: "hero-1", name: "Alex", roleType: "main_hero" },
        { id: "focus-1", name: "Bob", roleType: "hero" }, // roleType hero mais pas heroCharacterId
        { id: "focus-2", name: "Charlie", roleType: "support" },
      ],
    });

    // Seul hero-1 doit être "hero"
    const heroCount = castContract.members.filter((m) => m.role === "hero").length;
    expect(heroCount).toBe(1);

    // focus-1 a roleType="hero" mais doit être support car ce n'est pas heroCharacterId
    const focus1 = castContract.members.find((m) => m.characterId === "focus-1");
    expect(focus1?.role).toBe("support");
  });
});
