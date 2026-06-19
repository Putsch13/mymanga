/**
 * P0 (mai 2026) — wizard flow studio :
 *   - "dialogues" est inséré entre "plan" et "generation_review"
 *   - isDialoguesStepRequired = true dès qu'un plan existe et density != low
 *   - hasValidatedDialogueDraft = true quand chapterDialogueContract.totalLines > 0
 */

import { describe, expect, it } from "vitest";
import type { ChapterStudioData } from "@manga-ai-studio/core";
import {
  FLOW_STEPS,
  hasValidatedDialogueDraft,
  isDialoguesStepRequired,
  normalizeFlowStepId,
} from "@/components/studio/chapter-studio-flow";

describe("chapter-studio-flow — étape Dialogues", () => {
  it("normalise les anciens IDs brief / cast_canon", () => {
    expect(normalizeFlowStepId("brief")).toBe("story");
    expect(normalizeFlowStepId("cast_canon")).toBe("characters");
    expect(normalizeFlowStepId("plan")).toBe("plan");
  });

  it("FLOW_STEPS contient 7 étapes ciblées dans l'ordre IA", () => {
    const ids = FLOW_STEPS.map((s) => s.id);
    expect(ids).toEqual([
      "characters",
      "story",
      "locations",
      "living_world",
      "plan",
      "dialogues",
      "generation_review",
    ]);
  });

  it("FLOW_STEPS contient 'dialogues' entre 'plan' et 'generation_review'", () => {
    const ids = FLOW_STEPS.map((s) => s.id);
    const planIdx = ids.indexOf("plan");
    const dialoguesIdx = ids.indexOf("dialogues");
    const reviewIdx = ids.indexOf("generation_review");

    expect(planIdx).toBeGreaterThan(-1);
    expect(dialoguesIdx).toBe(planIdx + 1);
    expect(reviewIdx).toBe(dialoguesIdx + 1);
  });

  it("isDialoguesStepRequired = false sans plan", () => {
    const draft: ChapterStudioData = {
      characterCanons: [],
      locationCanons: [],
    } as unknown as ChapterStudioData;
    expect(isDialoguesStepRequired(draft)).toBe(false);
  });

  it("isDialoguesStepRequired = true quand plan présent et density 'medium'", () => {
    const draft = {
      characterCanons: [],
      locationCanons: [],
      productionPlan: {
        panelBlueprints: [{ panelId: "p1" }, { panelId: "p2" }],
      },
      chapterIntentContract: { dialogueDensity: "medium" },
    } as unknown as ChapterStudioData;
    expect(isDialoguesStepRequired(draft)).toBe(true);
  });

  it("isDialoguesStepRequired = false quand density 'low' (chapitre silencieux)", () => {
    const draft = {
      characterCanons: [],
      locationCanons: [],
      productionPlan: { panelBlueprints: [{ panelId: "p1" }] },
      chapterIntentContract: { dialogueDensity: "low" },
    } as unknown as ChapterStudioData;
    expect(isDialoguesStepRequired(draft)).toBe(false);
  });

  it("hasValidatedDialogueDraft = true quand chapterDialogueContract a des lignes", () => {
    const draft = {
      characterCanons: [],
      locationCanons: [],
      chapterDialogueContract: {
        chapterId: "ch1",
        lines: [{ panelId: "p1", speakerId: "char_hero", speakerName: "Akira", text: "Salut", speakerVisible: true, dialogueType: "speech" }],
        totalLines: 1,
        panelsWithDialogue: 1,
        uniqueSpeakers: ["char_hero"],
      },
    } as unknown as ChapterStudioData;
    expect(hasValidatedDialogueDraft(draft)).toBe(true);
  });

  it("hasValidatedDialogueDraft = false quand contract vide", () => {
    const draft = {
      characterCanons: [],
      locationCanons: [],
    } as unknown as ChapterStudioData;
    expect(hasValidatedDialogueDraft(draft)).toBe(false);
  });
});
