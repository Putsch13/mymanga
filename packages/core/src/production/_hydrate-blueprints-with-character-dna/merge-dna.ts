import {
  mergeCharacterVisualDna,
  type ContractCharacterVisualDna,
  type DbCharacterVisualFields,
  type StoryboardCharacterVisualDna,
} from "../../characters/merge-character-visual-dna";
import type { CharacterVisualDna } from "../../types/generation-debug-snapshot";

function characterVisualDnaToDbFields(d: CharacterVisualDna): DbCharacterVisualFields {
  return {
    hairColor: d.hairColor,
    eyeColor: d.eyeColor,
    canonSignatureText: d.canonSignatureText,
    forbiddenVisualDrift: d.forbiddenDrift,
  };
}

function characterVisualDnaToContractFields(d: CharacterVisualDna): ContractCharacterVisualDna {
  const marks = [
    ...(d.distinctiveMarksLine
      ? d.distinctiveMarksLine.split(" ; ").map((x) => x.trim()).filter(Boolean)
      : []),
    ...(d.scars ?? []),
    ...(d.tattoos ?? []),
  ];
  return {
    eyeColor: d.eyeColor,
    hairColor: d.hairColor,
    hairStyle: d.hairStyle,
    skinTone: d.skinTone,
    outfitSignature: d.outfitSignature,
    distinctiveTraits: marks.length > 0 ? [...new Set(marks)] : undefined,
    silhouette: d.silhouetteType,
    ageAppearance: d.perceivedAge,
    bodyType: d.bodyType,
  };
}

function characterVisualDnaToStoryboardFields(
  d: CharacterVisualDna,
): StoryboardCharacterVisualDna {
  const features = [
    ...(d.distinctiveMarksLine
      ? d.distinctiveMarksLine.split(" ; ").map((x) => x.trim()).filter(Boolean)
      : []),
    ...(d.scars ?? []),
    ...(d.tattoos ?? []),
  ];
  return {
    eyeColor: d.eyeColor,
    hairColor: d.hairColor,
    hairStyle: d.hairStyle,
    outfitSignature: d.outfitSignature,
    distinctiveFeatures: features.length > 0 ? [...new Set(features)] : undefined,
  };
}

function mergeStringArraysPreferNonEmpty(
  a: string[] | undefined,
  b: string[] | undefined,
): string[] | undefined {
  const aa = a?.filter((x) => x.trim());
  const bb = b?.filter((x) => x.trim());
  if (aa && aa.length > 0) return aa;
  if (bb && bb.length > 0) return bb;
  return undefined;
}

/** Préfère la valeur issue du dernier build DB (`built`), sinon garde `prev` (blueprint). */
function studioPassThrough<T>(built: T | undefined | null, prev: T | undefined | null): T | undefined {
  if (built !== undefined && built !== null) return built as T;
  if (prev !== undefined && prev !== null) return prev as T;
  return undefined;
}

export function mergeDna(prev: CharacterVisualDna, built: CharacterVisualDna): CharacterVisualDna {
  const pick = <T extends string | null | undefined>(a: T, b: T): T | undefined => {
    const as = typeof a === "string" ? a.trim() : "";
    if (as) return a;
    const bs = typeof b === "string" ? b.trim() : "";
    return bs ? b : undefined;
  };

  const mergedCore = mergeCharacterVisualDna({
    dbCharacter: characterVisualDnaToDbFields(built),
    contractCharacter: characterVisualDnaToContractFields(built),
    storyboardCharacterDna: characterVisualDnaToStoryboardFields(prev),
  });

  const distinctiveMarksLine = pick(prev.distinctiveMarksLine, built.distinctiveMarksLine);
  const mergedTraits = mergedCore.distinctiveTraits?.length
    ? mergedCore.distinctiveTraits.join(" ; ")
    : "";

  return {
    characterId: prev.characterId,
    displayName: prev.displayName?.trim() || built.displayName,
    hairColor: mergedCore.hairColor ?? pick(prev.hairColor, built.hairColor) ?? null,
    eyeColor: mergedCore.eyeColor ?? pick(prev.eyeColor, built.eyeColor) ?? null,
    outfitSignature:
      mergedCore.outfitSignature ?? pick(prev.outfitSignature, built.outfitSignature) ?? null,
    canonSignatureText: pick(prev.canonSignatureText, built.canonSignatureText),
    forbiddenDrift:
      prev.forbiddenDrift && prev.forbiddenDrift.length > 0
        ? prev.forbiddenDrift
        : built.forbiddenDrift,
    visualCanonExcerpt:
      prev.visualCanonExcerpt?.trim() || built.visualCanonExcerpt || undefined,
    hairStyle: mergedCore.hairStyle ?? pick(prev.hairStyle, built.hairStyle),
    skinTone: mergedCore.skinTone ?? pick(prev.skinTone, built.skinTone),
    hairLength: pick(prev.hairLength, built.hairLength),
    hairTexture: pick(prev.hairTexture, built.hairTexture),
    faceShape: pick(prev.faceShape, built.faceShape),
    eyeShape: pick(prev.eyeShape, built.eyeShape),
    eyeSize: pick(prev.eyeSize, built.eyeSize),
    eyebrowStyle: pick(prev.eyebrowStyle, built.eyebrowStyle),
    noseStyle: pick(prev.noseStyle, built.noseStyle),
    mouthStyle: pick(prev.mouthStyle, built.mouthStyle),
    jawline: pick(prev.jawline, built.jawline),
    silhouetteType:
      pick(prev.silhouetteType, built.silhouetteType) ?? mergedCore.silhouette ?? undefined,
    perceivedAge:
      pick(prev.perceivedAge, built.perceivedAge) ?? mergedCore.ageAppearance ?? undefined,
    distinctiveMarksLine: distinctiveMarksLine ?? (mergedTraits || undefined),
    accessoriesLine: pick(prev.accessoriesLine, built.accessoriesLine),
    bodyType: pick(prev.bodyType, built.bodyType) ?? mergedCore.bodyType ?? undefined,
    scars: mergeStringArraysPreferNonEmpty(prev.scars, built.scars),
    tattoos: mergeStringArraysPreferNonEmpty(prev.tattoos, built.tattoos),
    accessories: mergeStringArraysPreferNonEmpty(prev.accessories, built.accessories),
    characterFingerprint: studioPassThrough(built.characterFingerprint, prev.characterFingerprint),
    visualProfile: studioPassThrough(built.visualProfile, prev.visualProfile),
    wardrobeProfile: studioPassThrough(built.wardrobeProfile, prev.wardrobeProfile),
    bodyState: studioPassThrough(built.bodyState, prev.bodyState),
    continuityProfile: studioPassThrough(built.continuityProfile, prev.continuityProfile),
    visualRefs: studioPassThrough(built.visualRefs, prev.visualRefs),
    visualLocks: studioPassThrough(built.visualLocks, prev.visualLocks),
    canonPack: studioPassThrough(built.canonPack, prev.canonPack),
    loraAttachments: studioPassThrough(built.loraAttachments, prev.loraAttachments),
  };
}
