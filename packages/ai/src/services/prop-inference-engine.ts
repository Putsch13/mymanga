/**
 * Moteur d'inférence automatique des props narratifs.
 *
 * Déduit les accessoires/armes/objets automatiquement en fonction de
 * l'histoire, sans configuration manuelle utilisateur.
 *
 * PR7 — `premiumOnly` + `visualWorldContract` : uniquement les props du
 * contrat VW (`validatePropEvidence`), enrichissement `ownerId` via
 * `resolvePropOwner` ; pas de templates univers ni d'injection depuis les
 * faits narratifs (source créative = `VisualWorldComposer`).
 *
 * Toute la logique métier vit dans `_prop-inference/`.
 */
import type {
  NarrativeFact,
  ProductionBeat,
  RequiredProp,
  VisualWorldContract,
  VisualWorldPropDna,
} from "@manga-ai-studio/core";
import type { UniverseType } from "./_prop-inference/types";
import { detectUniverseFromContext } from "./_prop-inference/universe";
import { collectVisualWorldProps } from "./_prop-inference/visual-world";
import {
  applyNarrativeFacts,
  applyTemplateHeuristics,
} from "./_prop-inference/templates-collector";

export type { UniverseType } from "./_prop-inference/types";
export { indexVisualWorldPropsByBeat } from "./_prop-inference/visual-world";

export interface PropInferenceContext {
  universeType?: UniverseType | null;
  projectGenre?: string | null;
  projectTone?: string | null;
  heroCharacterId?: string | null;
  /**
   * Premium-only : n'impose des props « domaine » (smartphone, grimoire, etc.)
   * que si le texte du beat contient une preuve explicite (mot ou expression
   * dédiée).
   */
  premiumStrictChapterSourcing?: boolean;
  /**
   * Premium IA-first : ne pas injecter les catalogues `getUniverseProps`
   * (ninja/urban/…). Reste : signaux explicites dans le texte + faits
   * narratifs (`prop_usage` / …).
   */
  suppressUniverseTemplateProps?: boolean;
  /**
   * Premium IA-first : props issus du `VisualWorldContract` pour ce beat
   * (`requiredBeatIds` sur chaque entrée). Fusionnés avant les templates / faits.
   */
  visualWorldPropsForBeat?: Readonly<Record<string, readonly VisualWorldPropDna[]>> | null;
  /**
   * Chapitre avec monde visuel composé (contrat présent) : ne pas utiliser les
   * catalogues `getUniverseProps` comme source créative, même si `props` du
   * contrat est vide ou non indexé par beat.
   */
  visualWorldContractActive?: boolean;
  /**
   * Premium strict + `visualWorldContract` : uniquement props VW validés
   * (`validatePropEvidence`), pas de templates univers ni d'injection depuis
   * les faits narratifs (source créative = composer).
   */
  premiumOnly?: boolean;
  visualWorldContract?: VisualWorldContract | null;
}

/**
 * Marque les props evidence/payoff comme nécessitant un panel dédié
 * (insert ou panel lisible).
 */
function ensureEvidencePayoffVisibility(props: RequiredProp[]): void {
  for (const prop of props) {
    if (prop.narrativeRole === "evidence" || prop.narrativeRole === "payoff") {
      prop.mustBeVisible = true;
      prop.visibilityMode = "foreground_insert";
      if (!prop.preferredPanelIds) {
        prop.preferredPanelIds = [];
      }
    }
  }
}

export function inferRequiredPropsFromBeat(
  beat: ProductionBeat,
  facts: NarrativeFact[],
  context: PropInferenceContext,
): RequiredProp[] {
  const text = [
    beat.summary,
    beat.narrativeFunction,
    beat.whyThisBeatExists,
    beat.dramaticChange,
    ...(beat.environmentContext ?? []),
  ]
    .filter(Boolean)
    .join(" ");

  const strictVwPremium =
    context.premiumOnly === true && context.visualWorldContract != null;

  const hasVisualWorldPropIndex =
    context.visualWorldPropsForBeat != null &&
    Object.values(context.visualWorldPropsForBeat).some(
      (arr) => Array.isArray(arr) && arr.length > 0,
    );
  const suppressUniverseTemplates =
    context.suppressUniverseTemplateProps === true ||
    hasVisualWorldPropIndex ||
    context.visualWorldContractActive === true;

  const universeType: UniverseType = suppressUniverseTemplates
    ? (context.universeType ?? "generic")
    : detectUniverseFromContext(beat, context);

  const characterRoster = (beat.involvedCharacters ?? []).map((id) => ({ id }));
  const locationRoster =
    context.visualWorldContract?.locations?.map((l) => ({ id: l.id })) ?? [];

  const vwList = context.visualWorldPropsForBeat?.[beat.beatId];
  const props: RequiredProp[] = [];
  const seenNames = new Set<string>();

  if (vwList && vwList.length > 0) {
    const { props: vwProps, seenNames: vwSeenNames } = collectVisualWorldProps({
      beat,
      vwList,
      visualWorldContract: context.visualWorldContract,
      heroCharacterId: context.heroCharacterId,
      strictVwPremium,
      characterRoster,
      locationRoster,
    });
    props.push(...vwProps);
    for (const name of vwSeenNames) seenNames.add(name);
  }

  ensureEvidencePayoffVisibility(props);

  if (strictVwPremium) {
    return props;
  }

  props.push(
    ...applyTemplateHeuristics({
      beat,
      text,
      universeType,
      suppressUniverseTemplates,
      premiumStrictChapterSourcing: context.premiumStrictChapterSourcing === true,
      heroCharacterId: context.heroCharacterId,
      seenNames,
    }),
  );

  props.push(
    ...applyNarrativeFacts({
      beat,
      text,
      facts,
      universeType,
      heroCharacterId: context.heroCharacterId,
      seenNames,
    }),
  );

  ensureEvidencePayoffVisibility(props);

  return props;
}
