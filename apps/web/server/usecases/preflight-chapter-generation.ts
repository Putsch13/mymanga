/**
 * P2.1 — Usecase : preflight d’un chapitre avant launch.
 *
 * Compose le canon readiness studio + le dashboard premium readiness pour
 * fournir un verdict unifié à la route launch.
 *
 *   - `blocked`  : refuser le launch et exposer les erreurs catalogue (P2.3)
 *   - `warning`  : laisser passer mais surfacer les warnings
 *   - `ready`    : feu vert
 */

import type { ChapterStudioSnapshot } from "@manga-ai-studio/core";
import { assertChapterCanonReadiness, type ChapterCanonReadinessReport } from "@/lib/canon/assert-chapter-canon-readiness";
import {
  buildPremiumReadinessDashboard,
  type PremiumReadinessDashboard,
} from "@/lib/readiness/build-premium-readiness-dashboard";
import { canonViolationsToPremiumErrors, type GenerationError } from "@/shared/errors/generation-errors";
import type { Usecase } from "./types";

export type PreflightChapterGenerationUsecaseInput = {
  projectId: string;
  chapterId: string;
  chapterNumber: number | null;
  snapshot: ChapterStudioSnapshot;
  /** IDs personnages explicitement requis par le chapitre (optionnel). */
  requiredCharacterIds?: string[] | null;
};

export type PreflightChapterGenerationUsecaseOutput = {
  status: "ready" | "warning" | "blocked";
  dashboard: PremiumReadinessDashboard;
  canonReadiness: ChapterCanonReadinessReport;
  /** Erreurs catalogue (P2.3) issues du canon studio + dashboard. */
  errors: GenerationError[];
  /** `true` si une route doit refuser le launch. */
  shouldBlock: boolean;
};

export const preflightChapterGenerationUsecase: Usecase<
  PreflightChapterGenerationUsecaseInput,
  PreflightChapterGenerationUsecaseOutput
> = {
  name: "preflightChapterGeneration",
  async execute(input) {
    const dashboard = buildPremiumReadinessDashboard({
      snapshot: input.snapshot,
      projectId: input.projectId,
      chapterId: input.chapterId,
      chapterNumber: input.chapterNumber,
    });

    const canonReadiness = await assertChapterCanonReadiness({
      projectId: input.projectId,
      requiredCharacterIds: input.requiredCharacterIds ?? null,
    });

    const canonErrors = canonViolationsToPremiumErrors(
      canonReadiness.violations.map((v) => ({
        characterId: v.characterId,
        characterName: v.characterName,
        roleType: v.roleType,
        reason: v.reason,
        severity: v.severity,
      })),
      { projectId: input.projectId, chapterId: input.chapterId },
    );

    const errors: GenerationError[] = [...dashboard.catalogErrors, ...canonErrors];

    let status: PreflightChapterGenerationUsecaseOutput["status"];
    if (dashboard.status === "blocked" || canonReadiness.blocking) {
      status = "blocked";
    } else if (dashboard.status === "warning" || !canonReadiness.ok) {
      status = "warning";
    } else {
      status = "ready";
    }

    return {
      status,
      dashboard,
      canonReadiness,
      errors,
      shouldBlock: status === "blocked",
    };
  },
};
