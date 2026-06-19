import { describe, expect, it } from "vitest";
import type { ChapterReadinessReport, ChapterStudioData } from "@manga-ai-studio/core";
import { mapStudioStepToFlowStep } from "@/components/studio/chapter-studio-flow";
import { deriveWizardStepStatuses, wizardStepFromReadinessIssue, WIZARD_STEP_NAV } from "@/features/studio/wizard/chapter-wizard-model";

describe("wizardStepFromReadinessIssue — deep links readiness (P1.3)", () => {
  it("mappe plan / héros / décor / intention", () => {
    expect(wizardStepFromReadinessIssue({ step: "production_plan", id: "x", field: null })).toBe("plan");
    expect(wizardStepFromReadinessIssue({ step: "editorial_outline", id: "missing_editorial_outline", field: null })).toBe(
      "plan",
    );
    expect(wizardStepFromReadinessIssue({ step: "characters", id: "missing_hero_character", field: null })).toBe("hero");
    expect(wizardStepFromReadinessIssue({ step: "characters", id: "missing_character_canons", field: "studio-hero-character" })).toBe(
      "hero",
    );
    expect(wizardStepFromReadinessIssue({ step: "characters", id: "missing_character_canons", field: null })).toBe("cast");
    expect(wizardStepFromReadinessIssue({ step: "canon", id: "missing_chapter_location", field: "studio-location" })).toBe(
      "decor",
    );
    expect(wizardStepFromReadinessIssue({ step: "canon", id: "missing_continuity_notes", field: "studio-continuity-notes" })).toBe(
      "readiness",
    );
    expect(wizardStepFromReadinessIssue({ step: "intent", id: "missing_intent", field: "studio-short-pitch" })).toBe("intent");
  });
});

describe("WIZARD_STEP_NAV — ancres scroll", () => {
  it("expose un scrollFieldId pour chaque étape du parcours guidé", () => {
    const ids = Object.keys(WIZARD_STEP_NAV) as Array<keyof typeof WIZARD_STEP_NAV>;
    for (const id of ids) {
      const fid = WIZARD_STEP_NAV[id].scrollFieldId;
      expect(fid, `wizard step ${id}`).toBeTruthy();
      expect(fid!.length).toBeGreaterThan(3);
    }
  });
});

const extrasCh2 = { chapterNumber: 2 as const, heroReadiness: null };

function minimalDraft(over: Partial<ChapterStudioData> = {}): ChapterStudioData {
  const base = {
    intent: { shortPitch: "Un chapitre de test avec assez de texte" },
    chapterIntentContract: { confidenceScore: 0.9 },
    characterSelection: {
      heroCharacterId: "hero-1",
      activeCharacterIds: ["hero-1", "ally-1"],
    },
    locationCanons: [{ id: "loc-1", name: "Ville" }],
    chapterEntities: {
      npcs: [{ id: "n1" }],
      creatures: [],
      props: [],
      vehicles: [],
      factions: [],
    },
    chapterLookProfile: { mode: "standard" },
    productionPlan: {
      minimumImages: 70,
      panelBlueprints: Array.from({ length: 72 }, (_, i) => ({
        panelId: `p-${i}`,
        panelNumber: i + 1,
        dialogueLines: [],
      })),
    },
  } as unknown as ChapterStudioData;
  return { ...base, ...over } as ChapterStudioData;
}

const readinessReady: ChapterReadinessReport = {
  status: "ready",
  preparationScore: 90,
  blockingIssues: [],
  warnings: [],
  blockerItems: [],
  warningItems: [],
  completedSteps: [],
  imageCounts: { minimumImages: 70, targetImages: 75, estimatedImages: 0, generatedImages: 0, acceptedImages: 0, rejectedImages: 0, missingImages: 0 },
  panelBlueprintCount: 72,
};

describe("mapStudioStepToFlowStep — readiness", () => {
  it("associe l’étape studio readiness à l’écran Génération & review (checklist premium)", () => {
    expect(mapStudioStepToFlowStep("readiness")).toBe("generation_review");
  });
});

describe("deriveWizardStepStatuses — dialogues (P1.2)", () => {
  it("bloque les dialogues si une ligne a du texte sans characterId (sans contrat persisté)", () => {
    const draft = minimalDraft({
      productionPlan: {
        minimumImages: 70,
        panelBlueprints: [
          { panelId: "p-1", panelNumber: 1, dialogueLines: [{ text: "Salut", speaker: "X" }] },
          ...Array.from({ length: 71 }, (_, i) => ({
            panelId: `p-${i + 2}`,
            panelNumber: i + 2,
            dialogueLines: [],
          })),
        ],
      },
    } as unknown as Partial<ChapterStudioData>);
    const r = deriveWizardStepStatuses(draft as ChapterStudioData, readinessReady, extrasCh2);
    expect(r.plan).toBe("ready");
    expect(r.dialogues).toBe("blocked");
    expect(r.generation).toBe("blocked");
  });

  it("ready si toutes les lignes avec texte ont characterId", () => {
    const draft = minimalDraft({
      productionPlan: {
        minimumImages: 70,
        panelBlueprints: [
          {
            panelId: "p-1",
            panelNumber: 1,
            dialogueLines: [{ text: "Salut", characterId: "hero-1", speaker: "Héros" }],
          },
          ...Array.from({ length: 71 }, (_, i) => ({
            panelId: `p-${i + 2}`,
            panelNumber: i + 2,
            dialogueLines: [],
          })),
        ],
      },
    } as unknown as Partial<ChapterStudioData>);
    const r = deriveWizardStepStatuses(draft as ChapterStudioData, readinessReady, extrasCh2);
    expect(r.dialogues).toBe("ready");
    expect(r.generation).toBe("ready");
  });

  it("warning si aucune ligne de dialogue dans les blueprints", () => {
    const draft = minimalDraft();
    const r = deriveWizardStepStatuses(draft, readinessReady, extrasCh2);
    expect(r.dialogues).toBe("warning");
    expect(r.generation).toBe("warning");
  });
});
