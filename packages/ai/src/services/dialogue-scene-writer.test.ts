/**
 * P0 (mai 2026) — dialogue-scene-writer :
 *  - skip si OPENAI_SCENE_DIALOGUE_ENRICH=0 sans force
 *  - skip si OPENAI_API_KEY absent
 *  - écrit characterId dans dialogueLines (pas seulement speaker textuel)
 *  - rejectUnresolvedSpeakers => blockingErrors si speaker non résolu
 *
 * Note : ces tests ne touchent pas vraiment OpenAI ; ils valident les
 * branches de bypass / signature / contrat de retour.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import { enrichPremiumBlueprintsSceneDialogue } from "./dialogue-scene-writer";

const ORIGINAL_KEY = process.env.OPENAI_API_KEY;
const ORIGINAL_FLAG = process.env.OPENAI_SCENE_DIALOGUE_ENRICH;

beforeEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_SCENE_DIALOGUE_ENRICH;
  vi.restoreAllMocks();
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = ORIGINAL_KEY;
  if (ORIGINAL_FLAG === undefined) delete process.env.OPENAI_SCENE_DIALOGUE_ENRICH;
  else process.env.OPENAI_SCENE_DIALOGUE_ENRICH = ORIGINAL_FLAG;
});

function makeBlueprint(panelId: string, patch: Partial<PanelBlueprintPremium> = {}): PanelBlueprintPremium {
  return {
    panelId,
    panelNumber: 1,
    pageNumber: 1,
    beatId: "b1",
    purpose: "dialogue de tension",
    shotType: "medium",
    cameraAngle: "eye_level",
    subjectFocus: "speaker",
    cutawayType: "none",
    requiredProps: [],
    requiredLocationSignals: [],
    mustShowEnemy: false,
    requiredNpcCount: 0,
    heroCenterAllowed: true,
    criticality: "medium",
    mustShowCharacterIds: ["char_hero"],
    speakerAnchorCharacterId: "char_hero",
    dialogueLines: [],
    dialogueLinesAnchored: 0,
    dialogueCarrier: "speaker_visible",
    ...patch,
  } as PanelBlueprintPremium;
}

describe("enrichPremiumBlueprintsSceneDialogue — bypass paths", () => {
  it("skip propre quand le flag d'env n'est pas set et pas de force", async () => {
    const result = await enrichPremiumBlueprintsSceneDialogue({
      blueprints: [makeBlueprint("p1")],
      productionOutline: null,
      chapterSummary: null,
      chapterUserIntent: null,
      characterNameById: { char_hero: "Akira" },
    });
    expect(result.linesWritten).toBe(0);
    expect(result.warnings).toContain("scene_dialogue_skipped_not_enabled");
    expect(result.blockingErrors).toEqual([]);
  });

  it("skip propre quand pas d'OPENAI_API_KEY mais flag actif", async () => {
    process.env.OPENAI_SCENE_DIALOGUE_ENRICH = "1";
    const result = await enrichPremiumBlueprintsSceneDialogue({
      blueprints: [makeBlueprint("p1")],
      productionOutline: null,
      chapterSummary: null,
      chapterUserIntent: null,
      characterNameById: { char_hero: "Akira" },
    });
    expect(result.linesWritten).toBe(0);
    expect(result.warnings).toContain("scene_dialogue_skipped_no_openai");
  });

  it("forceSceneDialogueEnrich seul ne suffit pas sans OPENAI_API_KEY", async () => {
    const result = await enrichPremiumBlueprintsSceneDialogue({
      blueprints: [makeBlueprint("p1")],
      productionOutline: null,
      chapterSummary: null,
      chapterUserIntent: null,
      characterNameById: { char_hero: "Akira" },
      forceSceneDialogueEnrich: true,
    });
    expect(result.warnings).toContain("scene_dialogue_skipped_no_openai");
    expect(result.linesWritten).toBe(0);
  });

  it("le retour expose toujours blockingErrors:string[] (forme stable)", async () => {
    const result = await enrichPremiumBlueprintsSceneDialogue({
      blueprints: [],
      productionOutline: null,
      chapterSummary: null,
      chapterUserIntent: null,
      characterNameById: {},
      rejectUnresolvedSpeakers: true,
    });
    expect(Array.isArray(result.blockingErrors)).toBe(true);
    expect(typeof result.beatsTouched).toBe("number");
    expect(typeof result.linesWritten).toBe("number");
  });
});
