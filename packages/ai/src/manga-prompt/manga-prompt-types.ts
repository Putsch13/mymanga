/**
 * manga-prompt-types.ts
 *
 * Interfaces et tracking legacy partagés par le composer manga.
 * Extrait de `manga-prompt-composer.ts` (audit-v9, < 500 lignes/fichier).
 */

import type { ChapterLookProfile, CharacterFingerprint } from "@manga-ai-studio/core";
import type { SceneBlueprint } from "@manga-ai-studio/world";
import type { PanelIntentCard } from "../services/panel-intent-card";
import type { SceneAnchor } from "../services/scene-anchor";
import type { PanelMood } from "../chapter/shared-types";

// ─── Legacy usage tracking ────────────────────────────────────────────────────
// On logue une fois par process pour mesurer la part de trafic legacy.
// Cible : 0 invocation en prod. Les tests sautent volontairement ce warning.
const __legacyComposerWarnedFor = new Set<string>();

export function warnLegacyComposer(entry: string): void {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return;
  if (__legacyComposerWarnedFor.has(entry)) return;
  __legacyComposerWarnedFor.add(entry);
  // eslint-disable-next-line no-console
  console.warn(
    `[manga-prompt-composer:legacy] ${entry} invoked — ` +
      `fallback path, canonical packet should be preferred (see Sprint C).`,
  );
}

export interface CharacterRef {
  name: string;
  entityKind?: string | null;
  speciesLabel?: string | null;
  gender?: string | null;
  appearance?: string | null;
  hairColor?: string | null;
  eyeColor?: string | null;
  outfitDefault?: string | null;
  canonicalImageUrl?: string | null;
  visualSignatureText?: string | null;
  forbiddenDrift?: string[] | null;
  /** Détails corps (prothèses, cicatrices, tatouages, morphologie) */
  bodyDetails?: string | null;
  /** Détails tenue enrichis */
  wardrobeDetails?: string | null;
  importanceTier?:
    | "MAIN_HERO"
    | "SECONDARY_CORE"
    | "IMPORTANT_SUPPORTING_CHARACTER"
    | "RECURRING_NPC"
    | "BACKGROUND_EXTRA"
    | null;
  lockStrength?: "HARD_LOCK" | "STRONG" | "MEDIUM" | "LIGHT" | "NONE" | null;
  continuityBudget?: "strict" | "light" | "none" | null;
  recurringMemory?: string | null;
  /** Traits durs non négociables (hard lock) */
  hardTraits?: string[] | null;
  /** Traits souples */
  softTraits?: string[] | null;
  /** Fingerprint structuré complet si disponible */
  fingerprint?: CharacterFingerprint | null;
}

export interface StylePackRef {
  name?: string | null;
  description?: string | null;
  visualStyle?: string | null;
  anatomyBias?: string | null;
  backgroundDensity?: string | null;
  cameraLanguage?: string | null;
  negativeConstraints?: string[] | null;
  styleRefImageUrl?: string | null;
  approvedLoraIds?: string[] | null;
}

export interface PanelPromptInput {
  stylePack?: StylePackRef | null;
  characters?: CharacterRef[];
  sceneBlueprint?: SceneBlueprint | null;
  location: string;
  action: string;
  camera: string;
  mood: PanelMood;
  contentIntensityLayer?: string;
  dialogueHint?: string;
  seed?: number;
  /** Contexte narratif de la scène (résumé, but, tension) — enrichit l'image */
  sceneContext?: string | null;
  /** Ambiance d'environnement : foule, heure, météo, etc. */
  environmentHint?: string | null;
  /** Intention narrative condensée pour prioriser le panel */
  narrativeObjective?: string | null;
  /** Contraintes canon actives pour le panel */
  canonConstraints?: string[] | null;
  /** Profil look chapitre autoritaire — source de vérité style */
  chapterLookProfile?: ChapterLookProfile | null;
  /** Ancre spatiale de la scène */
  sceneAnchor?: SceneAnchor | null;
  /** Carte d'intention visuelle du panel */
  intentCard?: PanelIntentCard | null;
  /** URGENCE 4 : accessoires requis par le panel (depuis prop inference engine) */
  requiredProps?: Array<{
    canonicalName: string;
    visibilityMode?: string | null;
    mustBeVisible?: boolean;
    narrativeRole?: string | null;
    /** P0.4 — Catégorie de propriétaire pour éviter d'attribuer les props au mauvais personnage */
    ownerCategory?: "hero" | "enemy" | "guard" | "npc" | "ambient" | "unassigned" | null;
  }> | null;
  /** URGENCE 5 : PNJ présents dans cette scène avec leur descripteur visuel */
  npcPresence?: string[] | null;
  /** IMG-3 : phrase d'ancrage de style figée pour le chapitre */
  chapterStyleAnchor?: string | null;
  /** IMG-1 : type de plan manga pour les framing directives */
  shotType?: string | null;
  cutawayType?: string | null;
  subjectFocus?: string | null;
  /** Aligné sur le blueprint panel : autorise le héros au centre pour les plans réaction héros */
  heroCenterAllowed?: boolean | null;
  cameraAngle?: string | null;
  /** IMG-4 : type de beat narratif pour les effets manga */
  beatType?: string | null;
  /** STYLE-1 : URLs d'images de référence de style (passées à l'adaptateur fal) */
  referenceImageUrls?: string[] | null;
  /** STYLE-1 : politique d'application de la référence de style */
  referencePolicy?: "LIGHT" | "STRONG" | null;
  /**
   * DIFF-3 : slug d'un style preset (ex: "shonen_classic", "cyberpunk_neon").
   * Si renseigné, le preset enrichit le stylePack et ajoute des termes positifs/négatifs.
   * Voir `STYLE_PRESETS` pour la liste complète.
   */
  stylePresetSlug?: string | null;
}

export interface ComposedPrompt {
  positive: string;
  negative: string;
  seed?: number;
  debug?: {
    finalPrompt: string;
    promptSections: Array<{ key: string; label: string; content: string }>;
    sectionSources: Record<string, string[]>;
    resolvedPolicy: {
      hasCharacterLock: boolean;
      hasNarrativeObjective: boolean;
      hasEnvironmentLock: boolean;
      hasLookProfile?: boolean;
      hasSceneAnchor?: boolean;
      hasIntentCard?: boolean;
    };
    promptWarnings: string[];
  };
  fal?: {
    positivePrompt: string;
    negativePrompt: string;
    safetyProfile: "safe" | "teen" | "mature_non_explicit";
    intensityProfile: string;
    preset:
      | "combat_clash"
      | "combat_aftermath"
      | "rage_closeup"
      | "dialogue_tension"
      | "establishing_location"
      | "crowd_reaction"
      | "hero_entry_panel"
      | "story_panel";
  };
}
