/**
 * run-visual-contract-qa.ts
 *
 * Pipeline complet de QA visuelle / contractuelle pré-launch :
 *   1. Re-hydration des blueprints avec environmentVisualDna + propVisualDna
 *      (le snapshot peut contenir des blueprints non-hydratés).
 *   2. Shot Variety Enforcer (B3-3) — varietyScore < 0.4 → 422 SHOT_MONOTONY.
 *   3. QA contractuelle unifiée + repair déterministe (P0-3/P0-4/P0-8) —
 *      bloque sur les violations de CONTENU (prop/arme/NPC/ennemi) ; les
 *      `weak_location_binding` sont des warnings.
 *   4. Shot Plan reliability guard — relit `productionPlan.shotPlan` et
 *      bloque si `reliability.launchAllowed === false`.
 *
 * Effet de bord : si le repair contractuel réussit, le helper mute
 * `studioSnapshotForLaunch.data.productionPlan.panelBlueprints` avec les
 * blueprints réparés (équivalent au comportement original).
 *
 * Extrait de `route.ts` pour réduire la taille du handler.
 */
import { NextResponse } from "next/server";
import {
  hydrateBlueprintsWithEnvironmentDna,
  hydrateBlueprintsWithPropDna,
  visualWorldContractSchema,
  type ChapterStudioSnapshot,
  type PanelBlueprintPremium,
} from "@manga-ai-studio/core";
import {
  computeShotVarietyBudget,
  runPremiumPlanContractQa,
} from "@manga-ai-studio/ai";
import {
  repairProductionPlanContractualFocus,
  type FocusViolation,
} from "@manga-ai-studio/core";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export interface RunVisualContractQaInput {
  chapterId: string;
  snapshot: ChapterStudioSnapshot;
  studioSnapshotForLaunch: ChapterStudioSnapshot;
}

export type RunVisualContractQaResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

export function runVisualContractQa(
  input: RunVisualContractQaInput,
): RunVisualContractQaResult {
  const { chapterId, snapshot, studioSnapshotForLaunch } = input;

  // Re-hydration avec le VW contract avant les checks focus/QA.
  let blueprintsForVariety = studioSnapshotForLaunch.data.productionPlan?.panelBlueprints;
  const vwForVariety = visualWorldContractSchema.safeParse(snapshot.data.visualWorldContract);
  if (Array.isArray(blueprintsForVariety) && blueprintsForVariety.length > 0 && vwForVariety.success) {
    try {
      blueprintsForVariety = hydrateBlueprintsWithEnvironmentDna({
        blueprints: blueprintsForVariety as PanelBlueprintPremium[],
        visualWorld: vwForVariety.data,
        strict: false,
      }) as typeof blueprintsForVariety;
      blueprintsForVariety = hydrateBlueprintsWithPropDna({
        blueprints: blueprintsForVariety as PanelBlueprintPremium[],
        visualWorld: vwForVariety.data,
        strict: false,
      }) as typeof blueprintsForVariety;
    } catch (hydrateErr) {
      console.warn(
        `[launch] blueprintsForVariety_rehydration_failed (non-blocking): ${hydrateErr instanceof Error ? hydrateErr.message : hydrateErr}`,
      );
    }
  }

  if (!Array.isArray(blueprintsForVariety) || blueprintsForVariety.length === 0) {
    return { ok: true };
  }

  // 1. Shot Variety Enforcer.
  try {
    const shotVariety = computeShotVarietyBudget(
      blueprintsForVariety as Parameters<typeof computeShotVarietyBudget>[0],
    );
    if (shotVariety.varietyScore < 0.4) {
      console.warn(
        `[launch] shot_monotony chapterId=${chapterId} varietyScore=${shotVariety.varietyScore.toFixed(2)} missingShots=${JSON.stringify(shotVariety.missingShots ?? [])}`,
      );
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: "Variété de plans insuffisante pour lancer la génération.",
            code: "SHOT_MONOTONY",
            varietyScore: shotVariety.varietyScore,
            missingShots: shotVariety.missingShots ?? [],
          },
          { status: 422 },
        ),
      };
    }
  } catch (varietyErr) {
    console.warn(
      `[launch] shot_variety_check_failed (non-blocking): ${varietyErr instanceof Error ? varietyErr.message : varietyErr}`,
    );
  }

  // 2. QA contractuelle unifiée + réparation déterministe.
  try {
    const contractQa = runPremiumPlanContractQa({
      blueprints: blueprintsForVariety as PanelBlueprintPremium[],
    });

    if (!contractQa.ok) {
      const violations: FocusViolation[] = contractQa.blocking.map((type) => ({
        type: type as FocusViolation["type"],
        message: type,
        severity: "blocking" as const,
      }));

      const repairResult = repairProductionPlanContractualFocus(
        blueprintsForVariety as PanelBlueprintPremium[],
        violations,
      );

      // Ne bloquer que si la réparation a échoué sur une violation de CONTENU
      // (prop, arme, NPC, ennemi). weak_location_binding est un warning de
      // qualité de données, pas un blocage de contenu.
      const contentViolations = violations.filter(
        (v) => !(v.type as string).startsWith("weak_location_binding"),
      );
      const failedAfterRepair = contentViolations.length - repairResult.succeeded;
      if (failedAfterRepair > 0) {
        const VIOLATION_MESSAGES: Record<string, string> = {
          missing_prop_insert: "Aucun gros plan d'objet narratif prévu dans le plan.",
          missing_weapon_insert: "Aucun insert arme/objet clé prévu dans le plan.",
          missing_environment: "Aucun panel décor prévu pour ce chapitre.",
          missing_enemy_focus:
            "Un adversaire est requis mais aucun panel ne le met au premier plan.",
          missing_npc_population:
            "Un groupe de personnages est requis mais absent du plan.",
          weak_location_binding_critical:
            "Les décors ne sont pas correctement liés aux panels (>60%).",
          hero_overload_vs_contract: "Le plan est trop centré sur le héros.",
        };
        const details = contractQa.blocking.map((v) => VIOLATION_MESSAGES[v] ?? v).join(" | ");
        const errorMessage = `Plan incomplet : ${details} (propInserts=${contractQa.metrics.propInserts}, npcPanels=${contractQa.metrics.npcPanels}, heroCenterRatio=${contractQa.metrics.heroCenterRatio.toFixed(2)})`;

        console.warn(
          `[launch] contractual_focus_inadequate chapterId=${chapterId} ` +
            `heroCenterRatio=${contractQa.metrics.heroCenterRatio.toFixed(2)} ` +
            `envPanels=${contractQa.metrics.envPanels} ` +
            `propInserts=${contractQa.metrics.propInserts} ` +
            `npcPanels=${contractQa.metrics.npcPanels} ` +
            `blocking=${JSON.stringify(contractQa.blocking)} ` +
            `repairAttempted=${repairResult.attempted} repairFailed=${repairResult.failed}`,
        );
        return {
          ok: false,
          response: NextResponse.json(
            {
              error: errorMessage,
              code: "CONTRACTUAL_FOCUS_INADEQUATE",
              metrics: contractQa.metrics,
              blocking: contractQa.blocking,
              warnings: contractQa.warnings,
              repairable: contractQa.repairable,
              repairAttempted: repairResult.attempted,
              repairSucceeded: repairResult.succeeded,
              repairFailed: repairResult.failed,
            },
            { status: 422 },
          ),
        };
      }

      // Repair succeeded — update blueprints in snapshot.
      if (
        studioSnapshotForLaunch.data.productionPlan &&
        typeof studioSnapshotForLaunch.data.productionPlan === "object"
      ) {
        (studioSnapshotForLaunch.data.productionPlan as Record<string, unknown>).panelBlueprints =
          repairResult.repaired;
      }
      console.info(
        `[launch] contractual_focus_repaired chapterId=${chapterId} ` +
          `attempted=${repairResult.attempted} succeeded=${repairResult.succeeded}`,
      );
    }
  } catch (focusErr) {
    console.warn(
      `[launch] contractual_focus_check_failed (non-blocking): ${focusErr instanceof Error ? focusErr.message : focusErr}`,
    );
  }

  // 3. Shot Plan reliability guard (Sprint B). On relit le shot plan
  // persisté dans `productionPlan.shotPlan` (produit par /estimate) et on
  // bloque la launch si un blocker est présent (HERO_OVERLOAD,
  // MISSING_CUTAWAYS, MISSING_ENVIRONMENT, SHOT_MONOTONY, EMPTY_PLAN).
  try {
    const productionPlanRec = asRecord(studioSnapshotForLaunch.data.productionPlan ?? undefined);
    const shotPlanRaw = productionPlanRec.shotPlan;
    const persistedShotPlan =
      shotPlanRaw && typeof shotPlanRaw === "object" && !Array.isArray(shotPlanRaw)
        ? asRecord(shotPlanRaw)
        : null;
    const reliabilityRaw = persistedShotPlan?.reliability;
    const reliability =
      reliabilityRaw && typeof reliabilityRaw === "object" && !Array.isArray(reliabilityRaw)
        ? asRecord(reliabilityRaw)
        : null;
    if (reliability && reliability.launchAllowed === false) {
      const blockers = Array.isArray(reliability.blockers) ? reliability.blockers : [];
      const blockerCodes = blockers.map((b) =>
        b &&
        typeof b === "object" &&
        !Array.isArray(b) &&
        typeof (b as Record<string, unknown>).code === "string"
          ? (b as Record<string, unknown>).code
          : "unknown",
      );
      console.warn(
        `[launch] shot_plan_unreliable chapterId=${chapterId} ` +
          `score=${(typeof reliability.score === "number" ? reliability.score : 0).toFixed(2)} ` +
          `blockers=${JSON.stringify(blockerCodes)}`,
      );
      return {
        ok: false,
        response: NextResponse.json(
          {
            error:
              "Le shot plan du chapitre a des blocages critiques " +
              "(héros trop centré, pas assez de coupes, décor absent, cadrages monotones). " +
              "Régénère le plan de production.",
            code: "SHOT_PLAN_UNRELIABLE",
            score: typeof reliability.score === "number" ? reliability.score : null,
            blockers,
            humanReadable:
              persistedShotPlan && typeof persistedShotPlan.humanReadable === "string"
                ? persistedShotPlan.humanReadable
                : undefined,
          },
          { status: 422 },
        ),
      };
    }
  } catch (shotPlanErr) {
    console.warn(
      `[launch] shot_plan_check_failed (non-blocking): ${shotPlanErr instanceof Error ? shotPlanErr.message : shotPlanErr}`,
    );
  }

  return { ok: true };
}
