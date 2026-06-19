/**
 * Tests pour repair-render-spec-contradictions.
 */

import { describe, expect, it } from "vitest";
import {
  repairRenderSpecContradictions,
  stripWideEstablishingTerms,
  hasWideEstablishingTerms,
  stripInsertShotTerms,
  hasInsertShotTerms,
} from "./repair-render-spec-contradictions";
import type { PanelRenderSpec } from "../contracts/panel-render-spec";
import { createDefaultChapterStyleBible } from "../contracts/chapter-style-bible";

function makeSpec(overrides: Partial<PanelRenderSpec> = {}): PanelRenderSpec {
  return {
    panelId: "panel_1",
    pageNumber: 1,
    panelNumberInPage: 1,
    panelPurpose: "hero_focus",
    renderMode: "character_focus",
    shotType: "medium",
    cameraAngle: "eye_level",
    subjectFocus: "hero",
    cutawayType: "none",
    locationName: "port",
    actionLine: "Hero observes the scene",
    emotionLine: "determined",
    dialogueIntent: null,
    visibleCharacters: [
      { characterId: "c1", name: "Hero", role: "hero", poseIntent: null, expressionIntent: null },
    ],
    styleBible: createDefaultChapterStyleBible(),
    continuityLocks: {
      outfitLocks: [],
      bodyStateLocks: [],
      propLocks: [],
      environmentLocks: [],
    },
    imageReferences: {
      characterRefs: [{ characterId: "c1", url: "https://x/f.png", weight: 1 }],
      environmentRefs: [],
      panelRefs: [],
      styleRefs: [],
    },
    constraints: {
      mustShow: [],
      mustNotShow: [],
      forbiddenDrift: [],
      noTextInsideImage: true,
    },
    ...overrides,
  };
}

describe("repair-render-spec-contradictions", () => {
  describe("stripWideEstablishingTerms", () => {
    it("supprime 'wide establishing shot'", () => {
      const input = "Hero stands in a wide establishing shot of the port";
      const result = stripWideEstablishingTerms(input);
      expect(result).toBe("Hero stands in a of the port");
    });

    it("supprime 'establishing shot'", () => {
      const input = "establishing shot of the harbor";
      const result = stripWideEstablishingTerms(input);
      expect(result).toBe("of the harbor");
    });

    it("supprime 'plan large' (français)", () => {
      const input = "plan large du port avec les bateaux";
      const result = stripWideEstablishingTerms(input);
      expect(result).toBe("du port avec les bateaux");
    });

    it("ne modifie pas un texte sans termes contradictoires", () => {
      const input = "Hero stands determined, facing the enemy";
      const result = stripWideEstablishingTerms(input);
      expect(result).toBe("Hero stands determined, facing the enemy");
    });
  });

  describe("hasWideEstablishingTerms", () => {
    it("détecte 'wide establishing shot'", () => {
      expect(hasWideEstablishingTerms("wide establishing shot of the port")).toBe(true);
    });

    it("détecte 'establishing shot'", () => {
      expect(hasWideEstablishingTerms("establishing shot at dawn")).toBe(true);
    });

    it("retourne false pour un texte sans contradiction", () => {
      expect(hasWideEstablishingTerms("Hero close-up, determined expression")).toBe(false);
    });

    it("retourne false pour null/undefined", () => {
      expect(hasWideEstablishingTerms(null)).toBe(false);
      expect(hasWideEstablishingTerms(undefined)).toBe(false);
    });
  });

  describe("repairRenderSpecContradictions", () => {
    it("ne répare pas un spec sans contradiction", () => {
      const spec = makeSpec({
        renderMode: "character_focus",
        actionLine: "Hero stands determined",
      });
      const result = repairRenderSpecContradictions(spec);
      expect(result.repaired).toBe(false);
      expect(result.repairs).toEqual([]);
    });

    it("répare character_focus + wide establishing en nettoyant actionLine", () => {
      const spec = makeSpec({
        panelId: "beat_1_panel_5",
        panelNumberInPage: 3, // Pas un panel d'ouverture
        renderMode: "character_focus",
        actionLine: "Hero in wide establishing shot of the port",
      });
      const result = repairRenderSpecContradictions(spec);
      expect(result.repaired).toBe(true);
      expect(result.repairs).toContain("cleaned_actionLine");
      expect(result.spec.actionLine).not.toContain("wide establishing");
    });

    it("convertit un beat opening panel en establishing_environment", () => {
      const spec = makeSpec({
        panelId: "beat_1_panel_0",
        renderMode: "character_focus",
        actionLine: "Wide establishing shot of the port with hero",
      });
      const result = repairRenderSpecContradictions(spec);
      expect(result.repaired).toBe(true);
      expect(result.spec.renderMode).toBe("establishing_environment");
      expect(result.spec.subjectFocus).toBe("environment");
      expect(result.repairs).toContain("converted_to_establishing_environment (beat opening panel)");
    });

    it("répare reaction_closeup + wide establishing en nettoyant et forçant subjectFocus", () => {
      const spec = makeSpec({
        panelId: "beat_2_panel_3",
        panelNumberInPage: 4, // Pas un panel d'ouverture
        renderMode: "reaction_closeup",
        subjectFocus: "reaction",
        actionLine: "Reaction to the wide establishing view",
      });
      const result = repairRenderSpecContradictions(spec);
      expect(result.repaired).toBe(true);
      expect(result.spec.actionLine).not.toContain("wide establishing");
      expect(result.spec.subjectFocus).toBe("reaction");
    });

    it("ne modifie pas un establishing_environment (pas dans CLOSEUP_RENDER_MODES)", () => {
      const spec = makeSpec({
        renderMode: "establishing_environment",
        actionLine: "Wide establishing shot of the harbor",
      });
      const result = repairRenderSpecContradictions(spec);
      expect(result.repaired).toBe(false);
    });

    it("répare les constraints.mustShow contradictoires", () => {
      const spec = makeSpec({
        panelNumberInPage: 3, // Pas un panel d'ouverture
        renderMode: "character_focus",
        actionLine: "Hero stands",
        constraints: {
          mustShow: ["hero face", "wide establishing shot background"],
          mustNotShow: [],
          forbiddenDrift: [],
          noTextInsideImage: true,
        },
      });
      const result = repairRenderSpecContradictions(spec);
      expect(result.repaired).toBe(true);
      expect(result.repairs).toContain("cleaned_mustShow");
      expect(result.spec.constraints?.mustShow?.join(" ")).not.toContain("wide establishing");
    });

    // AUDIT-V8 — DIALOGUE × INSERT
    it("nettoie 'insert shot' dans actionLine quand renderMode=dialogue_two_shot", () => {
      const spec = makeSpec({
        panelId: "beat_10_panel_8",
        renderMode: "dialogue_two_shot",
        actionLine: "insert shot of hands or meaningful object hovering near a symbol",
      });
      const result = repairRenderSpecContradictions(spec);
      expect(result.repaired).toBe(true);
      expect(result.repairs).toContain("stripped_insert_from_dialogue_actionLine");
      expect(result.spec.actionLine).not.toContain("insert shot");
      expect(result.spec.renderMode).toBe("dialogue_two_shot");
    });

    it("nettoie 'object insert' dans constraints.mustShow quand dialogue_over_shoulder", () => {
      const spec = makeSpec({
        renderMode: "dialogue_over_shoulder",
        actionLine: "Hero talks to villager",
        constraints: {
          mustShow: ["hero face", "object insert as primary subject"],
          mustNotShow: [],
          forbiddenDrift: [],
          noTextInsideImage: true,
        },
      });
      const result = repairRenderSpecContradictions(spec);
      expect(result.repaired).toBe(true);
      expect(result.repairs).toContain("stripped_insert_from_dialogue_mustShow");
    });
  });

  describe("hasInsertShotTerms / stripInsertShotTerms", () => {
    it("détecte 'insert shot'", () => {
      expect(hasInsertShotTerms("insert shot of the dagger")).toBe(true);
    });
    it("supprime 'extreme close-up on object'", () => {
      const out = stripInsertShotTerms("hero pose with extreme close-up on object behind");
      expect(out).not.toContain("extreme close-up on object");
    });
    it("retourne false sans terme insert", () => {
      expect(hasInsertShotTerms("hero looks at villager")).toBe(false);
    });
  });
});
