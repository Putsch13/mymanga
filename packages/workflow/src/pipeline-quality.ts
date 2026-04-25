/**
 * Quality report and blueprint resolution helpers.
 * Extracted from run-full-chapter-pipeline.ts for testability.
 */
import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import type { CreativityControls } from "@manga-ai-studio/world";
import {
  computeChapterQualityReport as computeChapterQualityReportShared,
} from "./chapter-runtime-helpers";

export type PipelineJobInput = {
  heroCharacterId?: string | null;
  focusCharacterIds?: string[];
  activeNpcIds?: string[];
  activeCreatureIds?: string[];
  locationIds?: string[];
  selectedPlotLabel?: "safe" | "bold" | "shock";
  creativityControls?: Partial<CreativityControls>;
  panelBlueprints?: unknown[];
  productionPlanPages?: unknown[];
  productionPlan?: unknown;
  premiumReadinessScore?: number;
  /** Persistance studio : dialoguiste scène pour ce run (s’ajoute à OPENAI_SCENE_DIALOGUE_ENRICH). */
  sceneDialogueEnrich?: boolean;
};

export function resolveEffectivePanelBlueprints(opts: {
  jobInput: PipelineJobInput;
  studioSnapshot: { data?: { productionPlan?: { panelBlueprints?: unknown[] } } } | null;
}): PanelBlueprintPremium[] {
  if (Array.isArray(opts.jobInput.panelBlueprints) && opts.jobInput.panelBlueprints.length > 0) {
    return opts.jobInput.panelBlueprints as PanelBlueprintPremium[];
  }
  const snapshotBlueprints = opts.studioSnapshot?.data?.productionPlan?.panelBlueprints;
  if (Array.isArray(snapshotBlueprints) && snapshotBlueprints.length > 0) {
    return snapshotBlueprints as PanelBlueprintPremium[];
  }
  return [];
}

export function findPanelBlueprint(
  blueprints: PanelBlueprintPremium[],
  sceneIndex: number,
  panelNumber: number,
): PanelBlueprintPremium | undefined {
  if (blueprints.length === 0) return undefined;

  // Stratégie 1 (fiable) : match par pageNumber + panelNumber natifs du blueprint.
  // Depuis BUG-05 fix dans narrative-pass, les blueprints ont pageNumber/panelNumber
  // renumérotés séquentiellement (1,2,3…) — donc un match exact est plus fréquent.
  const pageNumber = sceneIndex + 1;
  const byPageAndPanel = blueprints.find(
    (bp) => bp.pageNumber === pageNumber && bp.panelNumber === panelNumber,
  );
  if (byPageAndPanel) return byPageAndPanel;

  // Stratégie 2 : parse "beat_N" — supporte les formats beat_N, beat_N_xxx, etc.
  const beatBlueprints = blueprints.filter((bp) => {
    if (!bp.beatId) return false;
    const match = bp.beatId.match(/^beat_(\d+)/);
    if (!match) return false;
    const bpBeatIndex = parseInt(match[1] ?? "0", 10) - 1;
    return bpBeatIndex === sceneIndex;
  });
  if (beatBlueprints.length > 0) {
    return beatBlueprints[panelNumber - 1] ?? beatBlueprints[0];
  }

  // BUG-04 fix : stratégie 3 corrigée — group-by beatId plutôt que flatten+sceneIndex*6.
  // L'ancienne heuristique (sceneIndex * 6 + panelNumber - 1) supposait 6 panels par
  // scène en dur ; c'était faux dès qu'un template produisait 3/4/5/7 panels, et
  // tombait quasi toujours sur blueprints[0] (souvent l'establishing hero-center).
  const byBeat = new Map<string, PanelBlueprintPremium[]>();
  for (const bp of blueprints) {
    const key = bp.beatId ?? "__none__";
    const arr = byBeat.get(key);
    if (arr) arr.push(bp);
    else byBeat.set(key, [bp]);
  }
  const groups = [...byBeat.values()];
  const targetGroup = groups[sceneIndex] ?? groups[groups.length - 1];
  if (!targetGroup || targetGroup.length === 0) return blueprints[0];
  return targetGroup[panelNumber - 1] ?? targetGroup[targetGroup.length - 1];
}

export function normalizeCreativeControls(
  value: Partial<CreativityControls> | undefined,
  canonStrictness: number | null | undefined,
): CreativityControls {
  const input = value ?? {};
  const clamp = (raw: number | undefined, fallback: number) =>
    Math.max(0, Math.min(100, Number.isFinite(raw) ? Number(raw) : fallback));
  return {
    noveltyLevel: clamp(input.noveltyLevel, 55),
    worldStrictness: clamp(input.worldStrictness, canonStrictness ?? 85),
    visualExoticism: clamp(input.visualExoticism, 50),
    npcVariety: clamp(input.npcVariety, 60),
    environmentRichness: clamp(input.environmentRichness, 78),
  };
}

export function computeChapterQualityReport(
  rows: Array<{
    consistencyScore: number | null;
    metadata: unknown;
  }>,
) {
  return computeChapterQualityReportShared(rows);
}
