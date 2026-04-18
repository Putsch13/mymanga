/**
 * P5.3 — Construction et résolution du CharacterCanon studio.
 * Extrait de lib/chapter-studio.ts — logique inchangée (P1.2).
 */

import {
  resolveEffectiveCharacterCanon as resolveEffectiveCharacterCanonCore,
  type ChapterStudioSnapshot,
  type CharacterCanon,
} from "@manga-ai-studio/core";
import { asRecord, asStringArray, safeString } from "./utils";

export function buildCharacterCanonFromCharacter(character: {
  id: string;
  name: string;
  roleType?: string | null;
  appearance?: string | null;
  hairColor?: string | null;
  eyeColor?: string | null;
  outfitDefault?: string | null;
  visualProfile?: unknown;
  wardrobeProfile?: unknown;
  stableVisualDNA?: unknown;
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

  // P1.2 : on agrège les visualRefs stockés sur le Character ET sur son
  // active CharacterVisualLock, priorité au lock (canonical source of truth).
  const activeLock = (character.visualLocks ?? []).find((l) => l?.isActive === true) ?? null;
  const lockRefUrls = Array.isArray(activeLock?.canonicalRefUrls)
    ? (activeLock?.canonicalRefUrls as unknown[]).filter((u): u is string => typeof u === "string")
    : [];
  const referenceAssets = [
    ...lockRefUrls,
    ...((character.visualRefs ?? [])
      .map((ref) => ref.mediaAsset?.publicUrl ?? ref.imageUrl ?? null)
      .filter((value): value is string => Boolean(value))),
  ];
  const seenRefs = new Set<string>();
  const dedupedReferenceAssets = referenceAssets.filter((u) => {
    if (seenRefs.has(u)) return false;
    seenRefs.add(u);
    return true;
  });

  const importanceTier =
    /hero|protagon/i.test(character.roleType ?? "")
      ? "MAIN_HERO"
      : /antagon|main|core/i.test(character.roleType ?? "")
        ? "SECONDARY_CORE"
        : /support|ally|secondary/i.test(character.roleType ?? "")
          ? "IMPORTANT_SUPPORTING_CHARACTER"
          : "RECURRING_NPC";

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
    loraBindings: activeLock?.triggerWord
      ? [`${activeLock.triggerWord}|${activeLock.loraAsset?.publicUrl ?? ""}`]
      : [],
    fingerprint: Object.keys(characterFingerprint).length > 0
      ? { ...stableVisualDNA, ...characterFingerprint, bodyState }
      : stableVisualDNA,
    hasCanonPack: Boolean(character.canonPack),
    canonPackCompleteness:
      typeof character.canonPack?.completenessScore === "number"
        ? character.canonPack.completenessScore
        : null,
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
