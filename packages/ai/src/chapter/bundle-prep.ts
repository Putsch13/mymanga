/**
 * bundle-prep.ts
 *
 * Phase 1 du pipeline `generateChapterBundle` : préparation du cast,
 * du pool de locations (Visual World ou legacy heuristic), et inférence
 * des hints d'entités à partir de l'intent utilisateur.
 *
 * Extrait de `generate-bundle-core.ts` (audit-v9, < 500 lignes/fichier).
 */

import {
  isPipelineV3PremiumOnlyEnabled,
  locationSceneStringsFromVisualWorldContract,
  type VisualWorldContract,
} from "@manga-ai-studio/core";
import { parseIntentEntities } from "../services/entity-brain";
import { legacyInferLocationPoolStrings } from "./legacy-location-pool";
import { takeNames } from "./pipeline-helpers";
import type { ProjectContextForChapter } from "./shared-types";

export type BundlePrepResult = {
  cast: string[];
  mainCast: string[];
  intentEntityHints: ReturnType<typeof parseIntentEntities>;
  locations: string[];
  locA: string | undefined;
  locB: string | undefined;
  locC: string | undefined;
  locD: string | undefined;
  locAt: (i: number) => string | undefined;
  premium: boolean;
};

/**
 * Construit le contexte initial commun à toutes les étapes : cast, hints d'entités,
 * et pool de locations (Visual World prioritaire, fallback legacy si autorisé).
 */
export function prepareBundleContext(input: {
  context: ProjectContextForChapter;
  userIntent: string;
  visualWorldContract?: VisualWorldContract | null;
  allowLegacyLocationInference?: boolean;
}): BundlePrepResult {
  const cast = takeNames(input.context, 6);
  const mainCast = cast.length > 0 ? cast : ["Le protagoniste", "L'antagoniste"];

  const intentEntityHints = parseIntentEntities(
    input.userIntent,
    input.context.characters.map((c) => c.name),
  );

  const vwLocationPool =
    input.visualWorldContract && input.visualWorldContract.locations.length > 0
      ? locationSceneStringsFromVisualWorldContract(input.visualWorldContract)
      : null;

  const premium = isPipelineV3PremiumOnlyEnabled();
  const allowLegacyInfer = input.allowLegacyLocationInference ?? !premium;

  let locations: string[];
  if (vwLocationPool && vwLocationPool.length > 0) {
    locations = vwLocationPool;
  } else if (allowLegacyInfer) {
    locations = legacyInferLocationPoolStrings(input.context, input.userIntent);
  } else {
    throw new Error(
      "premium_requires_visual_world_locations: en PIPELINE_V3_PREMIUM_ONLY, fournissez un VisualWorldContract " +
        "avec au moins une location, ou passez allowLegacyLocationInference=true pour un bootstrap explicite.",
    );
  }

  const [locA, locB, locC, locD] = locations;
  const locAt = (i: number) => locations[i % Math.max(locations.length, 1)] ?? locA;

  return {
    cast,
    mainCast,
    intentEntityHints,
    locations,
    locA,
    locB,
    locC,
    locD,
    locAt,
    premium,
  };
}
