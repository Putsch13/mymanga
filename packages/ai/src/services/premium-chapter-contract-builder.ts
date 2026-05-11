/**
 * Service partagé de construction du contrat premium d'un chapitre.
 *
 * Toute route qui a besoin de reconstruire le contrat premium doit appeler
 * ce service. Interdit de reconstruire un productionOutline minimaliste
 * "pour dépanner" ailleurs.
 *
 * Refacto : ce fichier est devenu une façade. Le builder était jusqu'ici
 * dupliqué quasi-textuellement entre les variantes sync et async (~130
 * lignes communes). On a extrait :
 *   - `_premium-contract/types.ts`               types publics
 *   - `_premium-contract/build-enrichment-context.ts` contextes narratif/univers
 *   - `_premium-contract/enrich-beat.ts`         enrichissement beat-par-beat
 *   - `_premium-contract/object-state-timeline.ts`    timeline des objets
 *   - `_premium-contract/hydrate-blueprints.ts`  hydratations DNA + QA finale
 *   - `_premium-contract/assemble-contract.ts`   assembleur final commun
 */

import { buildPremiumEnrichmentContexts } from "./_premium-contract/build-enrichment-context";
import { enrichBeatAsync, enrichBeatSync } from "./_premium-contract/enrich-beat";
import { assemblePremiumChapterContract } from "./_premium-contract/assemble-contract";
import type {
  BuildPremiumChapterContractInput,
  BuildPremiumChapterContractResult,
  ObjectStateFrame,
  PremiumMeta,
} from "./_premium-contract/types";

export type {
  BuildPremiumChapterContractInput,
  BuildPremiumChapterContractResult,
  ObjectStateFrame,
  PremiumMeta,
};

/**
 * Reconstruit le contrat premium complet depuis un approvedOutline.
 * Produit un productionOutline enrichi (avec narrativeFacts + requiredProps),
 * un productionPlan avec panelBlueprints et toutes les métriques premium,
 * et une objectStateTimeline pour la continuité.
 */
export function buildPremiumChapterContract(
  input: BuildPremiumChapterContractInput,
): BuildPremiumChapterContractResult {
  const { narrativeContext, universeContext } = buildPremiumEnrichmentContexts(input);
  const enrichedBeats = input.approvedOutline.beats.map((beat) =>
    enrichBeatSync({
      beat,
      narrativeContext,
      universeContext,
      heroCharacterId: input.heroCharacterId,
      projectGenre: input.projectGenre,
      projectTone: input.projectTone,
    }),
  );
  return assemblePremiumChapterContract({
    input,
    enrichedBeats,
    logPrefix: "[premium-contract]",
  });
}

/**
 * Version async de `buildPremiumChapterContract` avec enrichissement LLM.
 * Utilise la couche LLM pour détecter les faits narratifs que les patterns
 * heuristiques ratent (formes passives, expressions idiomatiques, synonymes).
 *
 * Recommandé pour : `estimate/route.ts`, `approved-outline/route.ts`. La
 * version synchrone reste disponible pour les contextes sans async.
 */
export async function buildPremiumChapterContractAsync(
  input: BuildPremiumChapterContractInput,
): Promise<BuildPremiumChapterContractResult> {
  const { narrativeContext, universeContext } = buildPremiumEnrichmentContexts(input);
  const enrichedBeats = await Promise.all(
    input.approvedOutline.beats.map((beat) =>
      enrichBeatAsync({
        beat,
        narrativeContext,
        universeContext,
        heroCharacterId: input.heroCharacterId,
        projectGenre: input.projectGenre,
        projectTone: input.projectTone,
      }),
    ),
  );
  return assemblePremiumChapterContract({
    input,
    enrichedBeats,
    logPrefix: "[premium-contract-async]",
  });
}
