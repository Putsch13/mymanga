/**
 * PanelRenderSpec — Source de vérité du rendu image d'une case.
 *
 * Produit par render-spec-builder à partir de :
 *   - un StoryboardPanel (décidé en amont par le Manga Editor)
 *   - la ChapterVisualMemory (refs persos / décors / panels / style)
 *   - la ChapterStyleBible
 *
 * Consommé par :
 *   - minimal-panel-prompt-builder (construit un prompt court, non contradictoire)
 *   - fal-scene-strategy v3 (routing FAL basé sur renderMode)
 *   - panel-qa-pass (vérification du rendu vs spec)
 *
 * Règles fortes :
 *   - un PanelRenderSpec ne réinvente PAS l'histoire, il ne décide PAS la dramaturgie
 *   - le render-pass se contente d'exécuter ce spec
 *   - les refs visuelles pour un héros / support sont OBLIGATOIRES (cf.
 *     chapter-visual-memory : jamais referencePolicy NONE)
 */

import type { ChapterStyleBible } from "./chapter-style-bible";
import type {
  StoryboardCameraAngle,
  StoryboardCutawayType,
  StoryboardRenderMode,
  StoryboardShotType,
  StoryboardSubjectFocus,
} from "./storyboard-plan";

export type PanelRenderCharacterRole = "hero" | "support" | "enemy" | "npc";

export interface PanelRenderVisibleCharacter {
  characterId: string;
  name: string;
  role: PanelRenderCharacterRole;
  poseIntent: string | null;
  expressionIntent: string | null;
}

export interface PanelRenderContinuityLocks {
  outfitLocks: string[];
  bodyStateLocks: string[];
  propLocks: string[];
  environmentLocks: string[];
}

export interface PanelRenderCharacterRef {
  characterId: string;
  url: string;
  weight: number;
}

export interface PanelRenderEnvironmentRef {
  anchorId: string;
  url: string;
  weight: number;
}

export interface PanelRenderPanelRef {
  panelId: string;
  url: string;
  weight: number;
}

export interface PanelRenderStyleRef {
  url: string;
  weight: number;
}

export interface PanelRenderImageReferences {
  characterRefs: PanelRenderCharacterRef[];
  environmentRefs: PanelRenderEnvironmentRef[];
  panelRefs: PanelRenderPanelRef[];
  styleRefs: PanelRenderStyleRef[];
}

export interface PanelRenderConstraints {
  mustShow: string[];
  mustNotShow: string[];
  forbiddenDrift: string[];
  noTextInsideImage: boolean;
}

export interface PanelRenderSpec {
  panelId: string;
  pageNumber: number;
  panelNumberInPage: number;
  renderMode: StoryboardRenderMode;
  shotType: StoryboardShotType;
  cameraAngle: StoryboardCameraAngle;
  subjectFocus: StoryboardSubjectFocus;
  cutawayType: StoryboardCutawayType;
  locationName: string;
  actionLine: string;
  emotionLine: string;
  dialogueIntent: string | null;
  visibleCharacters: PanelRenderVisibleCharacter[];
  styleBible: ChapterStyleBible;
  continuityLocks: PanelRenderContinuityLocks;
  imageReferences: PanelRenderImageReferences;
  constraints: PanelRenderConstraints;
}

/**
 * Contrat de routage FAL basé sur renderMode (remplace les heuristiques
 * legacy de fal-scene-strategy).
 *
 * Déplacé ici car il est la sortie directe du routeur nouvelle version et
 * doit être co-localisé avec PanelRenderSpec.
 */
export type FalReferencePolicy = "STRONG" | "LIGHT" | "NONE";

export type FalRetryPolicy =
  | "strict_character"
  | "strict_environment"
  | "standard";

export interface FalRenderRoute {
  modelId: string;
  referencePolicy: FalReferencePolicy;
  panelCategory: string;
  sizePreset: "portrait" | "landscape" | "square";
  retryPolicy: FalRetryPolicy;
}
