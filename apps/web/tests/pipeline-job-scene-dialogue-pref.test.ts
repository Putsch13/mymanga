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
});
