/**
 * ChapterVisualMemory — tient la mémoire visuelle du chapitre pour le
 * render-pass.
 *
 * Contient :
 *   - refs persos principales (visages + silhouettes / outfits)
 *   - refs closeups validées
 *   - refs lieux (anchors par `locationId` ou `anchorId` stable)
 *   - refs style
 *   - dernier panel validé utile comme continuité visuelle
 *
 * Règle forte (Sprint 5) : si un personnage principal (hero / support) est
 * présent dans la case, au moins une ref visuelle doit être renvoyée.
 * Jamais `referencePolicy === "NONE"` dans ce cas-là. Ça doit être garanti
 * par `resolvePanelReferences` consommé par le render-pass.
 */

import type {
  PanelRenderCharacterRef,
  PanelRenderEnvironmentRef,
  PanelRenderPanelRef,
  PanelRenderStyleRef,
} from "../contracts/panel-render-spec";

export interface ChapterVisualMemoryCharacterEntry {
  characterId: string;
  name: string;
  role: "hero" | "support" | "enemy" | "npc";
  faceRefUrl: string | null;
  silhouetteRefUrl: string | null;
  outfitRefUrl: string | null;
  defaultWeight: number;
}

export interface ChapterVisualMemoryEnvironmentEntry {
  anchorId: string;
  locationId: string | null;
  locationName: string;
  refUrl: string;
  defaultWeight: number;
}

export interface ChapterVisualMemoryPanelEntry {
  panelId: string;
  refUrl: string;
  defaultWeight: number;
}

export interface ChapterVisualMemoryStyleEntry {
  refUrl: string;
  defaultWeight: number;
}

export interface ChapterVisualMemory {
  chapterId: string;
  characters: Map<string, ChapterVisualMemoryCharacterEntry>;
  environments: Map<string, ChapterVisualMemoryEnvironmentEntry>;
  recentPanels: ChapterVisualMemoryPanelEntry[];
  styleRefs: ChapterVisualMemoryStyleEntry[];
}

export function createEmptyChapterVisualMemory(chapterId: string): ChapterVisualMemory {
  return {
    chapterId,
    characters: new Map(),
    environments: new Map(),
    recentPanels: [],
    styleRefs: [],
  };
}

export function addCharacterEntry(
  memory: ChapterVisualMemory,
  entry: ChapterVisualMemoryCharacterEntry,
): void {
  memory.characters.set(entry.characterId, entry);
}

export function addEnvironmentEntry(
  memory: ChapterVisualMemory,
  entry: ChapterVisualMemoryEnvironmentEntry,
): void {
  memory.environments.set(entry.anchorId, entry);
}

export function pushRecentPanel(
  memory: ChapterVisualMemory,
  entry: ChapterVisualMemoryPanelEntry,
  maxHistory = 6,
): void {
  memory.recentPanels.push(entry);
  if (memory.recentPanels.length > maxHistory) {
    memory.recentPanels.splice(0, memory.recentPanels.length - maxHistory);
  }
}

/**
 * Résout les refs d'un panel à partir du storyboard (ids personnages +
 * anchor décor). Garantit qu'un perso hero/support présent a au moins une
 * ref visuelle.
 *
 * Si un hero/support n'a AUCUNE ref disponible côté memory, on lève pour
 * forcer l'appelant à sortir un placeholder plutôt qu'un rendu nu
 * (conforme au garde-fou "jamais referencePolicy NONE").
 */
export interface ResolvedPanelReferences {
  characterRefs: PanelRenderCharacterRef[];
  environmentRefs: PanelRenderEnvironmentRef[];
  panelRefs: PanelRenderPanelRef[];
  styleRefs: PanelRenderStyleRef[];
  warnings: string[];
}

export interface ResolvePanelReferencesInput {
  characterIds: string[];
  mainCharacterIds?: string[];
  environmentAnchorId?: string | null;
  previousPanelAnchorId?: string | null;
}

export class MissingMainCharacterRefError extends Error {
  characterIds: string[];
  constructor(characterIds: string[]) {
    super(
      `missing_main_character_refs: ${characterIds.join(",")} — aucune ref visuelle en memory. ` +
        `Politique: jamais referencePolicy NONE pour hero/support.`,
    );
    this.name = "MissingMainCharacterRefError";
    this.characterIds = characterIds;
  }
}

export function resolvePanelReferences(
  memory: ChapterVisualMemory,
  input: ResolvePanelReferencesInput,
): ResolvedPanelReferences {
  const warnings: string[] = [];
  const mainIds = new Set(input.mainCharacterIds ?? []);
  const missingMain: string[] = [];

  const characterRefs: PanelRenderCharacterRef[] = [];
  for (const id of input.characterIds) {
    const entry = memory.characters.get(id);
    if (!entry) {
      if (mainIds.has(id)) missingMain.push(id);
      else warnings.push(`character_ref_missing=${id}`);
      continue;
    }
    const url = entry.faceRefUrl ?? entry.silhouetteRefUrl ?? entry.outfitRefUrl;
    if (!url) {
      if (mainIds.has(id) || entry.role === "hero" || entry.role === "support") {
        missingMain.push(id);
      } else {
        warnings.push(`character_ref_empty=${id}`);
      }
      continue;
    }
    characterRefs.push({
      characterId: entry.characterId,
      url,
      weight: entry.defaultWeight,
    });
  }

  if (missingMain.length > 0) {
    throw new MissingMainCharacterRefError(missingMain);
  }

  const environmentRefs: PanelRenderEnvironmentRef[] = [];
  if (input.environmentAnchorId) {
    const env = memory.environments.get(input.environmentAnchorId);
    if (env) {
      environmentRefs.push({
        anchorId: env.anchorId,
        url: env.refUrl,
        weight: env.defaultWeight,
      });
    } else {
      warnings.push(`environment_ref_missing=${input.environmentAnchorId}`);
    }
  }

  const panelRefs: PanelRenderPanelRef[] = [];
  if (input.previousPanelAnchorId) {
    const match = memory.recentPanels.find((p) => p.panelId === input.previousPanelAnchorId);
    if (match) {
      panelRefs.push({ panelId: match.panelId, url: match.refUrl, weight: match.defaultWeight });
    }
  }

  const styleRefs: PanelRenderStyleRef[] = memory.styleRefs.map((s) => ({
    url: s.refUrl,
    weight: s.defaultWeight,
  }));

  return { characterRefs, environmentRefs, panelRefs, styleRefs, warnings };
}
