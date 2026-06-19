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
      loraAttachments: {
        select: {
          id: true,
          weight: true,
          enabled: true,
          loraId: true,
          renderingModeFilter: true,
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
  // P1-5 : on cherche en plus une ref *dédiée portrait* (metadata.slotType
  // === "closeup"/"portrait" ou metadata.isPortrait / metadata.shotType ===
  // "closeup"). Si trouvée, elle sera utilisée en priorité sur les panels
  // closeup pour éviter le drift de visage quand la canonicalRef est full-body.
  const faceCloseupRefs: Record<string, StableImageReference> = {};
  const isCloseupRefMeta = (meta: unknown): boolean => {
    if (!meta || typeof meta !== "object") return false;
    const m = meta as Record<string, unknown>;
    const slot = typeof m.slotType === "string" ? m.slotType.toLowerCase() : null;
    const shot = typeof m.shotType === "string" ? m.shotType.toLowerCase() : null;
    if (slot === "closeup" || slot === "portrait" || slot === "face") return true;
    if (shot === "closeup" || shot === "extreme_closeup" || shot === "face") return true;
    if (m.isPortrait === true || m.isFaceCloseup === true) return true;
    return false;
  };
  const buildRefFromVisual = (v: typeof chars[number]["visualRefs"][number]) =>
    buildStableImageReference({
      assetId: v.mediaAsset?.id ?? v.mediaAssetId ?? null,
      storageProvider: v.mediaAsset?.storageProvider ?? null,
      bucket: v.mediaAsset?.bucket ?? null,
      storageKey: v.mediaAsset?.storageKey ?? null,
      publicUrl: v.mediaAsset?.publicUrl ?? v.imageUrl,
      signedUrl: v.mediaAsset?.signedUrl ?? null,
      falCdnUrl: v.mediaAsset?.falCdnUrl ?? null,
      sourceUrl: v.imageUrl,
      sourceType: v.mediaAssetId ? "media_asset" : "character_visual_ref",
      checksum: v.mediaAsset?.sha256 ?? null,
      metadata:
        v.metadata && typeof v.metadata === "object"
          ? (v.metadata as Record<string, unknown>)
          : {},
    });
  for (const c of chars) {
    const primaryRef = c.visualRefs.find((v) => v.isPrimary && (v.imageUrl || v.mediaAssetId || v.mediaAsset?.storageKey));
    const bestRef = primaryRef ?? c.visualRefs.find((v) => v.imageUrl || v.mediaAssetId || v.mediaAsset?.storageKey);
    if (bestRef) {
      const stableRef = buildRefFromVisual(bestRef);
      if (stableRef) canonRefs[c.id] = stableRef;
    }
    const closeupRaw = c.visualRefs.find((v) => isCloseupRefMeta(v.metadata) && (v.imageUrl || v.mediaAssetId || v.mediaAsset?.storageKey));
    if (closeupRaw) {
      const closeupRef = buildRefFromVisual(closeupRaw);
      if (closeupRef) faceCloseupRefs[c.id] = closeupRef;
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
      // P1-5 : ref portrait dédiée (si présente parmi les visualRefs)
      faceCloseupReference: faceCloseupRefs[c.id] ?? null,
      faceCloseupImageUrl: faceCloseupRefs[c.id]?.sourceUrl ?? faceCloseupRefs[c.id]?.publicUrl ?? null,
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
      stableVisualDNA:
        raw.stableVisualDNA !== null
        && typeof raw.stableVisualDNA === "object"
        && !Array.isArray(raw.stableVisualDNA)
          ? (raw.stableVisualDNA as Record<string, unknown>)
          : null,
      visualRefsPayload: c.visualRefs,
      visualLocksPayload: c.visualLocks,
      loraAttachmentsPayload: c.loraAttachments,
      canonPackPayload: c.canonPack,
    };
  });
}
