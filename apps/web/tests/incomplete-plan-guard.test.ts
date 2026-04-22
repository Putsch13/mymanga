/**
 * P1bis — `buildGenerationJobInputFromSnapshot` accepte désormais le count natif.
 * On ne padd plus vers minimumImages (legacy `expandBlueprintsToMinimum`
 * définitivement désactivé) et on ne bloque plus sous la cible 70-75.
 *
 * Règle produit :
 *   - rawCount === 0 → `IncompletePlanError` (pas de plan exploitable)
 *   - 1 ≤ rawCount (n'importe quel count) → passthrough, aucun padding.
 *     Sous la cible, on loggue un warning mais on laisse passer la génération.
 *
 * Ce test garantit qu'on ne revient JAMAIS au vieux modèle
 * `expandBlueprintsToMinimum`.
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

describe("buildGenerationJobInputFromSnapshot — P1 pas d'enrichissement legacy", () => {
  it("passthrough quand le découpage natif est dans la range 70-75", async () => {
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
    // Aucun padding : on garde exactement le count natif.
    expect((out.panelBlueprints as unknown[]).length).toBe(72);
  });

  it("P1bis — passthrough quand rawCount < cible 70 (pas de padding, pas de blocage)", async () => {
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
    // Count natif préservé : 49 panels, sans expansion vers 70-75.
    expect((out.panelBlueprints as unknown[]).length).toBe(49);
  });

  it("throw IncompletePlanError quand la matière narrative est vide", async () => {
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
