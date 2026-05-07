/**
 * P0.13 — ChapterGenerationContract : hashes de provenance (plus de « n/a »).
 */
import { describe, expect, it } from "vitest";
import {
  buildChapterGenerationContractFromPremiumPlan,
  parseVisualWorldContract,
  validateChapterGenerationContract,
  type ChapterCastContract,
  type ChapterGenerationContract,
} from "@manga-ai-studio/core";

function minimalCast(): ChapterCastContract {
  return {
    chapterId: "ch-1",
    heroCharacterId: "hero-1",
    activeCharacterIds: ["hero-1"],
    supportCharacterIds: [],
    antagonistCharacterIds: [],
    npcGroups: [],
    members: [
      {
        characterId: "hero-1",
        name: "Ken",
        role: "hero",
        allowsCloseup: true,
        canSpeak: true,
        requiredInBeatIds: [],
        forbiddenInBeatIds: [],
      },
    ],
  };
}

describe("ChapterGenerationContract (P0.13 source hashes)", () => {
  it("buildChapterGenerationContractFromPremiumPlan produit 8 hashes non vides et jamais « n/a »", () => {
    const cast = minimalCast();
    const contract = buildChapterGenerationContractFromPremiumPlan({
      projectId: "proj-1",
      chapterId: "ch-1",
      chapterNumber: 1,
      outlineBeats: [{ id: "b1", summary: "Ouverture sous la pluie." }],
      panelBlueprints: [
        {
          panelId: "p1",
          beatId: "b1",
          panelNumber: 1,
          purpose: "Le héros traverse la rue sous la pluie.",
          shotType: "wide",
          cameraAngle: "eye_level",
          subjectFocus: "character",
          mustShowEnemy: false,
          requiredNpcCount: 0,
          requiredLocationSignals: [],
          cutawayType: "none",
          heroCenterAllowed: true,
          criticality: "medium",
          mustShowCharacterIds: ["hero-1"],
        },
      ],
      heroCharacterId: "hero-1",
      focusCharacterIds: ["hero-1"],
      characters: [
        {
          id: "hero-1",
          name: "Ken",
          faceRefUrl: "https://example.com/face.png",
          loraUrl: null,
        },
      ],
      locations: [{ id: "loc-1", name: "Rue", visualDescription: "Cyberpunk, pluie." }],
      sourceHashMaterial: {
        chapterUserIntent: "Introduire le héros dans une ville sous la pluie.",
        castContract: cast,
      },
    });

    const src = contract.source;
    for (const key of [
      "userIntentHash",
      "approvedOutlineHash",
      "productionPlanHash",
      "characterCanonHash",
      "locationCanonHash",
      "visualWorldHash",
      "dialogueContractHash",
      "castContractHash",
    ] as const) {
      expect(typeof src[key]).toBe("string");
      expect(src[key].length).toBeGreaterThan(3);
      expect(src[key].toLowerCase()).not.toBe("n/a");
    }
  });

  it("validateChapterGenerationContract premium rejette un hash « n/a »", () => {
    const cast = minimalCast();
    const good = buildChapterGenerationContractFromPremiumPlan({
      projectId: "proj-1",
      chapterId: "ch-1",
      chapterNumber: 1,
      outlineBeats: [{ id: "b1", summary: "Ouverture sous la pluie." }],
      panelBlueprints: [
        {
          panelId: "p1",
          beatId: "b1",
          panelNumber: 1,
          purpose: "Le héros traverse la rue sous la pluie.",
          shotType: "wide",
          cameraAngle: "eye_level",
          subjectFocus: "character",
          mustShowEnemy: false,
          requiredNpcCount: 0,
          requiredLocationSignals: [],
          cutawayType: "none",
          heroCenterAllowed: true,
          criticality: "medium",
          mustShowCharacterIds: ["hero-1"],
        },
      ],
      heroCharacterId: "hero-1",
      focusCharacterIds: ["hero-1"],
      characters: [
        {
          id: "hero-1",
          name: "Ken",
          faceRefUrl: "https://example.com/face.png",
        },
      ],
      locations: [{ id: "loc-1", name: "Rue", visualDescription: "Pluie." }],
      sourceHashMaterial: { castContract: cast },
    });

    const tampered: ChapterGenerationContract = {
      ...good,
      source: {
        ...good.source,
        visualWorldHash: "n/a",
      },
    };
    const { valid, issues } = validateChapterGenerationContract(tampered, {
      premiumOnly: true,
      skipHeroVisualRef: false,
      enforceEntitySources: false,
    });
    expect(valid).toBe(false);
    expect(issues.some((i) => i.startsWith("source_hash_invalid:"))).toBe(true);
  });

  it("chapterIntentContractJson prime sur chapterUserIntent pour l’empreinte intention", () => {
    const cast = minimalCast();
    const common = {
      projectId: "proj-1",
      chapterId: "ch-1",
      chapterNumber: 1,
      outlineBeats: [{ id: "b1", summary: "Ouverture." }],
      panelBlueprints: [
        {
          panelId: "p1",
          beatId: "b1",
          panelNumber: 1,
          purpose: "Le héros traverse la rue sous la pluie.",
          shotType: "wide",
          cameraAngle: "eye_level",
          subjectFocus: "character" as const,
          mustShowEnemy: false,
          requiredNpcCount: 0,
          requiredLocationSignals: [] as string[],
          cutawayType: "none" as const,
          heroCenterAllowed: true,
          criticality: "medium" as const,
          mustShowCharacterIds: ["hero-1"],
        },
      ],
      heroCharacterId: "hero-1",
      focusCharacterIds: ["hero-1"],
      characters: [{ id: "hero-1", name: "Ken", faceRefUrl: "https://example.com/face.png" }],
      locations: [{ id: "loc-1", name: "Rue", visualDescription: "Pluie." }],
    };
    const withRawOnly = buildChapterGenerationContractFromPremiumPlan({
      ...common,
      sourceHashMaterial: {
        chapterUserIntent: "même texte brut",
        castContract: cast,
      },
    });
    const withCompiled = buildChapterGenerationContractFromPremiumPlan({
      ...common,
      sourceHashMaterial: {
        chapterUserIntent: "même texte brut",
        chapterIntentContractJson: JSON.stringify({
          understoodPitch: "Pitch compilé unique",
          confidenceScore: 0.9,
        }),
        castContract: cast,
      },
    });
    expect(withRawOnly.source.userIntentHash).not.toEqual(withCompiled.source.userIntentHash);
  });

  it("dialogueContractJson prime sur l’empreinte dérivée des blueprints", () => {
    const cast = minimalCast();
    const common = {
      projectId: "proj-1",
      chapterId: "ch-1",
      chapterNumber: 1,
      outlineBeats: [{ id: "b1", summary: "Ouverture." }],
      panelBlueprints: [
        {
          panelId: "p1",
          beatId: "b1",
          panelNumber: 1,
          purpose: "Le héros traverse la rue sous la pluie.",
          shotType: "wide",
          cameraAngle: "eye_level",
          subjectFocus: "character" as const,
          mustShowEnemy: false,
          requiredNpcCount: 0,
          requiredLocationSignals: [] as string[],
          cutawayType: "none" as const,
          heroCenterAllowed: true,
          criticality: "medium" as const,
          mustShowCharacterIds: ["hero-1"],
          dialogueLines: [{ speaker: "Ken", text: "Salut.", characterId: "hero-1" }],
        },
      ],
      heroCharacterId: "hero-1",
      focusCharacterIds: ["hero-1"],
      characters: [{ id: "hero-1", name: "Ken", faceRefUrl: "https://example.com/face.png" }],
      locations: [{ id: "loc-1", name: "Rue", visualDescription: "Pluie." }],
    };
    const fromBlueprintsOnly = buildChapterGenerationContractFromPremiumPlan({
      ...common,
      sourceHashMaterial: { castContract: cast },
    });
    const withDialogueContract = buildChapterGenerationContractFromPremiumPlan({
      ...common,
      sourceHashMaterial: {
        castContract: cast,
        dialogueContractJson: JSON.stringify({
          chapterId: "ch-1",
          lines: [
            {
              panelId: "p1",
              speakerId: "hero-1",
              speakerName: "Ken",
              text: "Phrase studio validée.",
              speakerVisible: true,
              dialogueType: "speech",
            },
          ],
          totalLines: 1,
          panelsWithDialogue: 1,
          uniqueSpeakers: ["hero-1"],
        }),
      },
    });
    expect(fromBlueprintsOnly.source.dialogueContractHash).not.toEqual(
      withDialogueContract.source.dialogueContractHash,
    );
  });

  it("P0.11 / P0.12 — visualWorld enrichit beats / panels (lieu, PNJ, créature, véhicule, faction)", () => {
    const cast = minimalCast();
    const vw = parseVisualWorldContract({
      chapterId: "ch-1",
      source: "studio_curated",
      locations: [
        {
          id: "loc-rain",
          label: "Rue pluvieuse",
          kind: "street",
          description: "Rue cyberpunk sous la pluie",
          visualAnchors: ["néons"],
          architecture: ["immeubles"],
          lighting: ["bleu"],
          atmosphere: ["humide"],
          recurringProps: [],
          negativeConstraints: [],
          source: "user_canon",
          canonPolicy: "locked",
        },
      ],
      props: [],
      npcGroups: [
        {
          id: "npc-g1",
          label: "Foule",
          role: "crowd",
          visualProfile: "silhouettes",
          outfit: "manteaux sombres",
          silhouette: "dense",
          requiredBeatIds: ["b1"],
          recurrencePolicy: "background",
        },
      ],
      creatures: [
        {
          id: "creature-1",
          label: "Loup mécanique",
          visualDescription: "Métal brossé, yeux rouges",
          requiredBeatIds: ["b1"],
          threatLevel: "high",
        },
      ],
      vehicles: [
        {
          id: "veh-1",
          label: "Van tactique",
          visualDescription: "Blindé noir, gyrophares bleus",
          requiredBeatIds: ["b1"],
          scale: "large",
        },
      ],
      factions: [
        {
          id: "fac-1",
          label: "Syndicat Orion",
          visualMarkers: ["patch œil"],
          visualMotifs: ["triangles"],
          colors: ["violet", "noir"],
          emblem: "œil stylisé",
          requiredBeatIds: ["b1"],
        },
      ],
      beatBindings: [
        {
          beatId: "b1",
          locationId: "loc-rain",
          primaryPropIds: [],
          npcGroupIds: ["npc-g1"],
          creatureIds: ["creature-1"],
          vehicleIds: ["veh-1"],
          factionIds: ["fac-1"],
        },
      ],
    });

    const contract = buildChapterGenerationContractFromPremiumPlan({
      projectId: "proj-1",
      chapterId: "ch-1",
      chapterNumber: 1,
      outlineBeats: [{ id: "b1", summary: "Confrontation." }],
      panelBlueprints: [
        {
          panelId: "p1",
          beatId: "b1",
          panelNumber: 1,
          purpose: "Le héros affronte la créature sous la pluie.",
          shotType: "wide",
          cameraAngle: "eye_level",
          subjectFocus: "duo",
          mustShowEnemy: false,
          requiredNpcCount: 0,
          requiredLocationSignals: [],
          cutawayType: "none",
          heroCenterAllowed: true,
          criticality: "high",
          mustShowCharacterIds: ["hero-1"],
        },
      ],
      heroCharacterId: "hero-1",
      focusCharacterIds: ["hero-1"],
      characters: [{ id: "hero-1", name: "Ken", faceRefUrl: "https://example.com/face.png" }],
      locations: [{ id: "loc-rain", name: "Rue", visualDescription: "Pluie." }],
      visualWorld: vw,
      sourceHashMaterial: { castContract: cast },
    });

    expect(contract.beats[0].requiredLocationId).toBe("loc-rain");
    expect(contract.beats[0].requiredNpcGroups).toContain("npc-g1");
    expect(contract.beats[0].requiredCreatures).toContain("creature-1");
    expect(contract.beats[0].requiredVehicles).toContain("veh-1");
    expect(contract.beats[0].requiredFactions).toContain("fac-1");
    expect(contract.panels[0].requiredLocationId).toBe("loc-rain");
    expect(contract.panels[0].requiredNpcGroups).toContain("npc-g1");
    expect(contract.panels[0].requiredCreatures).toContain("creature-1");
    expect(contract.panels[0].requiredVehicles).toContain("veh-1");
    expect(contract.panels[0].requiredFactions).toContain("fac-1");
    expect(contract.npcGroups.some((g) => g.groupId === "npc-g1")).toBe(true);
    expect(contract.creatures.some((c) => c.creatureId === "creature-1")).toBe(true);
    expect(contract.vehicles.some((v) => v.vehicleId === "veh-1")).toBe(true);
    expect(contract.factions.some((f) => f.factionId === "fac-1")).toBe(true);
  });
});
