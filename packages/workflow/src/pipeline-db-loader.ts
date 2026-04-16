import { type StableImageReference } from "@manga-ai-studio/core";
import { prisma } from "@manga-ai-studio/db";
import { buildStableImageReference } from "./stable-image-refs";
import type { LoadedCharacterForPipeline } from "./pipeline-lora";

export async function loadCharactersForPipeline(
  projectId: string,
): Promise<LoadedCharacterForPipeline[]> {
  const chars = await prisma.character.findMany({
    where: { projectId },
    include: {
      canonPack: true,
      visualRefs: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
        take: 20,
        select: {
          id: true,
          imageUrl: true,
          isPrimary: true,
          metadata: true,
          mediaAssetId: true,
          mediaAsset: {
            select: {
              id: true,
              storageProvider: true,
              bucket: true,
              storageKey: true,
              publicUrl: true,
              signedUrl: true,
              falCdnUrl: true,
              sha256: true,
              metadata: true,
            },
          },
        },
      },
    },
  });

  const canonRefs: Record<string, StableImageReference> = {};
  for (const c of chars) {
    const primaryRef = c.visualRefs.find((v) => v.isPrimary && (v.imageUrl || v.mediaAssetId || v.mediaAsset?.storageKey));
    const bestRef = primaryRef ?? c.visualRefs.find((v) => v.imageUrl || v.mediaAssetId || v.mediaAsset?.storageKey);
    if (bestRef) {
      const stableRef = buildStableImageReference({
        assetId: bestRef.mediaAsset?.id ?? bestRef.mediaAssetId ?? null,
        storageProvider: bestRef.mediaAsset?.storageProvider ?? null,
        bucket: bestRef.mediaAsset?.bucket ?? null,
        storageKey: bestRef.mediaAsset?.storageKey ?? null,
        publicUrl: bestRef.mediaAsset?.publicUrl ?? bestRef.imageUrl,
        signedUrl: bestRef.mediaAsset?.signedUrl ?? null,
        falCdnUrl: bestRef.mediaAsset?.falCdnUrl ?? null,
        sourceUrl: bestRef.imageUrl,
        sourceType: bestRef.mediaAssetId ? "media_asset" : "character_visual_ref",
        checksum: bestRef.mediaAsset?.sha256 ?? null,
        metadata:
          bestRef.metadata && typeof bestRef.metadata === "object"
            ? (bestRef.metadata as Record<string, unknown>)
            : {},
      });
      if (stableRef) {
        canonRefs[c.id] = stableRef;
      }
    }
  }

  return chars.map((c) => {
    const raw = c as unknown as Record<string, unknown>;
    const bodyState = raw.bodyState && typeof raw.bodyState === "object" ? raw.bodyState as Record<string, unknown> : {};
    const wardrobeProfile = raw.wardrobeProfile && typeof raw.wardrobeProfile === "object" ? raw.wardrobeProfile as Record<string, unknown> : {};
    const visualProfile = raw.visualProfile && typeof raw.visualProfile === "object" ? raw.visualProfile as Record<string, unknown> : {};
    const continuityProfile = raw.continuityProfile && typeof raw.continuityProfile === "object" ? raw.continuityProfile as Record<string, unknown> : {};

    const bodyParts: string[] = [];
    if (bodyState.height) bodyParts.push(String(bodyState.height));
    if (bodyState.build) bodyParts.push(String(bodyState.build));
    if (bodyState.scars) bodyParts.push(`scars: ${String(bodyState.scars)}`);
    if (bodyState.prosthetics) bodyParts.push(`prosthetic: ${String(bodyState.prosthetics)}`);
    if (bodyState.tattoos) bodyParts.push(`tattoo: ${String(bodyState.tattoos)}`);
    if (bodyState.injuries) bodyParts.push(`injury: ${String(bodyState.injuries)}`);
    if (bodyState.modifications) bodyParts.push(String(bodyState.modifications));
    const bodyDetails = bodyParts.join(", ") || null;

    const wardrobeParts: string[] = [];
    if (wardrobeProfile.defaultOutfit) wardrobeParts.push(String(wardrobeProfile.defaultOutfit));
    if (wardrobeProfile.accessories) wardrobeParts.push(String(wardrobeProfile.accessories));
    if (wardrobeProfile.armor) wardrobeParts.push(String(wardrobeProfile.armor));
    if (wardrobeProfile.weapons) wardrobeParts.push(String(wardrobeProfile.weapons));
    const wardrobeDetails = wardrobeParts.join(", ") || null;

    return {
      id: c.id,
      name: c.name,
      roleType: typeof raw.roleType === "string" ? raw.roleType : null,
      objective: typeof raw.objective === "string" ? raw.objective : null,
      fear: typeof raw.fear === "string" ? raw.fear : null,
      biography: typeof raw.biography === "string" ? raw.biography : null,
      traits: Array.isArray(raw.traits) ? raw.traits.filter((item): item is string => typeof item === "string") : [],
      flaws: Array.isArray(raw.flaws) ? raw.flaws.filter((item): item is string => typeof item === "string") : [],
      gender: typeof raw.gender === "string" ? raw.gender : null,
      appearance: typeof raw.appearance === "string" ? raw.appearance : null,
      hairColor: typeof raw.hairColor === "string" ? raw.hairColor : null,
      eyeColor: typeof raw.eyeColor === "string" ? raw.eyeColor : null,
      outfitDefault: typeof raw.outfitDefault === "string" ? raw.outfitDefault : null,
      canonicalImageUrl: canonRefs[c.id]?.sourceUrl ?? canonRefs[c.id]?.publicUrl ?? null,
      canonicalReference: canonRefs[c.id] ?? null,
      canonSignatureText: c.canonPack?.visualSignatureText ?? null,
      forbiddenVisualDrift: c.canonPack?.forbiddenVisualDrift ?? null,
      bodyDetails,
      wardrobeDetails,
      visualProfile,
      bodyState,
      wardrobeProfile,
      speechProfile: raw.speechProfile && typeof raw.speechProfile === "object" ? raw.speechProfile as Record<string, unknown> : {},
      continuityProfile,
      characterFingerprint:
        raw.characterFingerprint && typeof raw.characterFingerprint === "object"
          ? raw.characterFingerprint as Record<string, unknown>
          : null,
      visualRefUrls: c.visualRefs.map((v) => v.imageUrl).filter(Boolean),
      entityKind: typeof continuityProfile.entityKind === "string" ? continuityProfile.entityKind : null,
      speciesLabel: typeof continuityProfile.speciesLabel === "string" ? continuityProfile.speciesLabel : null,
      dialogueMode: typeof continuityProfile.dialogueMode === "string" ? continuityProfile.dialogueMode : null,
      recurrencePolicy: typeof continuityProfile.recurrencePolicy === "string" ? continuityProfile.recurrencePolicy : null,
    };
  });
}
