import type { Prisma, PrismaClient } from "@manga-ai-studio/db";
import type { SceneExtra } from "@manga-ai-studio/core";

import {
  NPC_PROMOTION_THRESHOLD,
  asRecord,
  normalizeLocationKey,
} from "./utils";

export function buildNpcVisualCore(extra: SceneExtra): string {
  return [
    extra.archetypeLabel,
    extra.visualSignature.genderPresentation,
    extra.visualSignature.hair,
    extra.visualSignature.outfit,
    extra.visualSignature.silhouette,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .slice(0, 4)
    .join(", ");
}

export function deriveNpcAgeBand(extra: SceneExtra): string {
  if (extra.archetypeId.endsWith(":crowd") || extra.archetypeId === "crowd") {
    return "mixed";
  }
  return "adult";
}

export function buildNpcVisualMemory(extra: SceneExtra): {
  silhouetteFamily: string | null;
  hairFamily: string | null;
  ageBand: string;
  accessoryMarker: string | null;
  clothingSignature: string | null;
} {
  return {
    silhouetteFamily: extra.visualSignature.silhouette ?? null,
    hairFamily: extra.visualSignature.hair ?? null,
    ageBand: deriveNpcAgeBand(extra),
    accessoryMarker: extra.visualSignature.hair ?? null,
    clothingSignature: extra.visualSignature.outfit ?? null,
  };
}

interface UpsertNpcVisualProfileInput {
  projectId: string;
  sceneId: string;
  locationId?: string;
  locationName?: string;
  extra: SceneExtra;
  characterId?: string | null;
  forceImportant?: boolean;
}

async function resolveLocationIdForUpsert(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: UpsertNpcVisualProfileInput,
): Promise<string | null> {
  const normalizedLocationName = normalizeLocationKey(
    input.locationName ?? input.locationId,
  );

  if (input.locationId) {
    const location = await prisma.location.findFirst({
      where: {
        projectId: input.projectId,
        OR: [
          { id: input.locationId },
          ...(normalizedLocationName
            ? [
                { slug: normalizedLocationName },
                {
                  name: {
                    equals: input.locationName ?? input.locationId,
                    mode: "insensitive" as const,
                  },
                },
              ]
            : []),
        ],
      },
      select: { id: true },
    });
    return location?.id ?? null;
  }

  if (!normalizedLocationName) return null;

  const location = await prisma.location.findFirst({
    where: {
      projectId: input.projectId,
      OR: [
        { slug: normalizedLocationName },
        {
          name: {
            equals: input.locationName ?? input.locationId ?? "",
            mode: "insensitive" as const,
          },
        },
      ],
    },
    select: { id: true },
  });
  return location?.id ?? null;
}

export async function upsertNpcVisualProfile(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: UpsertNpcVisualProfileInput,
) {
  const resolvedLocationId = await resolveLocationIdForUpsert(prisma, input);
  const existing = await prisma.npcVisualProfile.findUnique({
    where: { stableNpcId: input.extra.id },
  });
  const existingMetadata = asRecord(existing?.metadata);
  const visualMemory = buildNpcVisualMemory(input.extra);
  const nextAppearanceCount = (existing?.appearanceCount ?? 0) + 1;
  const shouldPromote =
    input.forceImportant || nextAppearanceCount >= NPC_PROMOTION_THRESHOLD;

  return prisma.npcVisualProfile.upsert({
    where: { stableNpcId: input.extra.id },
    update: {
      sceneId: input.sceneId,
      locationId: resolvedLocationId,
      characterId: input.characterId ?? existing?.characterId ?? null,
      role: input.extra.archetypeLabel,
      shortVisualCore: buildNpcVisualCore(input.extra),
      outfitSignature: input.extra.visualSignature.outfit ?? null,
      silhouetteSignature: input.extra.visualSignature.silhouette ?? null,
      accessoryMarker:
        input.extra.visualSignature.hair ?? existing?.accessoryMarker ?? null,
      relationToLocation: input.extra.anchorSlot,
      importanceLevel: input.forceImportant
        ? "important"
        : shouldPromote
          ? "recurring"
          : "generic",
      promotionStatus: input.forceImportant
        ? "locked"
        : shouldPromote
          ? "promoted"
          : "candidate",
      appearanceCount: nextAppearanceCount,
      metadata: {
        ...existingMetadata,
        visualMemory,
        lastSceneId: input.sceneId,
        lastArchetype: input.extra.archetypeId,
      },
    },
    create: {
      projectId: input.projectId,
      sceneId: input.sceneId,
      locationId: resolvedLocationId,
      characterId: input.characterId ?? null,
      stableNpcId: input.extra.id,
      role: input.extra.archetypeLabel,
      shortVisualCore: buildNpcVisualCore(input.extra),
      outfitSignature: input.extra.visualSignature.outfit ?? null,
      silhouetteSignature: input.extra.visualSignature.silhouette ?? null,
      accessoryMarker: input.extra.visualSignature.hair ?? null,
      relationToLocation: input.extra.anchorSlot,
      importanceLevel: input.forceImportant ? "important" : "generic",
      promotionStatus: input.forceImportant ? "locked" : "candidate",
      appearanceCount: 1,
      metadata: {
        visualMemory,
        firstSceneId: input.sceneId,
        firstArchetype: input.extra.archetypeId,
      },
    },
  });
}
