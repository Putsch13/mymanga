/**
 * P2.1 — Usecase : construit le dashboard readiness premium côté serveur.
 *
 * Agit comme un point d’entrée unique pour les routes `readiness` / `studio` /
 * `launch` afin qu’elles partagent la même logique de scoring et d’erreurs
 * catalogue (P2.3).
 */

import type { ChapterStudioSnapshot } from "@manga-ai-studio/core";
import {
  buildPremiumReadinessDashboard,
  type PremiumReadinessDashboard,
} from "@/lib/readiness/build-premium-readiness-dashboard";
import type { Usecase } from "./types";

export type BuildPremiumReadinessDashboardInput = {
  snapshot: ChapterStudioSnapshot;
  projectId: string;
  chapterId: string;
  chapterNumber: number | null;
};

export type BuildPremiumReadinessDashboardOutput = {
  dashboard: PremiumReadinessDashboard;
};

export const buildPremiumReadinessDashboardUsecase: Usecase<
  BuildPremiumReadinessDashboardInput,
  BuildPremiumReadinessDashboardOutput
> = {
  name: "buildPremiumReadinessDashboard",
  async execute(input) {
    const dashboard = buildPremiumReadinessDashboard({
      snapshot: input.snapshot,
      projectId: input.projectId,
      chapterId: input.chapterId,
      chapterNumber: input.chapterNumber,
    });
    return { dashboard };
  },
};
