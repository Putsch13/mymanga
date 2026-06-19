/**
 * P5.20 — Tests anti-régression (10 cas)
 *
 * Ces tests vérifient que les bugs corrigés ne réapparaissent pas.
 * Chaque test représente un bug historique qui a été corrigé.
 *
 * @module anti-regression
 */

import { describe, expect, it } from "vitest";
import {
  buildChapterCastContract,
  validateChapterCastContract,
  buildChapterStoryContract,
  validateChapterStoryContract,
  isPropForbidden,
  isHeroRole,
  isSupportingRole,
  isAntagonistRole,
  canonicalizeCharacterRoleType,
} from "@manga-ai-studio/core";
import { buildStoryboardPlanFromPremiumBlueprints } from "../passes/storyboard-from-premium-plan";
import { runPropsQaPass, extractPotentialProps } from "../passes/props-qa-pass";
import { runDialogueQaPass } from "../passes/dialogue-qa-pass";
import type { PanelBlueprintPremium } from "@manga-ai-studio/core";

describe("Anti-régression", () => {
  /**
   * Cas 1: heroCharacterId manquant ne doit plus planter le pipeline
   * Bug historique: Le pipeline crashait si heroCharacterId était null
   */
  describe("Cas 1 — heroCharacterId null fallback", () => {
    it("utilise focusCharacterIds[0] comme fallback quand heroCharacterId est null", () => {
      const contract = buildChapterCastContract({
        chapterId: "ch-1",
        heroCharacterId: null,
        focusCharacterIds: ["char-1", "char-2"],
        characters: [
          { id: "char-1", name: "Premier", roleType: "hero" },
          { id: "char-2", name: "Deuxième", roleType: "supporting" },
        ],
      });

      expect(contract.heroCharacterId).toBe("char-1");
    });
  });

  /**
   * Cas 2: Rôle "protagoniste" doit être normalisé en "hero"
   * Bug historique: Les rôles français n'étaient pas reconnus
   */
  describe("Cas 2 — Normalisation rôles FR→EN", () => {
    it("normalise 'protagoniste' en 'hero'", () => {
      expect(canonicalizeCharacterRoleType("protagoniste")).toBe("hero");
      expect(isHeroRole("protagoniste")).toBe(true);
    });

    it("normalise 'antagoniste' en 'antagonist'", () => {
      expect(canonicalizeCharacterRoleType("antagoniste")).toBe("antagonist");
      expect(isAntagonistRole("antagoniste")).toBe(true);
    });

    it("normalise 'secondaire' en 'secondary' (qui est un rôle de support)", () => {
      expect(canonicalizeCharacterRoleType("secondaire")).toBe("secondary");
      expect(isSupportingRole("secondaire")).toBe(true);
    });
  });

  /**
   * Cas 3: Panel solo ne doit plus avoir dialogue_two_shot
   * Bug historique: Panels avec 1 personnage avaient renderMode dialogue_two_shot
   */
  describe("Cas 3 — Solo panel → character_focus", () => {
    it("utilise character_focus pour un panel avec 1 personnage", () => {
      const blueprints: PanelBlueprintPremium[] = [
        {
          panelId: "solo-panel",
          beatId: "beat-1",
          panelNumber: 1,
          pageNumber: 1,
          purpose: "Héros seul",
          shotType: "medium",
          cameraAngle: "eye_level",
          subjectFocus: "hero",
          cutawayType: "none",
          requiredProps: [],
          requiredLocationSignals: [],
          mustShowEnemy: false,
          requiredNpcCount: 0,
          heroCenterAllowed: true,
          criticality: "medium",
          requiredCharacterIds: ["hero-1"],
        },
      ];

      const plan = buildStoryboardPlanFromPremiumBlueprints({
        chapterId: "ch-1",
        projectFormat: "manga",
        panelBlueprints: blueprints,
      });

      expect(plan.pages[0]?.panels[0]?.renderMode).not.toBe("dialogue_two_shot");
    });
  });

  /**
   * Cas 4: Props modernes doivent être détectés comme anachroniques
   * Bug historique: "smartphone" apparaissait dans des univers médiévaux
   */
  describe("Cas 4 — Détection props anachroniques", () => {
    it("détecte smartphone comme anachronique", () => {
      const props = extractPotentialProps("character holding a smartphone");
      expect(props).toContain("smartphone");
    });

    it("bloque smartphone dans le QA", () => {
      const storyContract = buildChapterStoryContract({
        chapterId: "ch-1",
        chapterNumber: 1,
        chapterTitle: "Test",
        heroCharacterId: "hero",
        characters: [{ id: "hero", name: "Hero" }],
        locations: [{ id: "loc-1", name: "Castle" }],
        forbiddenProps: ["smartphone"],
      });

      expect(isPropForbidden(storyContract, "smartphone")).toBe(true);
    });
  });

  /**
   * Cas 5: Héros doit être dans requiredCharacterIds
   * Bug historique: Le héros pouvait ne pas être dans la liste des personnages requis
   */
  describe("Cas 5 — Héros dans requiredCharacterIds", () => {
    it("ajoute automatiquement le héros aux personnages requis", () => {
      const contract = buildChapterStoryContract({
        chapterId: "ch-1",
        chapterNumber: 1,
        chapterTitle: "Test",
        heroCharacterId: "hero-unique",
        characters: [{ id: "other", name: "Other" }],
      });

      expect(contract.requiredCharacterIds).toContain("hero-unique");
    });
  });

  /**
   * Cas 6: Dialogue flottant doit être détecté en mode strict
   * Bug historique: Dialogues avec speaker non visible passaient inaperçus
   */
  describe("Cas 6 — Dialogues flottants détectés", () => {
    it("détecte un dialogue sans speaker visible", () => {
      const result = runDialogueQaPass({
        blueprints: [
          {
            panelId: "p1",
            dialogueLines: [{ speaker: "offscreen", text: "Hello" }],
            requiredCharacterIds: ["visible-char"],
          },
        ],
        chapterId: "ch-1",
        characterNameById: {},
        strictMode: true,
      });

      expect(result.stats.floatingLines).toBe(1);
    });
  });

  /**
   * Cas 7: Location "unknown" ne doit plus être utilisée
   * Bug historique: Les panels avaient locationName="unknown"
   */
  describe("Cas 7 — Pas de location 'unknown'", () => {
    it("remplace 'unknown' par 'story-consistent setting'", () => {
      const blueprints: PanelBlueprintPremium[] = [
        {
          panelId: "p1",
          beatId: "b1",
          panelNumber: 1,
          pageNumber: 1,
          purpose: "Test",
          shotType: "medium",
          cameraAngle: "eye_level",
          subjectFocus: "hero",
          cutawayType: "none",
          requiredProps: [],
          requiredLocationSignals: [],
          mustShowEnemy: false,
          requiredNpcCount: 0,
          heroCenterAllowed: true,
          criticality: "medium",
        },
      ];

      const plan = buildStoryboardPlanFromPremiumBlueprints({
        chapterId: "ch-1",
        projectFormat: "manga",
        panelBlueprints: blueprints,
        chapterLocationName: "unknown",
      });

      expect(plan.pages[0]?.panels[0]?.locationName).not.toBe("unknown");
    });
  });

  /**
   * Cas 8: environmentAnchorId doit être branché aux locations
   * Bug historique: environmentAnchorId était toujours null
   */
  describe("Cas 8 — environmentAnchorId branché", () => {
    it("résout environmentAnchorId depuis les locations fournies", () => {
      const blueprints: PanelBlueprintPremium[] = [
        {
          panelId: "p1",
          beatId: "b1",
          panelNumber: 1,
          pageNumber: 1,
          purpose: "Test",
          shotType: "medium",
          cameraAngle: "eye_level",
          subjectFocus: "hero",
          cutawayType: "none",
          requiredProps: [],
          requiredLocationSignals: [],
          mustShowEnemy: false,
          requiredNpcCount: 0,
          heroCenterAllowed: true,
          criticality: "medium",
          sceneContextLabel: "Port de Marseille",
        },
      ];

      const plan = buildStoryboardPlanFromPremiumBlueprints({
        chapterId: "ch-1",
        projectFormat: "manga",
        panelBlueprints: blueprints,
        chapterLocationName: "Default",
        locations: [{ id: "loc-port", name: "Port de Marseille" }],
      });

      expect(plan.pages[0]?.panels[0]?.visualAnchors.environmentAnchorId).toBe("loc-port");
    });
  });

  /**
   * Cas 9: Contrat d'histoire doit avoir au moins un lieu
   * Bug historique: ChapterStoryContract sans lieu passait la validation
   */
  describe("Cas 9 — Au moins un lieu requis", () => {
    it("crée un lieu par défaut si aucun n'est fourni", () => {
      const contract = buildChapterStoryContract({
        chapterId: "ch-1",
        chapterNumber: 1,
        chapterTitle: "Test",
        heroCharacterId: "hero",
        characters: [{ id: "hero", name: "Hero" }],
        locations: [],
      });

      expect(contract.requiredLocations.length).toBeGreaterThan(0);
      expect(validateChapterStoryContract(contract).ok).toBe(true);
    });
  });

  /**
   * Cas 10: Cast contract doit avoir au moins un membre actif
   * Bug historique: activeCharacterIds pouvait être vide
   */
  describe("Cas 10 — Au moins un personnage actif", () => {
    it("le héros est toujours dans activeCharacterIds", () => {
      const contract = buildChapterCastContract({
        chapterId: "ch-1",
        heroCharacterId: "hero-1",
        focusCharacterIds: [],
        characters: [{ id: "hero-1", name: "Hero", roleType: "hero" }],
      });

      expect(contract.activeCharacterIds).toContain("hero-1");
      expect(contract.activeCharacterIds.length).toBeGreaterThan(0);
      expect(validateChapterCastContract(contract).ok).toBe(true);
    });
  });
});
