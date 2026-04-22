/**
 * load-chapter-visual-memory — hydrate une ChapterVisualMemory depuis la
 * DB pour le render-pass v3.
 *
 * Sources :
 *   - `Character.visualRefs` → face closeup ref + silhouette/outfit ref
 *   - `NpcVisualProfile` → silhouette signature (quand pertinent)
 *   - `Location` → (TODO sprint ultérieur) env anchors
 *   - `StylePack` → style refs globales
 *
 * Règle forte : si un héros/support a AUCUNE ref en DB, on log un warning
 * mais on laisse `resolvePanelReferences` lever `MissingMainCharacterRefError`
 * au moment du rendu — conforme à la policy "jamais NONE pour hero/support".
 */

import { prisma } from "@manga-ai-studio/db";
import {
  createEmptyChapterVisualMemory,
  addCharacterEntry,
  addEnvironmentEntry,
  type ChapterVisualMemory,
  type ChapterVisualMemoryCharacterEntry,
} from "@manga-ai-studio/ai";

export interface LoadChapterVisualMemoryInput {
  chapterId: string;
  projectId: string;
  mainCharacterIds: string[];
}

export interface LoadChapterVisualMemoryResult {
  memory: ChapterVisualMemory;
  warnings: string[];
  stats: {
    charactersLoaded: number;
    charactersMissingFaceRef: number;
    environmentsLoaded: number;
    styleRefsLoaded: number;
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isCloseupMeta(meta: unknown): boolean {
  if (!isRecord(meta)) return false;
  const slot = typeof meta.slotType === "string" ? meta.slotType.toLowerCase() : null;
  const shot = typeof meta.shotType === "string" ? meta.shotType.toLowerCase() : null;
  if (slot === "closeup" || slot === "portrait" || slot === "face") return true;
  if (shot === "closeup" || shot === "extreme_closeup" || shot === "face") return true;
  if (meta.isPortrait === true || meta.isFaceCloseup === true) return true;
  return false;
}

function deriveRole(
  characterId: string,
  roleType: string | null | undefined,
  mainIds: Set<string>,
): ChapterVisualMemoryCharacterEntry["role"] {
  if (mainIds.has(characterId)) return "hero";
  const r = (roleType ?? "").toLowerCase();
  if (r.includes("main") || r.includes("protagon")) return "hero";
  if (r.includes("support") || r.includes("ally") || r.includes("deuter")) return "support";
  if (r.includes("antagon") || r.includes("enemy") || r.includes("villain")) return "enemy";
  return "npc";
}

export async function loadChapterVisualMemory(
  input: LoadChapterVisualMemoryInput,
): Promise<LoadChapterVisualMemoryResult> {
  const warnings: string[] = [];
  const memory = createEmptyChapterVisualMemory(input.chapterId);
  const mainIds = new Set(input.mainCharacterIds);

  const [characters, locations, stylePacks] = await Promise.all([
    prisma.character.findMany({
      where: { projectId: input.projectId },
      select: {
        id: true,
        name: true,
        roleType: true,
        outfitDefault: true,
        visualRefs: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
          take: 20,
          select: {
            id: true,
            imageUrl: true,
            isPrimary: true,
            metadata: true,
          },
        },
      },
    }),
    prisma.location.findMany({
      where: { projectId: input.projectId },
      select: {
        id: true,
        name: true,
        canonImageUrl: true,
      },
    }),
    prisma.stylePack.findMany({
      where: { projectId: input.projectId },
      orderBy: { createdAt: "desc" },
      take: 1,
    }),
  ]);

  let charactersMissingFaceRef = 0;

  for (const c of characters) {
    const faceRef = c.visualRefs.find(
      (v) => v.imageUrl && isCloseupMeta(v.metadata),
    );
    const primaryRef = c.visualRefs.find((v) => v.isPrimary && v.imageUrl);
    const firstRef = c.visualRefs.find((v) => v.imageUrl);

    const faceRefUrl = faceRef?.imageUrl ?? null;
    const silhouetteRefUrl = primaryRef?.imageUrl ?? firstRef?.imageUrl ?? null;
    const outfitRefUrl = silhouetteRefUrl;
    const role = deriveRole(c.id, c.roleType, mainIds);

    if (!faceRefUrl && (role === "hero" || role === "support")) {
      charactersMissingFaceRef += 1;
      warnings.push(
        `visual_memory.missing_face_ref characterId=${c.id} name=${c.name} role=${role}`,
      );
    }

    addCharacterEntry(memory, {
      characterId: c.id,
      name: c.name,
      role,
      faceRefUrl,
      silhouetteRefUrl,
      outfitRefUrl,
      defaultWeight: role === "hero" ? 1.0 : role === "support" ? 0.85 : 0.65,
    });
  }

  let environmentsLoaded = 0;
  for (const loc of locations) {
    if (!loc.canonImageUrl) continue;
    addEnvironmentEntry(memory, {
      anchorId: loc.id,
      locationId: loc.id,
      locationName: loc.name,
      refUrl: loc.canonImageUrl,
      defaultWeight: 0.7,
    });
    environmentsLoaded += 1;
  }

  const stylePack = stylePacks[0];
  if (stylePack?.styleRefImageUrl) {
    memory.styleRefs.push({ refUrl: stylePack.styleRefImageUrl, defaultWeight: 0.5 });
  }

  return {
    memory,
    warnings,
    stats: {
      charactersLoaded: characters.length,
      charactersMissingFaceRef,
      environmentsLoaded,
      styleRefsLoaded: memory.styleRefs.length,
    },
  };
}
