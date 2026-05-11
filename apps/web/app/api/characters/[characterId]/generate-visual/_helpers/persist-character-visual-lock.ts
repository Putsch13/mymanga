import { buildCharacterVisualLock } from "@manga-ai-studio/ai";
import { type Prisma } from "@manga-ai-studio/db";

import { assertStableCanonicalAsset } from "@/lib/images/assert-stable-canonical-asset";
import { createVisualLockWithRetry } from "@/lib/characters/visual-lock-create-with-retry";

import type { ActiveLora } from "./resolve-character-canon-refs";

interface CharacterPersistInput {
  id: string;
  name: string;
  roleType: string | null;
  emotionalState: string | null;
  status: string | null;
  visualRefs: Array<unknown>;
  project: { id: string };
}

interface RoutedImageOutputResult {
  imageUrl: string;
  provider: string;
  model: string;
  requestId?: string | null | undefined;
  jobId?: string | null | undefined;
  seed?: number | null | undefined;
}

export interface PersistCharacterVisualLockArgs {
  character: CharacterPersistInput;
  persisted: { url: string; storageKey: string };
  output: { result: RoutedImageOutputResult };
  activeLoras: ActiveLora[];
  stableRefUrls: string[];
  lockedPositive: string;
  lockedNegative: string;
  rawCharacter: Record<string, unknown>;
  fullAppearance: string | null;
  fullOutfit: string | null;
  bodyState: Record<string, unknown>;
  wardrobeProfile: Record<string, unknown>;
}

export async function persistCharacterVisualLock(
  args: PersistCharacterVisualLockArgs,
) {
  const {
    character,
    persisted,
    output,
    activeLoras,
    stableRefUrls,
    lockedPositive,
    lockedNegative,
    rawCharacter,
    fullAppearance,
    fullOutfit,
    bodyState,
    wardrobeProfile,
  } = args;

  return createVisualLockWithRetry({
    characterId: character.id,
    run: async (tx, nextVersion) => {
      // Deactivate every currently-active lock before inserting the new
      // version. Done inside each retry attempt so a concurrent writer
      // can't leave two active rows behind.
      await tx.characterVisualLock.updateMany({
        where: { characterId: character.id, isActive: true },
        data: { isActive: false },
      });

      const mediaAsset = await tx.mediaAsset.create({
        data: {
          projectId: character.project.id,
          characterId: character.id,
          type: "character_ref",
          origin: "generated",
          ownerType: "character_visual",
          ownerId: character.id,
          storageProvider: "supabase",
          publicUrl: persisted.url,
          storageKey: persisted.storageKey,
          metadata: {
            provider: output.result.provider,
            model: output.result.model,
            requestId: output.result.requestId ?? null,
            jobId: output.result.jobId ?? null,
            seed: output.result.seed ?? null,
          },
        },
      });

      const activeLora = activeLoras[0] ?? null;
      const nextLock = buildCharacterVisualLock({
        characterId: character.id,
        displayName: character.name,
        roleType: character.roleType,
        hairColor: typeof rawCharacter.hairColor === "string" ? rawCharacter.hairColor : null,
        eyeColor: typeof rawCharacter.eyeColor === "string" ? rawCharacter.eyeColor : null,
        appearance: fullAppearance,
        outfitDefault: fullOutfit,
        bodyState,
        visualProfile:
          rawCharacter.visualProfile && typeof rawCharacter.visualProfile === "object"
            ? (rawCharacter.visualProfile as Record<string, unknown>)
            : {},
        wardrobeProfile,
        triggerWord: activeLora?.triggerWord ?? null,
        loraUrl: activeLora?.url ?? null,
        // P0.3 : canonicalRefUrls = uniquement URLs stables (non signées,
        // non provider-temporaire). On reprend les refs DB brutes, PAS les
        // versions signées utilisées pour appeler le provider.
        canonicalRefUrls: [persisted.url, ...stableRefUrls].slice(0, 4),
        currentState: {
          emotionalState: character.emotionalState,
          status: character.status,
        },
        version: nextVersion,
      });

      // P0.3 — chaque URL du canonicalRefUrls doit passer le guard stable.
      for (const refUrl of nextLock.canonicalRefUrls) {
        assertStableCanonicalAsset(
          { url: refUrl },
          "generate-visual:canonicalRefUrls",
        );
      }

      const storedLock = await tx.characterVisualLock.create({
        data: {
          projectId: character.project.id,
          characterId: character.id,
          version: nextVersion,
          isActive: true,
          displayName: nextLock.displayName,
          shortVisualCore: nextLock.shortVisualCore,
          triggerWord: nextLock.triggerWord ?? null,
          canonicalRefUrls: nextLock.canonicalRefUrls,
          defaultOutfit: nextLock.defaultOutfit ?? null,
          altOutfits: nextLock.altOutfits as Prisma.InputJsonValue,
          currentState: nextLock.currentState as Prisma.InputJsonValue,
          injuryState: (nextLock.injuryState ?? {}) as Prisma.InputJsonValue,
          ageVariant: nextLock.ageVariant ?? null,
          faceCloseupAssetId: mediaAsset.id,
          actionRefAssetId: mediaAsset.id,
          metadata: {
            requestId: output.result.requestId ?? null,
            jobId: output.result.jobId ?? null,
            source: "generate-visual",
          },
        },
      });

      // P0.3 — dernier guard avant l'écriture de la visualRef canonique.
      assertStableCanonicalAsset(
        {
          url: persisted.url,
          storageProvider: "supabase",
          storageKey: persisted.storageKey,
        },
        "generate-visual:characterVisualRef",
      );

      const createdRef = await tx.characterVisualRef.create({
        data: {
          characterId: character.id,
          mediaAssetId: mediaAsset.id,
          sourceVisualLockId: storedLock.id,
          type: "generated_primary",
          imageUrl: persisted.url,
          promptSnapshot: lockedPositive,
          isPrimary: character.visualRefs.length === 0,
          metadata: {
            provider: output.result.provider,
            model: output.result.model,
            negativePrompt: lockedNegative,
            requestId: output.result.requestId ?? null,
            jobId: output.result.jobId ?? null,
            // P0.3 : on ne stocke PAS referenceImageUrls (signées) dans
            // metadata canonique. On garde uniquement les URLs stables sources.
            referenceImageUrls: stableRefUrls,
            loras: activeLoras as unknown as Prisma.InputJsonValue,
            persisted: true,
          },
        },
      });

      return { createdRef, storedLock, nextVersion };
    },
  });
}
