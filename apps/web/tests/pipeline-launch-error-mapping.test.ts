import { describe, expect, it } from "vitest";
import { mapLaunchError } from "@/app/(app)/projects/[id]/pipeline/_components/map-launch-error";

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
