/**
 * SceneExtrasRegistry: gestion des PNJ persistants par scène/location.
 * Garantit que les mêmes extras réapparaissent dans la même scène.
 */

import type { PrismaClient, Prisma } from "@manga-ai-studio/db";
import type { SceneExtra, NpcType } from "@manga-ai-studio/core";

const NPC_PROMOTION_THRESHOLD = 2;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stableToken(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function normalizeLocationKey(value: string | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function toSceneExtraList(value: unknown): SceneExtra[] {
  return Array.isArray(value)
    ? value
        .filter((extra): extra is SceneExtra => Boolean(extra) && typeof extra === "object" && !Array.isArray(extra))
        .map((extra) => extra as SceneExtra)
    : [];
}

function dedupeExtras(extras: SceneExtra[]) {
  const seen = new Map<string, SceneExtra>();
  for (const extra of extras) {
    const key = `${extra.archetype}:${extra.anchorSlot}`;
    if (!seen.has(key)) seen.set(key, extra);
  }
  return [...seen.values()];
}

function buildNpcVisualCore(extra: SceneExtra) {
  return [
    extra.archetype,
    extra.visualSignature.genderPresentation,
    extra.visualSignature.hair,
    extra.visualSignature.outfit,
    extra.visualSignature.silhouette,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .slice(0, 4)
    .join(", ");
}

function deriveNpcAgeBand(extra: SceneExtra) {
  if (extra.archetype === "crowd") return "mixed";
  return "adult";
}

function buildNpcVisualMemory(extra: SceneExtra) {
  return {
    silhouetteFamily: extra.visualSignature.silhouette ?? null,
    hairFamily: extra.visualSignature.hair ?? null,
    ageBand: deriveNpcAgeBand(extra),
    accessoryMarker: extra.visualSignature.hair ?? null,
    clothingSignature: extra.visualSignature.outfit ?? null,
  };
}

async function upsertNpcVisualProfile(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    projectId: string;
    sceneId: string;
    locationId?: string;
    locationName?: string;
    extra: SceneExtra;
    characterId?: string | null;
    forceImportant?: boolean;
  },
) {
  const normalizedLocationName = normalizeLocationKey(input.locationName ?? input.locationId);
  const resolvedLocation = input.locationId
    ? await prisma.location.findFirst({
        where: {
          projectId: input.projectId,
          OR: [
            { id: input.locationId },
            ...(normalizedLocationName
              ? [
                  { slug: normalizedLocationName },
                  { name: { equals: input.locationName ?? input.locationId, mode: "insensitive" as const } },
                ]
              : []),
          ],
        },
        select: { id: true },
      })
    : normalizedLocationName
      ? await prisma.location.findFirst({
          where: {
            projectId: input.projectId,
            OR: [
              { slug: normalizedLocationName },
              { name: { equals: input.locationName ?? input.locationId ?? "", mode: "insensitive" as const } },
            ],
          },
          select: { id: true },
        })
      : null;
  const resolvedLocationId = resolvedLocation?.id ?? null;
  const existing = await prisma.npcVisualProfile.findUnique({
    where: { stableNpcId: input.extra.id },
  });
  const existingMetadata = asRecord(existing?.metadata);
  const visualMemory = buildNpcVisualMemory(input.extra);
  const nextAppearanceCount = (existing?.appearanceCount ?? 0) + 1;
  const shouldPromote = input.forceImportant || nextAppearanceCount >= NPC_PROMOTION_THRESHOLD;
  return prisma.npcVisualProfile.upsert({
    where: { stableNpcId: input.extra.id },
    update: {
      sceneId: input.sceneId,
      locationId: resolvedLocationId,
      characterId: input.characterId ?? existing?.characterId ?? null,
      role: input.extra.archetype,
      shortVisualCore: buildNpcVisualCore(input.extra),
      outfitSignature: input.extra.visualSignature.outfit ?? null,
      silhouetteSignature: input.extra.visualSignature.silhouette ?? null,
      accessoryMarker: input.extra.visualSignature.hair ?? existing?.accessoryMarker ?? null,
      relationToLocation: input.extra.anchorSlot,
      importanceLevel: input.forceImportant ? "important" : shouldPromote ? "recurring" : "generic",
      promotionStatus: input.forceImportant ? "locked" : shouldPromote ? "promoted" : "candidate",
      appearanceCount: nextAppearanceCount,
      metadata: {
        ...existingMetadata,
        visualMemory,
        lastSceneId: input.sceneId,
        lastArchetype: input.extra.archetype,
      },
    },
    create: {
      projectId: input.projectId,
      sceneId: input.sceneId,
      locationId: resolvedLocationId,
      characterId: input.characterId ?? null,
      stableNpcId: input.extra.id,
      role: input.extra.archetype,
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
        firstArchetype: input.extra.archetype,
      },
    },
  });
}

/**
 * Charge les extras existants pour une scène ou location.
 */
export async function loadSceneExtras(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    sceneId?: string;
    locationId?: string;
    locationName?: string;
    projectId: string;
  }
): Promise<SceneExtra[]> {
  console.log(`[scene-extras-registry] Loading extras for scene=${input.sceneId}, location=${input.locationId}`);
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
    || (typeof currentMetadata.location === "string" ? currentMetadata.location : undefined)
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

/**
 * Persiste un extra dans le registry.
 */
export async function persistSceneExtra(
  prisma: PrismaClient | Prisma.TransactionClient,
  extra: SceneExtra
): Promise<void> {
  console.log(`[scene-extras-registry] Persisting extra ${extra.id} (${extra.archetype})`);
  const scene = await prisma.chapterScene.findUnique({
    where: { id: extra.sceneId },
    select: { metadata: true },
  });
  if (!scene) return;
  const metadata = asRecord(scene.metadata);
  const existingExtras = Array.isArray(metadata.sceneExtras) ? metadata.sceneExtras : [];
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

/**
 * Promeut un extra en personnage narratif (Character DB).
 * Appelé quand un PNJ parle ou devient important narrativement.
 */
export async function promoteExtraToNarrativeNpc(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    projectId: string;
    extraId: string;
    extra: SceneExtra;
    firstDialogue?: string;
  }
): Promise<{ characterId: string; promoted: boolean }> {
  console.log(`[scene-extras-registry] Promoting extra ${input.extraId} to narrative NPC`);
  const npcName = generateNpcName(input.extra.archetype, input.extra.id);
  const npcSlug = `${npcName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${stableToken(input.extra.id)}`;

  // Créer un Character léger
  const character = await prisma.character.create({
    data: {
      projectId: input.projectId,
      slug: npcSlug,
      name: npcName,
      roleType: "secondary",
      gender: input.extra.visualSignature.genderPresentation === "masculine" ? "male" : input.extra.visualSignature.genderPresentation === "feminine" ? "female" : null,
      appearance: JSON.stringify(input.extra.visualSignature),
      autoGenerated: true,
      biography: `PNJ auto-généré (${input.extra.archetype}) apparu dans la scène ${input.extra.sceneId}`,
      traits: [input.extra.archetype],
      flaws: [],
      secrets: [],
    },
  });

  await upsertNpcVisualProfile(prisma, {
    projectId: input.projectId,
    sceneId: input.extra.sceneId,
    extra: input.extra,
    characterId: character.id,
    forceImportant: true,
  });

  return {
    characterId: character.id,
    promoted: true,
  };
}

/**
 * Détermine le type de PNJ selon son importance narrative.
 */
export function classifyNpcType(extra: SceneExtra): NpcType {
  if (extra.canSpeak) return "narrative";
  if (extra.reusePriority >= 80) return "support";
  return "ambient";
}

/**
 * Génère un nom pour un PNJ basé sur son archetype.
 */
function generateNpcName(archetype: SceneExtra["archetype"], seed: string = archetype): string {
  const names: Record<string, string> = {
    bartender: "Barman",
    client: "Client",
    guard: "Garde",
    server: "Serveur",
    merchant: "Marchand",
    passerby: "Passant",
    crowd: "Figurant",
    other: "PNJ",
  };
  
  const base = names[archetype] ?? "PNJ";
  const suffix = parseInt(stableToken(seed).slice(0, 3), 36) % 999 + 1;
  
  return `${base} ${suffix}`;
}

/**
 * Trouve ou crée des extras pour remplir une scène.
 */
export async function ensureSceneExtras(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    sceneId: string;
    locationName: string;
    projectId: string;
    locationId?: string;
    requiredExtras: Array<{
      archetype: SceneExtra["archetype"];
      anchorSlot: string;
    }>;
  }
): Promise<SceneExtra[]> {
  // Charger extras existants
  const existing = await loadSceneExtras(prisma, {
    sceneId: input.sceneId,
    locationId: input.locationId,
    locationName: input.locationName,
    projectId: input.projectId,
  });

  const result: SceneExtra[] = [];

  for (const req of input.requiredExtras) {
    // Réutiliser un extra existant du même archetype/slot si possible
    const reused = existing.find(
      (e) => e.archetype === req.archetype && e.anchorSlot === req.anchorSlot
    );

    if (reused) {
      if (reused.sceneId !== input.sceneId) {
        const rebound: SceneExtra = {
          ...reused,
          sceneId: input.sceneId,
        };
        await persistSceneExtra(prisma, rebound);
        await upsertNpcVisualProfile(prisma, {
          projectId: input.projectId,
          sceneId: input.sceneId,
          locationId: input.locationId,
          locationName: input.locationName,
          extra: rebound,
        });
        result.push(rebound);
        continue;
      }
      await upsertNpcVisualProfile(prisma, {
        projectId: input.projectId,
        sceneId: input.sceneId,
        locationId: input.locationId,
        locationName: input.locationName,
        extra: reused,
      });
      result.push(reused);
    } else {
      // Créer un nouvel extra
      const stableId = `extra-${stableToken(`${input.projectId}:${normalizeLocationKey(input.locationName)}:${req.anchorSlot}:${req.archetype}`)}`;
      const newExtra: SceneExtra = {
        id: stableId,
        sceneId: input.sceneId,
        archetype: req.archetype,
        visualSignature: generateVisualSignature(req.archetype),
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
      result.push(newExtra);
    }
  }

  return result;
}

/**
 * Génère une signature visuelle cohérente pour un archetype.
 */
function generateVisualSignature(archetype: SceneExtra["archetype"]): SceneExtra["visualSignature"] {
  const templates: Record<string, SceneExtra["visualSignature"]> = {
    bartender: { genderPresentation: "masculine", outfit: "apron, shirt", silhouette: "stocky" },
    client: { genderPresentation: "varied", outfit: "casual wear", silhouette: "average" },
    guard: { genderPresentation: "masculine", outfit: "armor, uniform", silhouette: "muscular" },
    server: { genderPresentation: "feminine", outfit: "uniform, apron", silhouette: "slender" },
    merchant: { genderPresentation: "masculine", outfit: "robes, vest", silhouette: "rotund" },
    crowd: { genderPresentation: "varied", outfit: "varied", silhouette: "varied" },
  };

  return templates[archetype] ?? { outfit: "generic", silhouette: "average" };
}

/**
 * Charge tous les NPC promus (recurring + important) d'un projet.
 */
export async function loadProjectRecurringNpcs(
  prisma: PrismaClient | Prisma.TransactionClient,
  projectId: string,
): Promise<Array<{
  stableNpcId: string;
  label: string;
  role: string | null;
  shortVisualCore: string;
  outfitSignature: string | null;
  silhouetteSignature: string | null;
  appearanceCount: number;
  promotionStatus: string;
  speciesLabel: string | null;
}>> {
  const profiles = await prisma.npcVisualProfile.findMany({
    where: {
      projectId,
      promotionStatus: { in: ["promoted", "locked"] },
    },
    orderBy: { appearanceCount: "desc" },
    take: 20,
  });

  return profiles.map(p => ({
    stableNpcId: p.stableNpcId,
    label: p.role ?? "PNJ récurrent",
    role: p.role,
    shortVisualCore: p.shortVisualCore,
    outfitSignature: p.outfitSignature,
    silhouetteSignature: p.silhouetteSignature,
    appearanceCount: p.appearanceCount,
    promotionStatus: p.promotionStatus,
    speciesLabel: p.speciesLabel,
  }));
}
