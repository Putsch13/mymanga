/**
 * AUDIT COMMIT 2 — `buildGenerationJobInputFromSnapshot` doit lever
 * `IncompletePlanError` dès que `panelBlueprints.length < minimumImages`.
 * Plus aucune réparation silencieuse via `expandBlueprintsToMinimum`, plus
 * aucun flag legacy actif dans le chemin standard.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@manga-ai-studio/ai", () => ({
  buildPremiumChapterContractAsync: vi.fn(),
}));

/**
 * Construit N blueprints VALIDES selon `validateBlueprint`
 * (panelNumber numérique + subjectFocus défini).
 */
function makeValidBlueprints(n: number): unknown[] {
  return Array.from({ length: n }, (_, i) => ({
    panelNumber: i + 1,
    subjectFocus: "hero",
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

describe("buildGenerationJobInputFromSnapshot — AUDIT COMMIT 2 guard", () => {
  const originalFlag = process.env.MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY;

  beforeEach(() => {
    // Même si l'ancien flag legacy est positionné dans l'environnement,
    // il ne doit plus avoir aucun effet dans le chemin standard.
    delete process.env.MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY;
  });
  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY;
    } else {
      process.env.MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY = originalFlag;
    }
  });

  it("bloque quand panelBlueprints < minimumImages", async () => {
    const { buildGenerationJobInputFromSnapshot, IncompletePlanError } = await import(
      "@/lib/premium-chapter-contract"
    );
    const snapshot = makeSnapshot(makeValidBlueprints(40), 75);
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

  it("accepte quand panelBlueprints >= minimumImages", async () => {
    const { buildGenerationJobInputFromSnapshot } = await import(
      "@/lib/premium-chapter-contract"
    );
    const snapshot = makeSnapshot(makeValidBlueprints(75), 75);
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
    expect((out.panelBlueprints as unknown[]).length).toBe(75);
  });

  it("ne répare plus via le flag legacy MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY", async () => {
    // AUDIT COMMIT 2 — le chemin "expansion legacy" a été retiré du code
    // métier. Même si le flag est forcé, on doit toujours lever.
    process.env.MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY = "true";
    const { buildGenerationJobInputFromSnapshot, IncompletePlanError } = await import(
      "@/lib/premium-chapter-contract"
    );
    const snapshot = makeSnapshot(makeValidBlueprints(40), 75);
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
