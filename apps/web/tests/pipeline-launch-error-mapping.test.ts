import { describe, expect, it } from "vitest";
import {
  mapLaunchError,
  type LaunchErrorPayload,
} from "@/app/(app)/projects/[id]/pipeline/_components/map-launch-error";

/**
 * P0.6 — l'UI pipeline doit traduire les codes d'erreur backend
 * (incomplete_plan, INCOMPLETE_PLAN, invalid_blueprints, SHOT_MONOTONY,
 * premium_contract_incomplete) en messages actionnables, pas en texte brut.
 */
describe("mapLaunchError", () => {
  it("traduit INCOMPLETE_PLAN avec le ratio panelBlueprintCount/minimumImages", () => {
    const msg = mapLaunchError({
      error: "incomplete_plan",
      code: "INCOMPLETE_PLAN",
      panelBlueprintCount: 52,
      minimumImages: 75,
      message: "message backend brut à masquer",
    });
    expect(msg).toContain("52");
    expect(msg).toContain("75");
    expect(msg).toContain("Régénérer le plan");
    expect(msg).toContain("incomplet");
  });

  it("traduit error: incomplete_plan sans code", () => {
    const msg = mapLaunchError({
      error: "incomplete_plan",
      panelBlueprintCount: 40,
      minimumImages: 75,
    });
    expect(msg).toContain("40");
    expect(msg).toContain("75");
  });

  it("fournit un fallback si panelBlueprintCount/minimumImages sont absents", () => {
    const msg = mapLaunchError({ code: "INCOMPLETE_PLAN" });
    expect(msg).toContain("moins de blueprints");
    expect(msg).toContain("Régénérer le plan");
  });

  it("traduit INVALID_BLUEPRINTS avec le nombre total", () => {
    const msg = mapLaunchError({
      error: "invalid_blueprints",
      code: "INVALID_BLUEPRINTS",
      totalInvalid: 3,
    });
    expect(msg).toContain("3");
    expect(msg).toContain("invalide");
    expect(msg).toContain("régénère");
  });

  it("traduit SHOT_MONOTONY avec le varietyScore", () => {
    const msg = mapLaunchError({
      code: "SHOT_MONOTONY",
      varietyScore: 0.42,
      missingShots: ["wide_shot", "close_up"],
    });
    expect(msg).toContain("42%");
    expect(msg).toContain("wide_shot");
    expect(msg).toContain("close_up");
  });

  it("traduit premium_only_launch_route_required vers le studio chapitre", () => {
    const msg = mapLaunchError({
      error: "premium_only_launch_route_required",
      message: "En production premium-only, utilisez POST .../launch.",
    });
    expect(msg).toContain("studio chapitre");
    expect(msg).toContain("Génération");
  });

  it("traduit premium_contract_incomplete avec la liste des champs manquants", () => {
    const msg = mapLaunchError({
      error: "premium_contract_incomplete",
      missing: ["productionPlan.panelBlueprints", "productionOutline.beats[3].requiredProps"],
    });
    expect(msg).toContain("productionPlan.panelBlueprints");
    expect(msg).toContain("productionOutline");
    expect(msg).toContain("studio");
  });

  it("traduit PRODUCTION_PLAN_STRUCTURAL_QA_FAILED avec ratios et seuils", () => {
    const msg = mapLaunchError({
      error: "production_plan_structural_qa_failed",
      code: "PRODUCTION_PLAN_STRUCTURAL_QA_FAILED",
      structuralMetrics: {
        totalPanels: 72,
        totalBeats: 10,
        totalPages: 24,
        cutawayCount: 40,
        cutawayRatio: 0.55,
        actorDrivenCount: 30,
        actorDrivenRatio: 0.42,
        heroCount: 0,
        duoCount: 0,
        enemyCount: 0,
        reactionCount: 0,
        actionCount: 0,
        environmentCount: 0,
        propCount: 0,
        npcCount: 0,
        groupCount: 0,
        dialogueAnchoredCount: 0,
        dialogueFloatingCount: 0,
        narrationCount: 0,
        silentCount: 0,
        intentionalSilenceCount: 0,
        sfxCount: 0,
        maxConsecutiveCutaways: 9,
        focusDistribution: {},
        shotDistribution: {},
        roleDistribution: {} as Record<string, number>,
      },
      structuralQa: {
        valid: false,
        errors: ["2 characters required by beats are absent from panels: id-a, id-b"],
        warnings: [],
        details: {
          cutawayRatioOk: false,
          actorDrivenRatioOk: false,
          consecutiveCutawaysOk: false,
          beatCoverageOk: true,
          dialogueCoverageOk: true,
          panelCountOk: true,
        },
      },
    } as LaunchErrorPayload);
    expect(msg).toContain("55.0%");
    expect(msg).toContain("30%");
    expect(msg).toContain("id-a");
    expect(msg).toContain("régénérer");
  });

  it("traduit PREMIUM_CONTINUITY_PREFLIGHT_FAILED", () => {
    const msg = mapLaunchError({
      error: "premium_continuity_preflight_failed",
      code: "PREMIUM_CONTINUITY_PREFLIGHT_FAILED",
      continuityBlockers: ["panel-1:critical_panel_missing_character_visual_dna:hero-1"],
    });
    expect(msg).toContain("DNA");
    expect(msg).toContain("panel-1");
  });

  it("traduit PREMIUM_AI_READINESS_FAILED avec les raisons bloquantes", () => {
    const msg = mapLaunchError({
      error: "premium_ai_readiness_failed",
      code: "PREMIUM_AI_READINESS_FAILED",
      premiumBlockingReasons: ["outline: OPENAI_API_KEY absente", "imageProvider: aucun FAL_KEY"],
    });
    expect(msg).toContain("OPENAI_API_KEY");
    expect(msg).toContain("FAL_KEY");
    expect(msg).toContain("moteurs IA");
  });

  it("fallback sur payload.message si le code est inconnu", () => {
    const msg = mapLaunchError({
      code: "UNKNOWN",
      message: "Boom technique",
    });
    expect(msg).toBe("Boom technique");
  });

  it("fallback générique si payload vide", () => {
    expect(mapLaunchError(null)).toBe("Erreur de lancement.");
    expect(mapLaunchError({})).toBe("Erreur de lancement.");
  });
});
