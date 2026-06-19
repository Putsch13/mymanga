/**
 * ╔════════════════════════════════════════════════════════════════════╗
 * ║ LEGACY — PREMIUM-FORBIDDEN (P0.B quarantine)                       ║
 * ╠════════════════════════════════════════════════════════════════════╣
 * ║ L'enrichissement/padding heuristique est incompatible avec la      ║
 * ║ règle P8 (range 70-75 stricte, ni "under_min" ni "over_max").      ║
 * ║ Le storyboard v3 produit directement 70-75 panels natifs — sans    ║
 * ║ cutaway artificiels dérivés automatiquement.                       ║
 * ║                                                                    ║
 * ║ `premium-path-legacy-isolation.test.ts` bloque tout import.        ║
 * ╚════════════════════════════════════════════════════════════════════╝
 *
 * @deprecated Enrichissement d'une liste de blueprints jusqu'a un minimum cible.
 *
 * READ-PREMIUM (legacy pré-P8) : sans cette etape, un chapitre avec ~10 beats
 * produit ~30 blueprints et la DB n'a que 30 SceneImage, bien en dessous des
 * 70-75 images promises au user. La fonction ajoute des panels cutaway/reaction/
 * environment derives des beats existants pour atteindre le minimum sans
 * dupliquer betement les cases.
 */

import type {
  PanelBlueprintPremium,
  SubjectFocus,
  CutawayType,
} from "@manga-ai-studio/core";

interface EnrichmentVariant {
  shotType: string;
  subjectFocus: SubjectFocus;
  cameraAngle: string;
  cutawayType: CutawayType;
  purpose: string;
}

// Cycle de "variants" alignes avec les violations possibles de
// `computeChapterFocusBudget` pour eviter d'en creer involontairement.
const ENRICHMENT_VARIANTS: EnrichmentVariant[] = [
  { shotType: "wide", subjectFocus: "environment", cameraAngle: "eye_level", cutawayType: "environment", purpose: "environment establish — no hero" },
  { shotType: "closeup", subjectFocus: "reaction", cameraAngle: "eye_level", cutawayType: "reaction", purpose: "emotion beat — reaction shot" },
  { shotType: "extreme_closeup", subjectFocus: "prop", cameraAngle: "eye_level", cutawayType: "prop_insert", purpose: "prop / object insert" },
  { shotType: "medium", subjectFocus: "npc", cameraAngle: "eye_level", cutawayType: "crowd", purpose: "npc context shot" },
  { shotType: "wide", subjectFocus: "aftermath", cameraAngle: "low_angle", cutawayType: "aftermath", purpose: "aftermath / transition shot" },
  { shotType: "over_shoulder", subjectFocus: "duo", cameraAngle: "eye_level", cutawayType: "none", purpose: "over-shoulder reaction shot" },
];

/**
 * H2 — padding 40→75 SUPPRIMÉ du chemin premium.
 *
 * Le storyboard premium DOIT nativement produire le nombre de panels
 * cible (70-75). Si le générateur amont ne sort pas assez de beats/
 * blueprints, on FAIT ÉCHOUER la launch plutôt que de bourrer des
 * fausses cases cutaway/reaction/prop qui pollue ensuite le routing
 * FAL et génère des prompts contradictoires.
 *
 * Pour laisser passer l'ancien comportement sur des tests unitaires ou
 * un mode debug local, on accepte UNE seule porte de sortie explicite :
 * `MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY=true`. Elle ne doit JAMAIS
 * être activée en prod premium.
 */

export class BlueprintEnrichmentDisabledError extends Error {
  readonly rawCount: number;
  readonly minimumPanels: number;
  constructor(rawCount: number, minimumPanels: number) {
    super(
      `premium_raw_panels_under_target: raw=${rawCount} minimum=${minimumPanels} — padding désactivé (H2). Le storyboard doit produire nativement ≥ minimum.`,
    );
    this.name = "BlueprintEnrichmentDisabledError";
    this.rawCount = rawCount;
    this.minimumPanels = minimumPanels;
  }
}

export function expandBlueprintsToMinimum(
  blueprints: PanelBlueprintPremium[],
  minimumPanels: number,
): PanelBlueprintPremium[] {
  if (blueprints.length >= minimumPanels || blueprints.length === 0) {
    return blueprints;
  }

  const legacyAllowed = process.env.MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY === "true";
  if (!legacyAllowed) {
    console.error(
      `[minimum-blueprint-expansion] padding_refused raw=${blueprints.length} minimum=${minimumPanels} — set MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY=true ONLY for debug/tests.`,
    );
    throw new BlueprintEnrichmentDisabledError(blueprints.length, minimumPanels);
  }
  console.warn(
    `[minimum-blueprint-expansion] LEGACY padding enabled — raw=${blueprints.length} → target=${minimumPanels}. DO NOT USE IN PREMIUM PROD.`,
  );

  const result: PanelBlueprintPremium[] = [...blueprints];
  // Repartir les panels ajoutes en round-robin sur les beats pour ne pas
  // concentrer l'enrichissement sur un seul beat.
  let seedIndex = 0;
  let variantIndex = 0;
  while (result.length < minimumPanels) {
    const seed = blueprints[seedIndex % blueprints.length];
    const variant = ENRICHMENT_VARIANTS[variantIndex % ENRICHMENT_VARIANTS.length];
    const idxSuffix = result.length + 1;

    result.push({
      ...seed,
      panelId: `panel_${seed.beatId}_enrich_${idxSuffix}`,
      panelIndex: idxSuffix - 1,
      panelNumber: idxSuffix,
      shotType: variant.shotType,
      subjectFocus: variant.subjectFocus,
      cameraAngle: variant.cameraAngle,
      cutawayType: variant.cutawayType,
      purpose: variant.purpose,
      heroCenterAllowed: false,
      mustShowEnemy: false,
      requiredNpcCount: variant.subjectFocus === "npc" ? Math.max(1, seed.requiredNpcCount) : 0,
      dialogueCarrier: "narration",
      dialogueLinesAnchored: 0,
      speakerAnchorCharacterId: null,
      speakerAnchorCharacterName: null,
      mustShowCharacterIds: variant.subjectFocus === "environment" || variant.subjectFocus === "prop" ? [] : (seed.mustShowCharacterIds ?? []).slice(0, 1),
      mayShowCharacterIds: variant.subjectFocus === "environment" || variant.subjectFocus === "prop" ? [] : (seed.mayShowCharacterIds ?? []).slice(0, 2),
      requiredCharacters: variant.subjectFocus === "environment" || variant.subjectFocus === "prop" ? [] : (seed.requiredCharacters ?? []).slice(0, 1),
      requiredCharacterIds: variant.subjectFocus === "environment" || variant.subjectFocus === "prop" ? [] : (seed.requiredCharacterIds ?? []).slice(0, 1),
      notes: [...(seed.notes ?? []), "auto-enriched to reach premium minimum"],
    });

    variantIndex += 1;
    // Change de beat seed tous les 2 variants pour diversifier la source
    if (variantIndex % 2 === 0) {
      seedIndex += 1;
    }
  }

  // Renumerote proprement panelNumber/panelIndex pour ordre sequentiel global
  return result.map((bp, idx) => ({
    ...bp,
    panelIndex: idx,
    panelNumber: idx + 1,
  }));
}
