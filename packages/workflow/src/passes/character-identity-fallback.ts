/**
 * P0.5 + P6.21 — Character Identity Fallback Pass
 *
 * Gère les refs visage manquantes pour éviter de bloquer le render.
 * Stratégies :
 * 1. Utiliser faceRef si disponible
 * 2. Sinon utiliser portraitRef comme faceRef
 * 3. Sinon utiliser fullBodyRef
 * 4. Sinon utiliser l'image principale de la fiche personnage
 * 5. Sinon dégrader les closeups en medium shots
 */

import type { ChapterVisualMemory } from "@manga-ai-studio/ai";

/** Panel générique */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPanel = Record<string, any>;

export interface CharacterIdentityFallbackInput {
  memory: ChapterVisualMemory;
  panels: AnyPanel[];
  /** Si true, ne pas downgrader mais créer une identity seed */
  generateIdentitySeeds?: boolean;
}

export interface CharacterIdentityFallbackResult {
  memory: ChapterVisualMemory;
  panels: AnyPanel[];
  stats: {
    faceRefs: number;
    portraitFallbacks: number;
    fullBodyFallbacks: number;
    autoSeeded: number;
    downgradedCloseups: number;
  };
  warnings: string[];
}

/**
 * P0.5 — Détermine si un panel est un closeup qui nécessite une face ref
 */
function isCloseupPanel(panel: AnyPanel): boolean {
  const shotType = ((panel as Record<string, unknown>).shotType as string | undefined)?.toLowerCase() ?? "";
  const subjectFocus = (panel as Record<string, unknown>).subjectFocus as string | undefined;
  const renderMode = (panel as Record<string, unknown>).renderMode as string | undefined;

  return (
    shotType === "closeup" ||
    shotType === "extreme_closeup" ||
    shotType === "face" ||
    subjectFocus === "speaker" ||
    renderMode === "hero_closeup" ||
    renderMode === "reaction_closeup"
  );
}

/**
 * P0.5 — Downgrade un closeup en medium shot
 */
function downgradeCloseup(panel: AnyPanel): void {
  const shotType = (panel as Record<string, unknown>).shotType as string | undefined;
  const subjectFocus = (panel as Record<string, unknown>).subjectFocus as string | undefined;
  const renderMode = (panel as Record<string, unknown>).renderMode as string | undefined;

  if (shotType === "extreme_closeup") {
    (panel as Record<string, unknown>).shotType = "closeup";
  } else if (shotType === "closeup") {
    (panel as Record<string, unknown>).shotType = "medium_closeup";
  }

  if (subjectFocus === "speaker") {
    (panel as Record<string, unknown>).subjectFocus = "duo";
  }

  if (renderMode === "hero_closeup" || renderMode === "reaction_closeup") {
    (panel as Record<string, unknown>).renderMode = "character_action";
  }

  // Ajouter une note de continuité
  const continuityNotes = (panel as Record<string, unknown>).continuityNotes as string[] | undefined;
  (panel as Record<string, unknown>).continuityNotes = [
    ...(continuityNotes ?? []),
    "closeup_downgraded_missing_face_ref",
  ];
}

/**
 * P0.5 — Récupère les IDs de personnages que le panel doit montrer
 */
function getMustShowCharacterIds(panel: AnyPanel): string[] {
  // StoryboardPanel format
  if ("characters" in panel && Array.isArray(panel.characters)) {
    return panel.characters;
  }
  // PanelBlueprintPremium format
  const mustShowChars = (panel as Record<string, unknown>).mustShowCharacterIds as string[] | undefined;
  return mustShowChars ?? [];
}

/**
 * P0.5 + P6.21 — Applique les fallbacks pour les identités personnages manquantes.
 */
export function runCharacterIdentityFallback(
  input: CharacterIdentityFallbackInput,
): CharacterIdentityFallbackResult {
  const { memory, panels, generateIdentitySeeds = false } = input;
  const warnings: string[] = [];
  const stats = {
    faceRefs: 0,
    portraitFallbacks: 0,
    fullBodyFallbacks: 0,
    autoSeeded: 0,
    downgradedCloseups: 0,
  };

  // P0.5 — Vérifier les personnages avec missing face ref
  const charactersMissingFace: string[] = [];
  for (const [charId, entry] of memory.characters) {
    if (entry.faceRefUrl) {
      stats.faceRefs++;
    } else if (entry.silhouetteRefUrl) {
      // P0.5 — Fallback : utiliser silhouetteRef comme faceRef
      // (souvent c'est un portrait ou full body qui peut servir)
      entry.faceRefUrl = entry.silhouetteRefUrl;
      stats.portraitFallbacks++;
      warnings.push(`character_identity_fallback=${charId} used_silhouette_as_face`);
    } else if ((entry.role === "hero" || entry.role === "support")) {
      charactersMissingFace.push(charId);
      warnings.push(`character_identity_missing=${charId} role=${entry.role}`);
    }
  }

  // P0.5 — Downgrader les closeups des personnages sans face ref
  if (charactersMissingFace.length > 0 && !generateIdentitySeeds) {
    const missingSet = new Set(charactersMissingFace);
    for (const panel of panels) {
      if (!isCloseupPanel(panel)) continue;

      // Vérifier si ce panel montre un personnage sans face ref
      const mustShowChars = getMustShowCharacterIds(panel);
      const hasCharMissingFace = mustShowChars.some((cid) => missingSet.has(cid));

      if (hasCharMissingFace) {
        downgradeCloseup(panel);
        stats.downgradedCloseups++;
      }
    }
  }

  // P6.21 — Si generateIdentitySeeds est activé, créer des seeds pour les personnages manquants
  if (generateIdentitySeeds && charactersMissingFace.length > 0) {
    for (const charId of charactersMissingFace) {
      const entry = memory.characters.get(charId);
      if (!entry) continue;

      // Créer une identity seed (placeholder qui sera généré)
      entry.faceRefUrl = `identity_seed:${charId}`;
      stats.autoSeeded++;
      warnings.push(`character_identity_auto_seeded=${charId}`);
    }
  }

  console.info(
    `[identity-fallback] faceRefs=${stats.faceRefs} portraitFallbacks=${stats.portraitFallbacks} ` +
      `autoSeeded=${stats.autoSeeded} downgradedCloseups=${stats.downgradedCloseups}`,
  );

  return { memory, panels, stats, warnings };
}
