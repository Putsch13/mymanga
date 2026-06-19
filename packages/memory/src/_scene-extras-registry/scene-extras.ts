import type { Prisma, PrismaClient } from "@manga-ai-studio/db";
import type { SceneExtra, SceneExtraSource } from "@manga-ai-studio/core";

import {
  buildSceneExtraVisualSignature,
  dedupeExtras,
  toSceneExtraList,
} from "./normalize-extras";
import { upsertNpcVisualProfile } from "./npc-profile";
import { asRecord, normalizeLocationKey, stableToken } from "./utils";

/** Charge les extras existants pour une scène ou location. */
export async function loadSceneExtras(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    sceneId?: string;
    locationId?: string;
    locationName?: string;
    projectId: string;
  },
): Promise<SceneExtra[]> {
  console.log(
    `[scene-extras-registry] Loading extras for scene=${input.sceneId}, location=${input.locationId}`,
  );
  const currentScene = input.sceneId
    ? await prisma.chapterScene.findUnique({
        where: { id: input.sceneId },
        select: { metadata: true },
      })
    : null;
  const currentMetadata = asRecord(currentScene?.metadata);
  const currentExtras = toSceneExtraList(currentMetadata.sceneExtras);
  const currentLocationLabel =
    input.locationName
    || (typeof currentMetadata.location === "string"
      ? currentMetadata.location
      : undefined)
    || undefined;
  const locationKey = normalizeLocationKey(currentLocationLabel);

  if (!locationKey) {
    return currentExtras;
  }

  const historicalScenes = await prisma.chapterScene.findMany({
    where: {
      chapter: {
        projectId: input.projectId,
      },
      ...(input.sceneId ? { id: { not: input.sceneId } } : {}),
    },
    orderBy: { id: "desc" },
    select: {
      id: true,
      metadata: true,
    },
    take: 80,
  });

  const historicalExtras = historicalScenes.flatMap((scene) => {
    const metadata = asRecord(scene.metadata);
    const sceneLocation = typeof metadata.location === "string" ? metadata.location : "";
    if (normalizeLocationKey(sceneLocation) !== locationKey) return [];
    return toSceneExtraList(metadata.sceneExtras).map((extra) => ({
      ...extra,
      sceneId: input.sceneId ?? extra.sceneId,
    }));
  });

  return dedupeExtras([...currentExtras, ...historicalExtras]);
}

/** Persiste un extra dans le registry. */
export async function persistSceneExtra(
  prisma: PrismaClient | Prisma.TransactionClient,
  extra: SceneExtra,
): Promise<void> {
  console.log(
    `[scene-extras-registry] Persisting extra ${extra.id} (${extra.archetypeLabel})`,
  );
  const scene = await prisma.chapterScene.findUnique({
    where: { id: extra.sceneId },
    select: { metadata: true },
  });
  if (!scene) return;
  const metadata = asRecord(scene.metadata);
  const existingExtras = Array.isArray(metadata.sceneExtras)
    ? metadata.sceneExtras
    : [];
  const nextExtras = [
    ...existingExtras.filter((item) => asRecord(item).id !== extra.id),
    extra,
  ];

  await prisma.chapterScene.update({
    where: { id: extra.sceneId },
    data: {
      metadata: ({
        ...metadata,
        sceneExtras: nextExtras,
      } as unknown) as Prisma.InputJsonValue,
    },
  });
}

interface RequiredExtra {
  archetypeId: string;
  archetypeLabel: string;
  source?: SceneExtraSource;
  anchorSlot: string;
}

interface EnsureSceneExtrasInput {
  sceneId: string;
  locationName: string;
  projectId: string;
  locationId?: string;
  requiredExtras: RequiredExtra[];
}

async function reuseExistingExtra(
  prisma: PrismaClient | Prisma.TransactionClient,
  reused: SceneExtra,
  input: EnsureSceneExtrasInput,
): Promise<SceneExtra> {
  if (reused.sceneId !== input.sceneId) {
    const rebound: SceneExtra = { ...reused, sceneId: input.sceneId };
    await persistSceneExtra(prisma, rebound);
    await upsertNpcVisualProfile(prisma, {
      projectId: input.projectId,
      sceneId: input.sceneId,
      locationId: input.locationId,
      locationName: input.locationName,
      extra: rebound,
    });
    return rebound;
  }
  await upsertNpcVisualProfile(prisma, {
    projectId: input.projectId,
    sceneId: input.sceneId,
    locationId: input.locationId,
    locationName: input.locationName,
    extra: reused,
  });
  return reused;
}

async function createNewExtra(
  prisma: PrismaClient | Prisma.TransactionClient,
  req: RequiredExtra,
  input: EnsureSceneExtrasInput,
): Promise<SceneExtra> {
  const stableId = `extra-${stableToken(
    `${input.projectId}:${normalizeLocationKey(input.locationName)}:${req.anchorSlot}:${req.archetypeId}`,
  )}`;
  const src = req.source ?? "legacy";
  const newExtra: SceneExtra = {
    id: stableId,
    sceneId: input.sceneId,
    archetypeId: req.archetypeId,
    archetypeLabel: req.archetypeLabel,
    source: src,
    visualSignature: buildSceneExtraVisualSignature({
      archetypeId: req.archetypeId,
      archetypeLabel: req.archetypeLabel,
      source: src,
    }),
    anchorSlot: req.anchorSlot,
    reusePriority: 70,
    canSpeak: false,
  };

  await persistSceneExtra(prisma, newExtra);
  await upsertNpcVisualProfile(prisma, {
    projectId: input.projectId,
    sceneId: input.sceneId,
    locationId: input.locationId,
    locationName: input.locationName,
    extra: newExtra,
  });
  return newExtra;
}

/** Trouve ou crée des extras pour remplir une scène. */
export async function ensureSceneExtras(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: EnsureSceneExtrasInput,
): Promise<SceneExtra[]> {
  const existing = await loadSceneExtras(prisma, {
    sceneId: input.sceneId,
    locationId: input.locationId,
    locationName: input.locationName,
    projectId: input.projectId,
  });

  const result: SceneExtra[] = [];
  for (const req of input.requiredExtras) {
    const reused = existing.find(
      (e) => e.archetypeId === req.archetypeId && e.anchorSlot === req.anchorSlot,
    );
    if (reused) {
      result.push(await reuseExistingExtra(prisma, reused, input));
    } else {
      result.push(await createNewExtra(prisma, req, input));
    }
  }

  return result;
}
