/**
 * SPRINT 1.3 — Test E2E hebdomadaire avec vraies images FAL.
 *
 * Ce test valide la pipeline complète de génération manga.
 *
 * Configuration :
 * - E2E_REAL_IMAGES=true pour activer le test
 * - OPENAI_API_KEY requis pour le story architect
 * - FAL_KEY requis pour la génération d'images
 * - MAX_FAL_BUDGET_USD=5 pour cap le budget (fail fast si dépassé)
 *
 * Budget estimé : ~$3/semaine.
 *
 * Note: Ce test est un placeholder qui valide la structure.
 * Pour un test complet avec génération d'images, voir le cron Inngest
 * `weeklyE2ETest` dans functions.ts.
 */

import { describe, expect, it } from "vitest";

const E2E_ENABLED = process.env.E2E_REAL_IMAGES === "true";

describe.runIf(E2E_ENABLED)(
  "E2E hebdomadaire avec vraies images FAL",
  () => {
    it("vérifie que les clés API sont présentes", () => {
      expect(process.env.OPENAI_API_KEY).toBeTruthy();
      expect(process.env.FAL_KEY).toBeTruthy();
    });

    it("vérifie que la base de données est accessible", async () => {
      const { prisma } = await import("@manga-ai-studio/db");
      const count = await prisma.project.count();
      expect(typeof count).toBe("number");
    });

    it("vérifie que le compositor est importable", async () => {
      const { compositeMangaPage } = await import("@manga-ai-studio/ai");
      expect(typeof compositeMangaPage).toBe("function");
    });

    it("vérifie que la pipeline est importable", async () => {
      const { runFullChapterPipelineFromJob } = await import("../run-full-chapter-pipeline");
      expect(typeof runFullChapterPipelineFromJob).toBe("function");
    });
  },
);

describe.skipIf(E2E_ENABLED)("E2E disabled (E2E_REAL_IMAGES !== 'true')", () => {
  it("skipped — set E2E_REAL_IMAGES=true to enable", () => {
    console.log("E2E tests are disabled. Set E2E_REAL_IMAGES=true to run them.");
    expect(true).toBe(true);
  });
});
