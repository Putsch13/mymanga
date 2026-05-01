import type { Prisma } from "@manga-ai-studio/db";
import type { CharacterRowForDnaHydration } from "@manga-ai-studio/core";

/**
 * Select Prisma aligné studio / configurateur pour hydratation DNA premium
 * (estimate, approved-outline, launch, buildPremiumChapterContract).
 * Pas de colonne `voiceProfile` en schéma Prisma : voix = `speechProfile` + champs `voice*`.
 */
export const premiumCharacterStudioSelect = {
  id: true,
  name: true,
  roleType: true,
  hairColor: true,
  eyeColor: true,
  appearance: true,
  outfitDefault: true,
  stableVisualDNA: true,
  characterFingerprint: true,
  visualProfile: true,
  wardrobeProfile: true,
  bodyState: true,
  continuityProfile: true,
  speechProfile: true,
  voiceRegister: true,
  voiceSentenceLength: true,
  voiceVocabularyStyle: true,
  voiceFavoriteExpressions: true,
  voiceForbiddenExpressions: true,
  visualRefs: {
    select: {
      id: true,
      type: true,
      imageUrl: true,
      isPrimary: true,
      metadata: true,
    },
  },
  visualLocks: {
    where: { isActive: true },
    select: {
      id: true,
      version: true,
      displayName: true,
      shortVisualCore: true,
      triggerWord: true,
      defaultOutfit: true,
      metadata: true,
    },
  },
  canonPack: {
    select: {
      id: true,
      visualSignatureText: true,
      forbiddenVisualDrift: true,
    },
  },
  loraAttachments: {
    select: {
      id: true,
      weight: true,
      enabled: true,
      loraId: true,
      renderingModeFilter: true,
    },
  },
} satisfies Prisma.CharacterSelect;

export type PremiumCharacterStudioRow = Prisma.CharacterGetPayload<{
  select: typeof premiumCharacterStudioSelect;
}>;

function asStableVisualRecord(v: unknown): Record<string, unknown> | null {
  if (v !== null && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

/** Réduit une ligne Prisma riche vers l’entrée attendue par `hydrateBlueprintsWithCharacterDna`. */
export function toCharacterRowsForDnaHydration(
  rows: PremiumCharacterStudioRow[],
): CharacterRowForDnaHydration[] {
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    hairColor: c.hairColor,
    eyeColor: c.eyeColor,
    appearance: c.appearance,
    outfitDefault: c.outfitDefault,
    stableVisualDNA: asStableVisualRecord(c.stableVisualDNA),
    characterFingerprint: c.characterFingerprint ?? undefined,
    visualProfile: c.visualProfile ?? undefined,
    wardrobeProfile: c.wardrobeProfile ?? undefined,
    bodyState: c.bodyState ?? undefined,
    continuityProfile: c.continuityProfile ?? undefined,
    visualRefs: c.visualRefs ?? undefined,
    visualLocks: c.visualLocks ?? undefined,
    canonPack: c.canonPack ?? undefined,
    loraAttachments: c.loraAttachments ?? undefined,
  }));
}
