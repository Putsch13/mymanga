/**
 * P5.2 — Gate "premium readiness score" pré-launch (mode v3 premium-only).
 *
 * Recalcule le score `computePremiumReadinessScore` depuis les blueprints
 * actuels (ou retombe sur la valeur persistée), et bloque le launch si le
 * score est sous le seuil ENV `PREMIUM_READINESS_LAUNCH_MIN_SCORE` — sauf si
 * la QA structurelle canonique a déjà validé le plan (advisory).
 */
import { NextResponse } from "next/server";
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

export type RunPremiumReadinessGateResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

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
    structuralCanonicalQaPassed,
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
  if (score === null || score >= minReadiness) return { ok: true };

  if (structuralCanonicalQaPassed) {
    console.info(
      `[launch] premium_readiness_advisory chapterId=${chapterId} premiumReadinessScore=${score.toFixed(2)} `
      + `threshold=${minReadiness.toFixed(2)} scoreSource=${scoreSource} structuralCanonicalQaPassed=true `
      + "— lancement autorisé : la QA structurelle canonique prime sur le score heuristique",
    );
    return { ok: true };
  }

  console.warn(
    `[launch] premium_readiness_blocked chapterId=${chapterId} premiumReadinessScore=${score.toFixed(2)} `
    + `threshold=${minReadiness.toFixed(2)} scoreSource=${scoreSource}`,
  );
  return {
    ok: false,
    response: NextResponse.json(
      {
        error: "premium_readiness_too_low",
        code: "PREMIUM_READINESS_TOO_LOW",
        message:
          `Le score de préparation premium (${score.toFixed(2)}) est sous le seuil requis (${minReadiness.toFixed(2)}) `
          + "et la QA structurelle n'a pas pu valider des blueprints présents. Renforce le plan ou baisse le seuil via PREMIUM_READINESS_LAUNCH_MIN_SCORE.",
        premiumReadinessScore: score,
        minReadinessScore: minReadiness,
      },
      { status: 422 },
    ),
  };
}
