/**
 * Gate "premium readiness score" pré-launch — **advisory only**.
 *
 * Recalcule le score `computePremiumReadinessScore` depuis les blueprints
 * actuels (ou retombe sur la valeur persistée), et log un warning si le
 * score est sous le seuil — mais ne bloque jamais le launch.
 */
import {
  getPremiumReadinessLaunchMinScore,
  isPipelineV3PremiumOnlyEnabled,
  type ChapterStudioSnapshot,
  type PanelBlueprintPremium,
} from "@manga-ai-studio/core";
import {
  computePremiumReadinessScore,
  type PremiumReadinessCastContext,
} from "@manga-ai-studio/ai";

export type RunPremiumReadinessGateResult = { ok: true };

export function runPremiumReadinessGate(args: {
  chapterId: string;
  studioSnapshotForLaunch: ChapterStudioSnapshot;
  heroCharacterId: string | null;
  secondaryHeroCharacterId: string | null;
  deuteragonistCharacterId: string | null;
  structuralCanonicalQaPassed: boolean;
}): RunPremiumReadinessGateResult {
  if (!isPipelineV3PremiumOnlyEnabled()) return { ok: true };

  const {
    chapterId,
    studioSnapshotForLaunch,
    heroCharacterId,
    secondaryHeroCharacterId,
    deuteragonistCharacterId,
  } = args;

  const pp = studioSnapshotForLaunch.data.productionPlan;
  const ppRec = pp && typeof pp === "object" ? (pp as Record<string, unknown>) : null;
  const bps = ppRec?.panelBlueprints;

  let score: number | null = null;
  let scoreSource: "recomputed_from_blueprints" | "persisted_metadata" = "persisted_metadata";

  if (Array.isArray(bps) && bps.length > 0) {
    const premiumReadinessCast: PremiumReadinessCastContext = {
      heroCharacterId,
      secondaryHeroCharacterId,
      deuteragonistCharacterId,
    };
    score = computePremiumReadinessScore(bps as PanelBlueprintPremium[], premiumReadinessCast);
    scoreSource = "recomputed_from_blueprints";
  } else if (ppRec && typeof ppRec.premiumReadinessScore === "number") {
    score = ppRec.premiumReadinessScore as number;
  }

  const minReadiness = getPremiumReadinessLaunchMinScore();
  if (score !== null && score < minReadiness) {
    console.warn(
      `[launch] premium_readiness_advisory chapterId=${chapterId} premiumReadinessScore=${score.toFixed(2)} `
      + `threshold=${minReadiness.toFixed(2)} scoreSource=${scoreSource} `
      + "— lancement autorisé : readiness informatif uniquement",
    );
  }

  return { ok: true };
}
