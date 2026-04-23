/**
 * P8 — `buildGenerationJobInputFromSnapshot` applique la RANGE stricte 70-75.
 *
 * Règle produit (mission de refonte premium) :
 *   - rawCount === 0                                → IncompletePlanError (plan vide)
 *   - 0 < rawCount < PREMIUM_PANEL_RANGE.min (70)   → IncompletePlanError (bloqué)
 *   - PREMIUM_PANEL_RANGE.min ≤ rawCount ≤ .max     → passthrough
 *   - rawCount > PREMIUM_PANEL_RANGE.max (75)       → IncompletePlanError (bloqué)
 *
 * Ce test garantit qu'on ne retombe JAMAIS dans l'ancien modèle
 * `expandBlueprintsToMinimum` NI dans le modèle "soft" qui laissait passer 56.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@manga-ai-studio/ai", () => ({
  buildPremiumChapterContractAsync: vi.fn(),
  expandBlueprintsToMinimum: (blueprints: unknown[], minimum: number) => {
    if (blueprints.length === 0 || blueprints.length >= minimum) return blueprints;
    const result = [...blueprints];
    let i = 0;
    while (result.length < minimum) {
      const seed = blueprints[i % blueprints.length] as Record<string, unknown>;
      result.push({
        ...seed,
        panelNumber: result.length + 1,
        panelId: `${seed.panelId ?? "panel"}_enrich_${result.length + 1}`,
      });
      i += 1;
    }
    return result;
  },
}));

function makeValidBlueprints(n: number): unknown[] {
  return Array.from({ length: n }, (_, i) => ({
    panelNumber: i + 1,
    subjectFocus: "hero",
    panelId: `panel_${i + 1}`,
  }));
}

function makeSnapshot(panelBlueprints: unknown[], minimumImages: number) {
  return {
    data: {
      productionOutline: { source: "premium" },
      productionPlan: {
        panelBlueprints,
        minimumImages,
        pages: [],
        criticalPanels: [],
        premiumReadinessScore: 0.9,
      },
    },
  } as unknown as Parameters<
    typeof import("@/lib/premium-chapter-contract").buildGenerationJobInputFromSnapshot
  >[0]["snapshot"];
}

describe("buildGenerationJobInputFromSnapshot — P8 strict 70-75", () => {
  it("passthrough dans la range (72 panels) : aucun padding ni blocage", async () => {
    const { buildGenerationJobInputFromSnapshot } = await import(
      "@/lib/premium-chapter-contract"
    );
    const snapshot = makeSnapshot(makeValidBlueprints(72), 70);
    const out = buildGenerationJobInputFromSnapshot({
      source: "test",
      chapterId: "c1",
      focusCharacterIds: [],
      snapshot,
      approvedOutline: { approvalVersion: 1 } as unknown as Parameters<
        typeof buildGenerationJobInputFromSnapshot
      >[0]["approvedOutline"],
    });
    expect(Array.isArray(out.panelBlueprints)).toBe(true);
    expect((out.panelBlueprints as unknown[]).length).toBe(72);
  });

  it("P8 — throw IncompletePlanError quand rawCount < 70 (sous la range)", async () => {
    const { buildGenerationJobInputFromSnapshot, IncompletePlanError } = await import(
      "@/lib/premium-chapter-contract"
    );
    const snapshot = makeSnapshot(makeValidBlueprints(49), 75);
    expect(() =>
      buildGenerationJobInputFromSnapshot({
        source: "test",
        chapterId: "c1",
        focusCharacterIds: [],
        snapshot,
        approvedOutline: { approvalVersion: 1 } as unknown as Parameters<
          typeof buildGenerationJobInputFromSnapshot
        >[0]["approvedOutline"],
      }),
    ).toThrow(IncompletePlanError);
  });

  it("P8 — throw IncompletePlanError quand rawCount > 75 (sur la range)", async () => {
    const { buildGenerationJobInputFromSnapshot, IncompletePlanError } = await import(
      "@/lib/premium-chapter-contract"
    );
    const snapshot = makeSnapshot(makeValidBlueprints(90), 75);
    expect(() =>
      buildGenerationJobInputFromSnapshot({
        source: "test",
        chapterId: "c1",
        focusCharacterIds: [],
        snapshot,
        approvedOutline: { approvalVersion: 1 } as unknown as Parameters<
          typeof buildGenerationJobInputFromSnapshot
        >[0]["approvedOutline"],
      }),
    ).toThrow(IncompletePlanError);
  });

  it("throw IncompletePlanError quand le plan est complètement vide", async () => {
    const { buildGenerationJobInputFromSnapshot, IncompletePlanError } = await import(
      "@/lib/premium-chapter-contract"
    );
    const snapshot = makeSnapshot([], 75);
    expect(() =>
      buildGenerationJobInputFromSnapshot({
        source: "test",
        chapterId: "c1",
        focusCharacterIds: [],
        snapshot,
        approvedOutline: { approvalVersion: 1 } as unknown as Parameters<
          typeof buildGenerationJobInputFromSnapshot
        >[0]["approvedOutline"],
      }),
    ).toThrow(IncompletePlanError);
  });
});
