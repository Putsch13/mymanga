/**
 * DIFF-5 — Tests d'intégration non-mockés des garde-fous métier critiques.
 *
 * Contrairement aux tests HTTP classiques qui mockent `prisma`, `@manga-ai-studio/workflow`,
 * etc., ces tests exercent directement les helpers applicatifs (`premium-chapter-contract`,
 * `age-gate`, `assertPremiumContractFromChapter`) sans aucun mock, pour valider
 * les comportements que la couche HTTP est censée déclencher.
 *
 * Couvre :
 *   - P1-1 : assertPremiumContractFromChapter bloque les chapter.outline incomplets
 *   - P1-3 : InvalidBlueprintsError lève un 422 structuré côté routes launch/pipeline
 *   - P1-6 : canBypassMatureContent respecte NODE_ENV=production
 */

import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// Pré-warm : le premier `await import("@manga-ai-studio/workflow")` coûte
// ~1.5s de transform vitest en cold cache. Sans pré-warm, le premier `it`
// du fichier mange tout son timeout (flake `Test timed out in 5000ms`).
beforeAll(async () => {
  await import("@manga-ai-studio/workflow");
}, 90_000);

// ────────────────────────────────────────────────────────────────────────────
// P1-1 — assertPremiumContractFromChapter
// ────────────────────────────────────────────────────────────────────────────

describe("assertPremiumContractFromChapter (P1-1 defense-in-depth)", () => {
  it("rejette un chapter.outline null", async () => {
    const { assertPremiumContractFromChapter } = await import("@manga-ai-studio/workflow");
    const res = assertPremiumContractFromChapter(null, 10);
    expect(res.ok).toBe(false);
    expect(res.missing.length).toBeGreaterThan(0);
  });

  it("rejette un chapter.outline sans beats", async () => {
    const { assertPremiumContractFromChapter } = await import("@manga-ai-studio/workflow");
    const outline = {
      studio: {
        data: {
          productionPlan: { panelBlueprints: [{ panelNumber: 1 }], minimumImages: 6 },
        },
      },
    };
    const res = assertPremiumContractFromChapter(outline, 6);
    expect(res.ok).toBe(false);
    expect(res.missing.some((m) => /beats/i.test(m))).toBe(true);
  });

  it("rejette un chapter.outline sans panelBlueprints", async () => {
    const { assertPremiumContractFromChapter } = await import("@manga-ai-studio/workflow");
    const outline = {
      approvedOutline: { beats: [{ beatId: "b1" }, { beatId: "b2" }] },
      studio: {
        data: {
          productionPlan: { panelBlueprints: [], minimumImages: 6 },
        },
      },
    };
    const res = assertPremiumContractFromChapter(outline, 6);
    expect(res.ok).toBe(false);
    expect(res.missing.some((m) => /blueprint/i.test(m))).toBe(true);
  });

  it("accepte un chapter.outline complet", async () => {
    const { assertPremiumContractFromChapter } = await import("@manga-ai-studio/workflow");
    const outline = {
      approvedOutline: { beats: [{ beatId: "b1" }, { beatId: "b2" }] },
      studio: {
        data: {
          productionOutline: { beats: [{ beatId: "b1" }, { beatId: "b2" }] },
          productionPlan: {
            panelBlueprints: [
              { panelNumber: 1, sceneId: "s1" },
              { panelNumber: 2, sceneId: "s2" },
            ],
            minimumImages: 6,
          },
        },
      },
    };
    const res = assertPremiumContractFromChapter(outline, 6);
    expect(res.ok).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// P1-3 — InvalidBlueprintsError
// ────────────────────────────────────────────────────────────────────────────

describe("buildGenerationJobInputFromSnapshot (P1-3 invalid blueprints blocking)", () => {
  function makeSnapshot(blueprints: Array<Record<string, unknown>>) {
    const productionOutline = { beats: [{ beatId: "b1", summary: "x" }] };
    return {
      data: {
        productionOutline,
        productionPlan: {
          minimumImages: blueprints.length,
          panelBlueprints: blueprints,
        },
        coverage: {},
      },
      planVersion: 1,
      readinessStatus: "ready",
      premiumChapterStatus: "plan_ready",
    } as never;
  }

  it("lève InvalidBlueprintsError quand tous les blueprints sont invalides", async () => {
    const { buildGenerationJobInputFromSnapshot, InvalidBlueprintsError } = await import(
      "@/lib/premium-chapter-contract"
    );
    const snapshot = makeSnapshot([{}, {}]);
    expect(() =>
      buildGenerationJobInputFromSnapshot({
        snapshot,
        chapterId: "ch1",
        source: "test",
        approvedOutline: { beats: [{ beatId: "b1", summary: "x" }] } as never,
      }),
    ).toThrow(InvalidBlueprintsError);
  });

  it("InvalidBlueprintsError expose la liste des panels invalides", async () => {
    const { buildGenerationJobInputFromSnapshot, InvalidBlueprintsError } = await import(
      "@/lib/premium-chapter-contract"
    );
    const snapshot = makeSnapshot([{ panelNumber: 7 }]);
    try {
      buildGenerationJobInputFromSnapshot({
        snapshot,
        chapterId: "ch1",
        source: "test",
        approvedOutline: { beats: [{ beatId: "b1", summary: "x" }] } as never,
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidBlueprintsError);
      const e = err as InstanceType<typeof InvalidBlueprintsError>;
      expect(Array.isArray(e.invalidBlueprints)).toBe(true);
      expect(e.invalidBlueprints.length).toBeGreaterThan(0);
      expect(e.code).toBe("INVALID_BLUEPRINTS");
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// P1-6 — canBypassMatureContent gate NODE_ENV
// ────────────────────────────────────────────────────────────────────────────

describe("canBypassMatureContent (P1-6 prod bypass guard)", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalEnableFlag = process.env.ENABLE_ADULT_BYPASS;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
    if (originalEnableFlag === undefined) {
      delete process.env.ENABLE_ADULT_BYPASS;
    } else {
      process.env.ENABLE_ADULT_BYPASS = originalEnableFlag;
    }
    vi.resetModules();
  });

  it("bypasse en dev pour test@gmail.com", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    delete process.env.ENABLE_ADULT_BYPASS;
    const { canBypassMatureContent } = await import("@/lib/age-gate");
    expect(canBypassMatureContent("test@gmail.com")).toBe(true);
  });

  it("bypasse en test pour test@gmail.com", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
    delete process.env.ENABLE_ADULT_BYPASS;
    const { canBypassMatureContent } = await import("@/lib/age-gate");
    expect(canBypassMatureContent("test@gmail.com")).toBe(true);
  });

  it("REFUSE le bypass en production par défaut", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.ENABLE_ADULT_BYPASS;
    const { canBypassMatureContent } = await import("@/lib/age-gate");
    expect(canBypassMatureContent("test@gmail.com")).toBe(false);
  });

  it("autorise le bypass en production UNIQUEMENT si ENABLE_ADULT_BYPASS=true", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.ENABLE_ADULT_BYPASS = "true";
    const { canBypassMatureContent } = await import("@/lib/age-gate");
    expect(canBypassMatureContent("test@gmail.com")).toBe(true);
  });

  it("ne bypasse JAMAIS un email non-listé même en dev", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    const { canBypassMatureContent } = await import("@/lib/age-gate");
    expect(canBypassMatureContent("random@user.com")).toBe(false);
    expect(canBypassMatureContent(null)).toBe(false);
    expect(canBypassMatureContent(undefined)).toBe(false);
    expect(canBypassMatureContent("")).toBe(false);
  });
});
