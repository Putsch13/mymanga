/**
 * Enrichissement d'une liste de blueprints jusqu'a un minimum cible.
 *
 * READ-PREMIUM : sans cette etape, un chapitre avec ~10 beats produit ~30
 * blueprints et la DB n'a que 30 SceneImage, bien en dessous des 70-75 images
 * promises au user. La fonction ajoute des panels cutaway/reaction/environment
 * derives des beats existants pour atteindre le minimum sans dupliquer
 * betement les cases.
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

export function expandBlueprintsToMinimum(
  blueprints: PanelBlueprintPremium[],
  minimumPanels: number,
): PanelBlueprintPremium[] {
  if (blueprints.length >= minimumPanels || blueprints.length === 0) {
    return blueprints;
  }

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
