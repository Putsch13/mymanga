/**
 * Job input : préférence studio `pipelinePreferences.sceneDialogueEnrich` → `sceneDialogueEnrich` sur le job.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@manga-ai-studio/ai", () => ({
  buildPremiumChapterContractAsync: vi.fn(),
  expandBlueprintsToMinimum: (b: unknown[]) => b,
}));

function makeSnapshot(
  panelBlueprints: unknown[],
  pipelinePreferences?: { sceneDialogueEnrich?: boolean },
) {
  return {
    data: {
      productionOutline: { source: "premium" },
      productionPlan: {
        panelBlueprints,
        minimumImages: 70,
        pages: [],
        criticalPanels: [],
        premiumReadinessScore: 0.9,
      },
      pipelinePreferences,
    },
  } as unknown as Parameters<
    typeof import("@/lib/premium-chapter-contract").buildGenerationJobInputFromSnapshot
  >[0]["snapshot"];
}

describe("buildGenerationJobInputFromSnapshot — scene dialogue pref", () => {
  it("inclut sceneDialogueEnrich quand pipelinePreferences.sceneDialogueEnrich", async () => {
    const { buildGenerationJobInputFromSnapshot } = await import("@/lib/premium-chapter-contract");
    const bps = Array.from({ length: 72 }, (_, i) => ({
      panelNumber: i + 1,
      panelId: `p${i + 1}`,
      subjectFocus: "hero",
    }));
    const out = buildGenerationJobInputFromSnapshot({
      source: "test",
      chapterId: "c1",
      focusCharacterIds: [],
      snapshot: makeSnapshot(bps, { sceneDialogueEnrich: true }),
      approvedOutline: { approvalVersion: 1 } as unknown as Parameters<
        typeof buildGenerationJobInputFromSnapshot
      >[0]["approvedOutline"],
    });
    expect(out.sceneDialogueEnrich).toBe(true);
  });

  it("propage chapterIntentContract et persistedVisualWorldContract depuis le snapshot", async () => {
    const { buildGenerationJobInputFromSnapshot } = await import("@/lib/premium-chapter-contract");
    const bps = Array.from({ length: 72 }, (_, i) => ({
      panelNumber: i + 1,
      panelId: `p${i + 1}`,
      subjectFocus: "hero",
    }));
    const snap = makeSnapshot(bps) as Record<string, unknown>;
    (snap.data as Record<string, unknown>).chapterIntentContract = {
      understoodPitch: "Test pitch",
      confidenceScore: 0.88,
    };
    (snap.data as Record<string, unknown>).visualWorldContract = {
      locations: [{ id: "l1", name: "Rue" }],
    };
    const out = buildGenerationJobInputFromSnapshot({
      source: "test",
      chapterId: "c1",
      focusCharacterIds: [],
      snapshot: snap as Parameters<typeof buildGenerationJobInputFromSnapshot>[0]["snapshot"],
      approvedOutline: { approvalVersion: 1 } as unknown as Parameters<
        typeof buildGenerationJobInputFromSnapshot
      >[0]["approvedOutline"],
    });
    expect(out.chapterIntentContract).toMatchObject({ understoodPitch: "Test pitch" });
    expect(out.persistedVisualWorldContract).toMatchObject({ locations: [{ id: "l1", name: "Rue" }] });
  });

  it("propage chapterDialogueContract depuis le snapshot", async () => {
    const { buildGenerationJobInputFromSnapshot } = await import("@/lib/premium-chapter-contract");
    const bps = Array.from({ length: 72 }, (_, i) => ({
      panelNumber: i + 1,
      panelId: `p${i + 1}`,
      subjectFocus: "hero",
    }));
    const snap = makeSnapshot(bps) as Record<string, unknown>;
    (snap.data as Record<string, unknown>).chapterDialogueContract = {
      chapterId: "c1",
      lines: [
        {
          panelId: "p1",
          speakerId: "h1",
          speakerName: "Ken",
          text: "Allons-y.",
          speakerVisible: true,
          dialogueType: "speech",
        },
      ],
      totalLines: 1,
      panelsWithDialogue: 1,
      uniqueSpeakers: ["h1"],
    };
    const out = buildGenerationJobInputFromSnapshot({
      source: "test",
      chapterId: "c1",
      focusCharacterIds: [],
      snapshot: snap as Parameters<typeof buildGenerationJobInputFromSnapshot>[0]["snapshot"],
      approvedOutline: { approvalVersion: 1 } as unknown as Parameters<
        typeof buildGenerationJobInputFromSnapshot
      >[0]["approvedOutline"],
    });
    expect(out.chapterDialogueContract).toMatchObject({ chapterId: "c1", totalLines: 1 });
  });
});
