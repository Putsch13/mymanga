/**
 * P5.3 — Construction et résolution du CharacterCanon studio.
 * Extrait de lib/chapter-studio.ts — logique inchangée (P1.2).
 */

import {
  resolveEffectiveCharacterCanon as resolveEffectiveCharacterCanonCore,
  type ChapterStudioSnapshot,
  type CharacterCanon,
  isHeroRole,
  isAntagonistRole,
  isSecondaryHeroRole,
  isSupportingRole,
  isNpcRole,
} from "@manga-ai-studio/core";
import { asRecord, asStringArray, safeString } from "./utils";
import {
  collectCharacterReferenceAssets,
  encodeLegacyLoraBindingString,
  mergeCharacterFingerprint,
  resolveActiveCharacterLoraBinding,
} from "@manga-ai-studio/core";
import { computeCanonPackScore, CANON_PACK_COMPLETE_SCORE_THRESHOLD } from "@/lib/characters/compute-canon-pack-score";

export function buildCharacterCanonFromCharacter(character: {
  id: string;
  name: string;
  roleType?: string | null;
  gender?: string | null;
  biography?: string | null;
  objective?: string | null;
  appearance?: string | null;
  hairColor?: string | null;
  eyeColor?: string | null;
  outfitDefault?: string | null;
  voiceRegister?: string | null;
  voiceVocabularyStyle?: string | null;
  visualProfile?: unknown;
  wardrobeProfile?: unknown;
  stableVisualDNA?: unknown;
  stableSpeechDNA?: unknown;
  stablePsycheDNA?: unknown;
  canonLocked?: boolean;
  visualRefs?: Array<{ mediaAsset?: { publicUrl?: string | null } | null; imageUrl?: string | null }> | null;
  canonPack?: { completenessScore?: number | null } | null;
  // P1.2 : champs supplémentaires pour unifier avec le canon runtime.
  characterFingerprint?: unknown;
  bodyState?: unknown;
  continuityProfile?: unknown;
  visualLocks?: Array<{ isActive?: boolean | null; triggerWord?: string | null; loraAsset?: { publicUrl?: string | null } | null; canonicalRefUrls?: unknown; defaultOutfit?: string | null; altOutfits?: unknown }> | null;
}): CharacterCanon {
  const visualProfile = asRecord(character.visualProfile);
  const wardrobeProfile = asRecord(character.wardrobeProfile);
  const stableVisualDNA = asRecord(character.stableVisualDNA);
  const characterFingerprint = asRecord(character.characterFingerprint);
  const bodyState = asRecord(character.bodyState);

  // AUDIT COMMIT 7 — on délègue la collecte des refs et du binding LoRA
  // à un helper partagé (`lib/canon/character-canon-helpers.ts`) pour que
  // studio et runtime parlent la même langue.
  const activeLock = (character.visualLocks ?? []).find((l) => l?.isActive === true) ?? null;
  const dedupedReferenceAssets = collectCharacterReferenceAssets({
    lockCanonicalRefUrls: activeLock?.canonicalRefUrls ?? null,
    visualRefs: character.visualRefs ?? null,
  });
  const activeLoraBinding = resolveActiveCharacterLoraBinding({ activeLock });
  const legacyLoraBindingString = encodeLegacyLoraBindingString(activeLoraBinding);

  const importanceTier = isHeroRole(character.roleType)
    ? "MAIN_HERO"
    : isAntagonistRole(character.roleType)
      ? "SECONDARY_CORE"
      : isSecondaryHeroRole(character.roleType)
        ? "IMPORTANT_SUPPORTING_CHARACTER"
        : isSupportingRole(character.roleType)
          ? "IMPORTANT_SUPPORTING_CHARACTER"
          : isNpcRole(character.roleType)
            ? "RECURRING_NPC"
            : "RECURRING_NPC";

  const canonPackCompleteness = (() => {
    const live = computeCanonPackScore({
      name: character.name,
      roleType: character.roleType,
      gender: character.gender,
      biography: character.biography,
      objective: character.objective,
      appearance: character.appearance,
      hairColor: character.hairColor,
      eyeColor: character.eyeColor,
      outfitDefault: character.outfitDefault,
      voiceRegister: character.voiceRegister,
      voiceVocabularyStyle: character.voiceVocabularyStyle,
      stableVisualDNA: character.stableVisualDNA,
      stableSpeechDNA: character.stableSpeechDNA,
      stablePsycheDNA: character.stablePsycheDNA,
      activeVisualRefCount: (character.visualRefs ?? []).length,
    }).score;
    const stored =
      typeof character.canonPack?.completenessScore === "number"
        ? character.canonPack.completenessScore
        : null;
    if (stored == null) return live;
    return Math.max(live, stored);
  })();

  return {
    characterId: character.id,
    role: character.roleType ?? null,
    canonicalName: character.name,
    importanceTier,
    lockStrength: importanceTier === "MAIN_HERO" ? "HARD_LOCK" : character.canonLocked ? "STRONG" : "MEDIUM",
    visualIdentity: [
      safeString(character.appearance),
      safeString(visualProfile.faceShape),
      safeString(visualProfile.silhouetteType),
    ].filter((value): value is string => Boolean(value)),
    silhouette: safeString(visualProfile.silhouetteType),
    faceTraits: [
      safeString(visualProfile.faceShape),
      safeString(visualProfile.faceStructure),
    ].filter((value): value is string => Boolean(value)),
    eyeTraits: [safeString(character.eyeColor), safeString(visualProfile.eyeShape)].filter((value): value is string => Boolean(value)),
    hairTraits: [safeString(character.hairColor), safeString(visualProfile.hairStyle)].filter((value): value is string => Boolean(value)),
    skinTone: safeString(visualProfile.skinTone),
    bodyType: safeString(visualProfile.bodyType),
    apparentAge: safeString(visualProfile.ageVariant),
    accessories: [
      ...asStringArray(visualProfile.accessories),
      ...asStringArray(stableVisualDNA.fixedAccessories),
    ],
    signatureMarks: [
      ...asStringArray(stableVisualDNA.scars),
      ...asStringArray(stableVisualDNA.tattoos),
    ],
    defaultOutfitId: character.outfitDefault ?? null,
    defaultOutfitSet: [{
      outfitId: `${character.id}:default`,
      characterId: character.id,
      label: character.outfitDefault ?? "Default",
      top: safeString(wardrobeProfile.top),
      bottom: safeString(wardrobeProfile.bottom),
      shoes: safeString(wardrobeProfile.shoes),
      accessories: asStringArray(wardrobeProfile.accessories),
      stateTags: ["default"],
      seasonContext: safeString(wardrobeProfile.season),
      colorMemory: asStringArray(wardrobeProfile.colorMemory),
      shapeMemory: asStringArray(wardrobeProfile.shapeMemory),
      continuityPriority: character.canonLocked ? 90 : 65,
    }],
    emotionalRange: asStringArray(visualProfile.emotionalRange),
    forbiddenDrift: asStringArray(stableVisualDNA.forbiddenVisualDrift),
    mustKeep: [
      safeString(character.hairColor) ? `${character.hairColor} hair` : null,
      safeString(character.eyeColor) ? `${character.eyeColor} eyes` : null,
      safeString(character.outfitDefault),
    ].filter((value): value is string => Boolean(value)),
    optionalVariation: asStringArray(wardrobeProfile.altOutfits),
    referenceAssets: dedupedReferenceAssets,
    loraBindings: legacyLoraBindingString ? [legacyLoraBindingString] : [],
    fingerprint: mergeCharacterFingerprint({
      stableDNA: stableVisualDNA,
      characterFingerprint,
      bodyState,
    }),
    /** True si une ligne CanonPack existe OU si le score live dépasse le seuil prod (aligné launch). */
    hasCanonPack:
      Boolean(character.canonPack) || canonPackCompleteness >= CANON_PACK_COMPLETE_SCORE_THRESHOLD,
    canonPackCompleteness,
  };
}

export function resolveEffectiveCharacterCanon(input: {
  snapshot: ChapterStudioSnapshot;
  characterId: string;
  fallbackCharacterCanon?: CharacterCanon | null;
}) {
  return resolveEffectiveCharacterCanonCore({
    studioCharacterCanons: input.snapshot.data.characterCanons,
    characterId: input.characterId,
    fallbackCharacterCanon: input.fallbackCharacterCanon ?? null,
  });
}
