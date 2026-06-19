/**
 * P5.19 — Golden test "Marius au port"
 *
 * Ce test vérifie que le pipeline premium génère correctement un chapitre
 * de référence : "Marius revient au port et retrouve Maya".
 *
 * Scénario de référence :
 * - Héros : Marius (homme, 30 ans, pêcheur)
 * - Support : Maya (femme, 28 ans, amie d'enfance)
 * - Lieu : Port de pêche méditerranéen
 * - Arc émotionnel : arrivée → nostalgie → reconnaissance → gêne → retrouvailles
 * - Dialogues : au moins 5 répliques
 * - Panels attendus : 70-74
 *
 * @module golden-marius-au-port
 */

import { describe, expect, it } from "vitest";
import {
  buildChapterCastContract,
  assertValidChapterCastContract,
  buildChapterStoryContract,
  assertValidChapterStoryContract,
} from "@manga-ai-studio/core";
import { buildStoryboardPlanFromPremiumBlueprints } from "../passes/storyboard-from-premium-plan";
import { runBeatCoverageQaPass } from "../passes/beat-coverage-qa-pass";
import { runDialogueQaPass } from "../passes/dialogue-qa-pass";
import { runEmotionalArcQaPass } from "../passes/emotional-arc-qa-pass";
import { runInteractionQaPass } from "../passes/interaction-qa-pass";
import type { PanelBlueprintPremium } from "@manga-ai-studio/core";

const MARIUS_SCENARIO = {
  chapterId: "golden-marius-ch01",
  chapterNumber: 1,
  chapterTitle: "Marius au port",
  chapterSummary: "Marius revient au port après des années d'absence et retrouve Maya, son amie d'enfance.",
  chapterUserIntent: "Un chapitre nostalgique et émouvant sur les retrouvailles de deux amis.",

  characters: [
    { id: "marius", name: "Marius", roleType: "hero" },
    { id: "maya", name: "Maya", roleType: "supporting" },
  ],

  locations: [
    { id: "loc-port", name: "Port de pêche" },
    { id: "loc-quai", name: "Quai des pêcheurs" },
  ],

  expectedBeatIds: [
    "beat-arrival",
    "beat-nostalgia",
    "beat-recognition",
    "beat-awkward",
    "beat-reunion",
  ],

  emotionalArc: [
    { stepId: "arrival", label: "arrivée", intensity: 30, beatIds: ["beat-arrival"] },
    { stepId: "nostalgia", label: "nostalgie", intensity: 50, beatIds: ["beat-nostalgia"] },
    { stepId: "recognition", label: "reconnaissance", intensity: 60, beatIds: ["beat-recognition"] },
    { stepId: "awkward", label: "gêne", intensity: 45, beatIds: ["beat-awkward"] },
    { stepId: "reunion", label: "retrouvailles", intensity: 80, beatIds: ["beat-reunion"] },
  ],

  expectedInteractions: [
    { characterA: "marius", characterB: "maya", interactionType: "dialogue" as const },
  ],
};

function createGoldenBlueprints(): PanelBlueprintPremium[] {
  const blueprints: PanelBlueprintPremium[] = [];
  let panelNumber = 1;

  const beatStructure = [
    { beatId: "beat-arrival", panelCount: 14, hasDialogue: false },
    { beatId: "beat-nostalgia", panelCount: 14, hasDialogue: false },
    { beatId: "beat-recognition", panelCount: 14, hasDialogue: true },
    { beatId: "beat-awkward", panelCount: 14, hasDialogue: true },
    { beatId: "beat-reunion", panelCount: 16, hasDialogue: true },
  ];

  for (const beat of beatStructure) {
    for (let i = 0; i < beat.panelCount; i++) {
      const bp: PanelBlueprintPremium = {
        panelId: `panel-${panelNumber}`,
        beatId: beat.beatId,
        panelNumber,
        pageNumber: Math.ceil(panelNumber / 6),
        purpose: `Panel ${panelNumber} pour ${beat.beatId}`,
        shotType: i % 3 === 0 ? "wide" : i % 3 === 1 ? "medium" : "closeup",
        cameraAngle: "eye_level",
        subjectFocus: beat.hasDialogue && i % 2 === 0 ? "duo" : "hero",
        cutawayType: "none",
        requiredProps: [],
        requiredLocationSignals: [],
        mustShowEnemy: false,
        requiredNpcCount: 0,
        heroCenterAllowed: true,
        criticality: "medium",
        requiredCharacterIds: beat.hasDialogue ? ["marius", "maya"] : ["marius"],
        dialogueLines: beat.hasDialogue && i % 3 === 0
          ? [{ speaker: i % 2 === 0 ? "marius" : "maya", text: `Réplique ${panelNumber}` }]
          : undefined,
      };
      blueprints.push(bp);
      panelNumber++;
    }
  }

  return blueprints;
}

describe("Golden test — Marius au port", () => {
  describe("ChapterCastContract", () => {
    it("valide le cast avec Marius comme héros et Maya comme support", () => {
      const castContract = buildChapterCastContract({
        chapterId: MARIUS_SCENARIO.chapterId,
        heroCharacterId: "marius",
        focusCharacterIds: ["marius", "maya"],
        characters: MARIUS_SCENARIO.characters,
      });

      expect(() => assertValidChapterCastContract(castContract)).not.toThrow();
      expect(castContract.heroCharacterId).toBe("marius");
      expect(castContract.activeCharacterIds).toContain("marius");
      expect(castContract.supportCharacterIds).toContain("maya");
    });
  });

  describe("ChapterStoryContract", () => {
    it("valide le contrat d'histoire avec les lieux et personnages requis", () => {
      const storyContract = buildChapterStoryContract({
        chapterId: MARIUS_SCENARIO.chapterId,
        chapterNumber: MARIUS_SCENARIO.chapterNumber,
        chapterTitle: MARIUS_SCENARIO.chapterTitle,
        chapterSummary: MARIUS_SCENARIO.chapterSummary,
        chapterUserIntent: MARIUS_SCENARIO.chapterUserIntent,
        heroCharacterId: "marius",
        characters: MARIUS_SCENARIO.characters,
        locations: MARIUS_SCENARIO.locations,
      });

      expect(() => assertValidChapterStoryContract(storyContract)).not.toThrow();
      expect(storyContract.heroCharacterId).toBe("marius");
      expect(storyContract.requiredCharacterIds).toContain("marius");
      expect(storyContract.requiredCharacterIds).toContain("maya");
      expect(storyContract.requiredLocations.length).toBeGreaterThan(0);
    });
  });

  describe("StoryboardPlan", () => {
    it("génère un storyboard avec 70-74 panels", () => {
      const blueprints = createGoldenBlueprints();

      const storyboard = buildStoryboardPlanFromPremiumBlueprints({
        chapterId: MARIUS_SCENARIO.chapterId,
        projectFormat: "manga",
        panelBlueprints: blueprints,
        chapterLocationName: "Port de pêche",
        locations: MARIUS_SCENARIO.locations,
      });

      const totalPanels = storyboard.pages.reduce((sum, p) => sum + p.panels.length, 0);
      expect(totalPanels).toBeGreaterThanOrEqual(70);
      expect(totalPanels).toBeLessThanOrEqual(74);
    });

    it("branche correctement l'environmentAnchorId aux locations", () => {
      const blueprints = createGoldenBlueprints().map((bp) => ({
        ...bp,
        sceneContextLabel: "Port de pêche",
      }));

      const storyboard = buildStoryboardPlanFromPremiumBlueprints({
        chapterId: MARIUS_SCENARIO.chapterId,
        projectFormat: "manga",
        panelBlueprints: blueprints,
        chapterLocationName: "Port de pêche",
        locations: MARIUS_SCENARIO.locations,
      });

      const firstPanel = storyboard.pages[0]?.panels[0];
      expect(firstPanel?.locationId).toBe("loc-port");
      expect(firstPanel?.visualAnchors.environmentAnchorId).toBe("loc-port");
    });
  });

  describe("Beat Coverage QA", () => {
    it("couvre tous les beats attendus", () => {
      const blueprints = createGoldenBlueprints();

      const result = runBeatCoverageQaPass({
        expectedBeatIds: MARIUS_SCENARIO.expectedBeatIds,
        panels: blueprints.map((bp) => ({
          panelId: bp.panelId,
          sourceBeatId: bp.beatId,
        })),
      });

      expect(result.ok).toBe(true);
      expect(result.stats.coveragePercent).toBe(100);
      expect(result.stats.uncoveredBeats).toBe(0);
    });
  });

  describe("Dialogue QA", () => {
    it("génère au moins 5 lignes de dialogue ancrées", () => {
      const blueprints = createGoldenBlueprints();

      const result = runDialogueQaPass({
        blueprints: blueprints.map((bp) => ({
          panelId: bp.panelId,
          dialogueLines: bp.dialogueLines,
          requiredCharacterIds: bp.requiredCharacterIds,
        })),
        chapterId: MARIUS_SCENARIO.chapterId,
        characterNameById: { marius: "Marius", maya: "Maya" },
        strictMode: false,
      });

      expect(result.contract.totalLines).toBeGreaterThanOrEqual(5);
      expect(result.stats.anchoredLines).toBeGreaterThanOrEqual(5);
    });
  });

  describe("Emotional Arc QA", () => {
    it("couvre les étapes de l'arc émotionnel", () => {
      const blueprints = createGoldenBlueprints();

      const result = runEmotionalArcQaPass({
        expectedArc: MARIUS_SCENARIO.emotionalArc,
        panels: blueprints.map((bp) => ({
          panelId: bp.panelId,
          beatId: bp.beatId,
          intensity: 50,
        })),
      });

      expect(result.stats.coveredSteps).toBe(5);
      expect(result.stats.uncoveredSteps).toBe(0);
    });
  });

  describe("Interaction QA", () => {
    it("couvre les interactions Marius-Maya", () => {
      const blueprints = createGoldenBlueprints();

      const result = runInteractionQaPass({
        panels: blueprints.map((bp) => ({
          panelId: bp.panelId,
          visibleCharacterIds: bp.requiredCharacterIds,
          dialogueLines: bp.dialogueLines,
        })),
        expectedInteractions: MARIUS_SCENARIO.expectedInteractions,
      });

      expect(result.stats.interactionsCovered).toBe(1);
      expect(result.stats.dialoguePanels).toBeGreaterThan(0);
    });
  });
});
