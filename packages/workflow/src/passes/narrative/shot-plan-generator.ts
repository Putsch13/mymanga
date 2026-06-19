/**
 * Génère le `ChapterShotPlan` pour le narrative-pass legacy.
 *
 * Couvre :
 *   - tentative principale via `directShotPlan` (heroes + antagonists + important NPCs)
 *   - fallback simplifié si la première tentative échoue
 *   - mutation des `degradedModes` du bundle si les deux fallbacks échouent
 *
 * Extrait depuis `narrative-pass.ts`.
 */

import { isHeroRole } from "@manga-ai-studio/core";
import type { ChapterShotPlan } from "@manga-ai-studio/core";
import { logPipelineError, logPipelineInfo, logPipelineWarn } from "../../lib/pipeline-logger";
import { setJobProgress } from "../../pipeline-job";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseRecord = any;

export interface ImportantNpc {
  characterId: string;
  name: string;
  role: "important_npc";
  firstAppearanceSceneIndex: number;
}

export interface ShotPlanGeneratorInput {
  jobId: string;
  chapterId: string;
  projectId: string;
  beats: Array<{ id: string; characters?: string[]; location?: string; summary?: string; pageRole?: string; purpose?: string }>;
  rawCharacters: LooseRecord[];
  chapterGenreMode: string;
  bundleDiagnostics: LooseRecord;
}

export interface ShotPlanGeneratorResult {
  chapterShotPlan: ChapterShotPlan | null;
  importantNpcs: ImportantNpc[];
}

export async function generateChapterShotPlan(
  input: ShotPlanGeneratorInput,
): Promise<ShotPlanGeneratorResult> {
  const { jobId, chapterId, projectId, beats, rawCharacters, chapterGenreMode, bundleDiagnostics } = input;

  let chapterShotPlan: ChapterShotPlan | null = null;
  let importantNpcs: ImportantNpc[] = [];

  try {
    const { directShotPlan } = await import("@manga-ai-studio/ai");

    const antagonists = rawCharacters
      .filter((c: LooseRecord) => /antagonist|villain|rival/i.test(c.roleType ?? ""))
      .map((c: LooseRecord) => ({ characterId: c.id, name: c.name, role: "antagonist" as const }));
    const heroes = rawCharacters
      .filter((c: LooseRecord) => isHeroRole(c.roleType))
      .map((c: LooseRecord) => ({ characterId: c.id, name: c.name, role: "hero" as const }));

    // Inclut tous les PNJ importants et récurrents (pas seulement mentor/deuteragonist)
    // firstAppearanceSceneIndex = index du premier beat où ce personnage est cité
    importantNpcs = rawCharacters
      .filter((c: LooseRecord) => /mentor|deuteragonist|secondary|important|recurring/i.test(c.roleType ?? ""))
      .map((c: LooseRecord) => {
        const firstName = (c.name as string).toLowerCase().split(/\s/)[0] ?? "";
        const firstBeatIdx = beats.findIndex((b) =>
          (b.characters ?? []).some((bc) => bc.toLowerCase().includes(firstName)),
        );
        return {
          characterId: c.id as string,
          name: c.name as string,
          role: "important_npc" as const,
          firstAppearanceSceneIndex: firstBeatIdx >= 0 ? firstBeatIdx : 0,
        };
      });

    chapterShotPlan = directShotPlan({
      beats: beats.map((b) => ({
        id: b.id,
        pageRole: (b.pageRole ?? b.purpose) as string,
        characters: b.characters ?? [],
        location: b.location ?? "",
        summary: b.summary ?? "",
      })),
      genreMode: chapterGenreMode,
      importantCharacters: [...heroes, ...antagonists, ...importantNpcs],
    });
    logPipelineInfo(
      "shot_plan_success",
      {
        pages: chapterShotPlan.pages.length,
        rhythm: chapterShotPlan.rhythm,
        emphasis: chapterShotPlan.emphasis.length,
      },
      { jobId, chapterId, projectId },
    );
  } catch (shotPlanErr) {
    logPipelineWarn(
      "shot_plan_primary_failed",
      { error: shotPlanErr instanceof Error ? shotPlanErr.message : String(shotPlanErr) },
      { jobId, chapterId, projectId },
    );
    try {
      const { directShotPlan: fallbackShotPlan } = await import("@manga-ai-studio/ai");
      chapterShotPlan = fallbackShotPlan({
        beats: beats.map((b) => ({
          id: b.id,
          pageRole: (b.pageRole ?? "standard") as string,
          characters: b.characters ?? [],
          location: b.location ?? "",
          summary: b.summary ?? "",
        })),
        genreMode: "standard",
        importantCharacters: [],
      });
      logPipelineInfo(
        "shot_plan_fallback_ok",
        { pages: chapterShotPlan.pages.length, rhythm: chapterShotPlan.rhythm },
        { jobId, chapterId, projectId },
      );
    } catch (fallbackErr) {
      logPipelineError(
        "shot_plan_critical_failure",
        { error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr) },
        { jobId, chapterId, projectId },
      );
    }
  }

  // P0.16 : fail loud si shot plan toujours manquant après les deux fallbacks.
  // On ne throw pas (le pipeline peut encore générer sans), mais on remonte
  // clairement le mode dégradé via jobProgress + diagnostics.
  if (!chapterShotPlan) {
    try {
      await setJobProgress(
        jobId,
        { key: "shot_plan", label: "shot_plan", detail: "failed_both_providers" },
        "failed",
      );
    } catch {
      /* non-blocking */
    }
    try {
      const degraded = bundleDiagnostics.degradedModes ?? [];
      if (!degraded.includes("shot_plan_missing")) degraded.push("shot_plan_missing");
      bundleDiagnostics.degradedModes = degraded;
      bundleDiagnostics.operationalStatus = "DEGRADED_SHOT_PLAN_MISSING";
    } catch {
      /* shape mismatch non-blocking */
    }
  }

  return { chapterShotPlan, importantNpcs };
}
