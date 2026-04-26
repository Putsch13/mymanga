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
import {
  isHeroRole,
  isAntagonistRole,
  isSupportingRole,
} from "@manga-ai-studio/core";

/**
 * P0.2 — Lieu temporaire découvert par VisualDiscoveryPass / CanonResolver
 * sans fiche utilisateur en DB.
 */
export interface TemporaryLocation {
  id: string;
  label: string;
  visualDescription?: string | null;
  confidence?: number;
  source?: string;
}

export interface LoadChapterVisualMemoryInput {
  chapterId: string;
  projectId: string;
  /** P0.6 — ID du héros officiel (seul personnage avec role=hero) */
  heroCharacterId?: string | null;
  mainCharacterIds: string[];
  /** P0.2 — Lieux temporaires détectés automatiquement */
  temporaryLocations?: TemporaryLocation[];
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

/**
 * P0.6 — Dérive le rôle d'un personnage pour la visual memory.
 * RÈGLE STRICTE : seul heroCharacterId peut avoir role="hero".
 * Les autres personnages actifs sont "support", pas "hero".
 */
function deriveRole(
  characterId: string,
  roleType: string | null | undefined,
  heroCharacterId: string | null,
  activeCharacterIds: Set<string>,
): ChapterVisualMemoryCharacterEntry["role"] {
  // P0.6 — Un seul héros : celui explicitement désigné
  if (heroCharacterId && characterId === heroCharacterId) {
    return "hero";
  }
  // Les autres personnages actifs sont support, PAS hero
  if (activeCharacterIds.has(characterId)) {
    return "support";
  }
  // Fallback sur roleType pour les personnages non actifs
  if (isAntagonistRole(roleType)) return "enemy";
  if (isSupportingRole(roleType)) return "support";
  return "npc";
}

export async function loadChapterVisualMemory(
  input: LoadChapterVisualMemoryInput,
): Promise<LoadChapterVisualMemoryResult> {
  const warnings: string[] = [];
  const memory = createEmptyChapterVisualMemory(input.chapterId);
  const activeIds = new Set(input.mainCharacterIds);
  const heroId = input.heroCharacterId ?? null;

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
        description: true,
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
    // P0.6 — Utilise heroCharacterId pour déterminer le héros unique
    const role = deriveRole(c.id, c.roleType, heroId, activeIds);

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
  const loadedLocationIds = new Set<string>();

  // P0.2 — Charger les lieux depuis la DB (avec image canonique)
  for (const loc of locations) {
    if (!loc.canonImageUrl) continue;
    addEnvironmentEntry(memory, {
      anchorId: loc.id,
      locationId: loc.id,
      locationName: loc.name,
      refUrl: loc.canonImageUrl,
      defaultWeight: 0.7,
    });
    loadedLocationIds.add(loc.id);
    environmentsLoaded += 1;
  }

  // P0.2 — Injecter les lieux temporaires découverts automatiquement
  // même sans image canonique, on crée une entrée environnement utilisable
  const temporaryLocations = input.temporaryLocations ?? [];
  for (const tempLoc of temporaryLocations) {
    // Éviter les doublons si le lieu existe déjà en DB
    if (loadedLocationIds.has(tempLoc.id)) continue;
    // Chercher si un lieu DB avec le même nom existe
    const dbMatch = locations.find(
      (l) => l.name.toLowerCase() === tempLoc.label.toLowerCase(),
    );
    if (dbMatch && loadedLocationIds.has(dbMatch.id)) continue;

    // P0.2 — Créer une entrée environnement sans image canonique
    // Le render utilisera la description visuelle comme guide
    addEnvironmentEntry(memory, {
      anchorId: tempLoc.id,
      locationId: tempLoc.id,
      locationName: tempLoc.label,
      refUrl: null, // Pas d'image canonique
      defaultWeight: tempLoc.confidence ?? 0.5,
      // P0.2 — Métadonnées pour le render
      visualDescription: tempLoc.visualDescription ?? undefined,
      source: tempLoc.source ?? "story_text_inference",
    });
    loadedLocationIds.add(tempLoc.id);
    environmentsLoaded += 1;
  }

  // P0.2 — Si toujours aucun environnement, créer un fallback depuis les lieux DB sans image
  if (environmentsLoaded === 0) {
    for (const loc of locations) {
      if (loadedLocationIds.has(loc.id)) continue;
      addEnvironmentEntry(memory, {
        anchorId: loc.id,
        locationId: loc.id,
        locationName: loc.name,
        refUrl: null,
        defaultWeight: 0.5,
        visualDescription: loc.description ?? undefined,
        source: "db_location_no_image",
      });
      loadedLocationIds.add(loc.id);
      environmentsLoaded += 1;
      break; // Au moins un pour débloquer
    }
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
