/**
 * P0.6 — Test : un plan de production avec `panelBlueprints < minimumImages`
 * doit lever `IncompletePlanError` au lieu d'étirer silencieusement via
 * `expandBlueprintsToMinimum`. L'expansion reste disponible derrière le flag
 * legacy `MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY=true`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock de la librairie AI pour contrôler expandBlueprintsToMinimum
vi.mock("@manga-ai-studio/ai", () => ({
  buildPremiumChapterContractAsync: vi.fn(),
  expandBlueprintsToMinimum: (blueprints: unknown[], minimum: number) => {
    const out = [...blueprints];
    while (out.length < minimum) {
      out.push({ ...((blueprints[0] as object) ?? {}) });
    }
    return out;
  },
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

describe("buildGenerationJobInputFromSnapshot — P0.6 guard", () => {
  const originalFlag = process.env.MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY;

  beforeEach(() => {
    delete process.env.MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY;
  });
  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY;
    } else {
      process.env.MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY = originalFlag;
    }
  });

  it("bloque par défaut quand panelBlueprints < minimumImages", async () => {
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

  it("autorise l'expansion legacy quand le flag est actif", async () => {
    process.env.MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY = "true";
    const { buildGenerationJobInputFromSnapshot } = await import(
      "@/lib/premium-chapter-contract"
    );
    const snapshot = makeSnapshot(makeValidBlueprints(40), 75);
    const out = buildGenerationJobInputFromSnapshot({
      source: "test",
      chapterId: "c1",
      focusCharacterIds: [],
      snapshot,
      approvedOutline: { approvalVersion: 1 } as unknown as Parameters<
        typeof buildGenerationJobInputFromSnapshot
      >[0]["approvedOutline"],
    });
    expect((out.panelBlueprints as unknown[]).length).toBe(75);
  });
});
