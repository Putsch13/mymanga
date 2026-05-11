import type { CharacterCanon } from "../../types/chapter-studio";
import type { CharacterVisualDna } from "../../types/generation-debug-snapshot";
import type { PanelBlueprintPremium } from "../../types/narrative-facts";

import {
  excerptFromStableVisualDNA,
  visualDnaTraitFieldsFromStableVisualDNA,
} from "./stable-visual-dna";
import type { CharacterRowForDnaHydration } from "./types";

/** Au moins un signal visuel exploitable (hors seul displayName / characterId). */
export function isSubstantialCharacterVisualDna(d: CharacterVisualDna): boolean {
  const strings = [
    d.hairColor,
    d.eyeColor,
    d.hairStyle,
    d.skinTone,
    d.outfitSignature,
    d.canonSignatureText,
    d.visualCanonExcerpt,
    d.faceShape,
    d.eyeShape,
    d.eyeSize,
    d.eyebrowStyle,
    d.hairLength,
    d.hairTexture,
    d.noseStyle,
    d.mouthStyle,
    d.jawline,
    d.silhouetteType,
    d.perceivedAge,
    d.distinctiveMarksLine,
    d.accessoriesLine,
  ];
  if (strings.some((s) => typeof s === "string" && s.trim().length > 0)) return true;
  if (d.forbiddenDrift && d.forbiddenDrift.length > 0) return true;
  if (d.bodyType?.trim()) return true;
  if (d.scars && d.scars.length > 0) return true;
  if (d.tattoos && d.tattoos.length > 0) return true;
  if (d.accessories && d.accessories.length > 0) return true;
  return false;
}

export function collectRequiredCharacterIds(
  bp: PanelBlueprintPremium,
  coProtagonistCharacterIds: readonly string[],
): string[] {
  const speakerAnchor =
    bp.dialogueCarrier === "speaker_visible" && bp.speakerAnchorCharacterId?.trim()
      ? bp.speakerAnchorCharacterId.trim()
      : null;
  const ids = new Set<string>([
    ...(bp.requiredCharacterIds ?? []),
    ...(bp.mustShowCharacterIds ?? []),
    ...(bp.requiredCharacters ?? []),
    ...(bp.visibleCharacterIds ?? []),
    ...(speakerAnchor ? [speakerAnchor] : []),
  ]);
  const speakerChar = typeof bp.speakerCharacterId === "string" ? bp.speakerCharacterId.trim() : "";
  if (speakerChar) ids.add(speakerChar);
  for (const line of bp.dialogueLines ?? []) {
    const cid = typeof line.characterId === "string" ? line.characterId.trim() : "";
    if (cid) ids.add(cid);
  }
  const entityIds = bp.requiredEntityIds ?? [];
  for (const eid of entityIds) {
    if (typeof eid === "string" && eid.trim()) ids.add(eid.trim());
  }
  let requiredIds = [...ids];
  const hasCharacterSlot = requiredIds.length > 0;
  if (hasCharacterSlot && coProtagonistCharacterIds.length > 0) {
    requiredIds = [...new Set([...requiredIds, ...coProtagonistCharacterIds])];
  }
  return requiredIds;
}

function firstHairColorFromTraits(traits: string[]): string | null {
  for (const t of traits) {
    const s = t.trim();
    if (/^(blond|blonde|noir|noire|roux|roux|brun|brune|blanc|argent|bleu|vert|violet|rose)/i.test(s))
      return s;
  }
  return null;
}

/** Pass-through champs studio (configurateur / Prisma) vers le DNA panel. */
function studioCanonFieldsFromDbRow(
  db: CharacterRowForDnaHydration | undefined,
): Partial<CharacterVisualDna> {
  if (!db) return {};
  const out: Partial<CharacterVisualDna> = {};
  const put = (key: keyof CharacterVisualDna, val: unknown) => {
    if (val !== undefined && val !== null) (out as Record<string, unknown>)[key as string] = val;
  };
  put("characterFingerprint", db.characterFingerprint);
  put("visualProfile", db.visualProfile);
  put("wardrobeProfile", db.wardrobeProfile);
  put("bodyState", db.bodyState);
  put("continuityProfile", db.continuityProfile);
  put("visualRefs", db.visualRefs);
  put("visualLocks", db.visualLocks);
  put("canonPack", db.canonPack);
  put("loraAttachments", db.loraAttachments);
  return out;
}

export function buildDnaForCharacterId(
  characterId: string,
  db: CharacterRowForDnaHydration | undefined,
  canon: CharacterCanon | undefined,
): CharacterVisualDna {
  const fromStable = visualDnaTraitFieldsFromStableVisualDNA(db?.stableVisualDNA ?? null);
  const displayName = canon?.canonicalName ?? db?.name ?? characterId;
  const hairColor =
    db?.hairColor?.trim() ||
    fromStable.hairColor?.trim() ||
    firstHairColorFromTraits(canon?.hairTraits ?? []) ||
    null;
  const eyeColor =
    db?.eyeColor?.trim() ||
    fromStable.eyeColor?.trim() ||
    (canon?.eyeTraits?.[0]?.trim() ?? null) ||
    null;
  const outfitParts = canon?.defaultOutfitSet?.[0];
  const outfitSignature =
    db?.outfitDefault?.trim() ||
    [outfitParts?.top, outfitParts?.bottom, outfitParts?.label]
      .filter(Boolean)
      .join(", ")
      .trim() ||
    null;
  const sigParts = [
    db?.appearance?.trim(),
    ...(canon?.visualIdentity ?? []).slice(0, 4),
    ...(canon?.mustKeep ?? []).slice(0, 4),
  ].filter(Boolean) as string[];
  const canonSignatureText = sigParts.length > 0 ? [...new Set(sigParts)].join("; ") : null;
  const forbiddenDrift = [...(canon?.forbiddenDrift ?? [])];
  const visualCanonExcerpt = excerptFromStableVisualDNA(db?.stableVisualDNA ?? null);

  return {
    characterId,
    displayName,
    hairColor,
    eyeColor,
    outfitSignature,
    canonSignatureText,
    forbiddenDrift: forbiddenDrift.length > 0 ? forbiddenDrift : undefined,
    visualCanonExcerpt: visualCanonExcerpt ?? undefined,
    faceShape: fromStable.faceShape,
    skinTone: fromStable.skinTone,
    hairStyle: fromStable.hairStyle,
    hairLength: fromStable.hairLength,
    hairTexture: fromStable.hairTexture,
    eyeShape: fromStable.eyeShape,
    eyeSize: fromStable.eyeSize,
    eyebrowStyle: fromStable.eyebrowStyle,
    noseStyle: fromStable.noseStyle,
    mouthStyle: fromStable.mouthStyle,
    jawline: fromStable.jawline,
    silhouetteType: fromStable.silhouetteType,
    perceivedAge: fromStable.perceivedAge,
    distinctiveMarksLine: fromStable.distinctiveMarksLine,
    accessoriesLine: fromStable.accessoriesLine,
    bodyType: fromStable.bodyType,
    scars: fromStable.scars,
    tattoos: fromStable.tattoos,
    accessories: fromStable.accessories,
    ...studioCanonFieldsFromDbRow(db),
  };
}
