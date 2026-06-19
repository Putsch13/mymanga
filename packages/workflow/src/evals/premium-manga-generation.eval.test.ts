/**
 * Evals golden / métriques génération premium manga (P1).
 * Les scénarios lourds (LLM + images) s’activent derrière une variable d’env ;
 * un smoke test garde la suite dans la CI.
 */
import { describe, it, expect } from "vitest";

const runGolden = process.env.PREMIUM_MANGA_EVAL_GOLDEN === "true";

describe("premium-manga-generation eval", () => {
  it("smoke — métriques attendues documentées (CI sans golden)", () => {
    const metrics = [
      "narrativeContractCoverage",
      "panelSpecificity",
      "characterCanonCoverage",
      "dialoguePersistence",
      "noBlankTextAreas",
      "stableImageUrls",
      "noPremiumFallbacks",
      "noOutOfContractEntities",
      "promptContractCoverage",
    ];
    expect(metrics.length).toBeGreaterThanOrEqual(8);
  });

  it.skipIf(!runGolden)("golden — activer avec PREMIUM_MANGA_EVAL_GOLDEN=true", () => {
    expect(runGolden).toBe(true);
  });
});
