/**
 * AUDIT v2 — `buildGenerationJobInputFromSnapshot` garantit `>= minimumImages`
 * images dans le contrat de génération :
 *   - si la matière narrative produit déjà assez de blueprints → passthrough
 *   - sinon l'enrichisseur narratif (`expandBlueprintsToMinimum`) ajoute des
 *     plans de coupe / reactions / inserts dérivés des beats existants
 *   - le guard `IncompletePlanError` ne déclenche plus que dans les cas
 *     extrêmes (0 blueprint exploitable, enrichissement impossible)
 */
import { describe, it, expect, vi } from "vitest";

// Le mock doit exposer `expandBlueprintsToMinimum` et
// `buildPremiumChapterContractAsync` — le premier est utilisé par le contrat
// pour produire les blueprints complémentaires. Pour les tests on fournit un
// passthrough minimal qui duplique le dernier blueprint tant que le minimum
// n'est pas atteint (suffisant pour faire sauter le guard).
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

describe("buildGenerationJobInputFromSnapshot — AUDIT v2 (enrichissement narratif)", () => {
  it("passthrough quand panelBlueprints >= minimumImages (aucun enrichissement)", async () => {
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

  it("enrichit automatiquement quand panelBlueprints < minimumImages (pas de throw)", async () => {
    const { buildGenerationJobInputFromSnapshot } = await import(
      "@/lib/premium-chapter-contract"
    );
    const snapshot = makeSnapshot(makeValidBlueprints(49), 75);
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

  it("throw IncompletePlanError quand la matière narrative est vide (enrichissement impossible)", async () => {
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
