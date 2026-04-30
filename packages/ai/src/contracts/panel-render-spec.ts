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

import type { NpcVisualDna, VisualWorldPropDna } from "@manga-ai-studio/core";
import type { ChapterStyleBible } from "./chapter-style-bible";
import type {
  PanelPurpose,
  StoryboardCameraAngle,
  StoryboardCutawayType,
  StoryboardRenderMode,
  StoryboardShotType,
  StoryboardSubjectFocus,
} from "./storyboard-plan";

export type PanelRenderCharacterRole = "hero" | "support" | "enemy" | "npc";

/** ADN visuel structuré (studio / mémoire) — préféré aux champs plats quand présent. */
export interface PanelRenderCharacterVisualDna {
  displayName?: string | null;
  eyeColor?: string | null;
  hairColor?: string | null;
  hairStyle?: string | null;
  skinTone?: string | null;
  outfitSignature?: string | null;
  /** Extrait `stableVisualDNA` / configurateur (déjà plafonné côté core). */
  visualCanonExcerpt?: string | null;
  perceivedAge?: string | null;
  silhouetteType?: string | null;
  distinctiveMarksLine?: string | null;
  accessoriesLine?: string | null;
  /** Traits configurateur additionnels (PR7 / PR8) — prompt minimal avec plafond dédié. */
  faceShape?: string | null;
  eyeShape?: string | null;
  eyeSize?: string | null;
  eyebrowStyle?: string | null;
  hairLength?: string | null;
  hairTexture?: string | null;
  noseStyle?: string | null;
  mouthStyle?: string | null;
  jawline?: string | null;
}

export interface PanelRenderVisibleCharacter {
  characterId: string;
  name: string;
  role: PanelRenderCharacterRole;
  poseIntent: string | null;
  expressionIntent: string | null;
  hairColor?: string | null;
  eyeColor?: string | null;
  canonSignatureText?: string | null;
  forbiddenDrift?: string[];
  visualDNA?: PanelRenderCharacterVisualDna | null;
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
  /** P0.2 — url peut être null pour les lieux inférés sans image canonique */
  url: string | null;
  weight: number;
  /** P0.2 — Description visuelle pour guider le render sans image */
  visualDescription?: string;
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

/**
 * P0 — LoRA binding pour un personnage visible dans le panel.
 * Utilisé pour injecter les trigger words dans le prompt et les LoRA URLs dans FAL.
 */
export interface PanelRenderLoraBinding {
  characterId: string;
  characterName: string;
  url: string;
  triggerWord: string;
  scale: number;
  source: "character_lora";
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

/** Métadonnées de cadrage / slot pour l’orchestrateur image (FAL, QA). */
export interface PanelRenderLayoutMeta {
  /** Indice de mise en page reader (ex. `wide_stage`, `vertical_hero_focus`). */
  layoutHint?: string | null;
  /** `portrait` | `landscape` | `square` (ou legacy `2:3` / `3:2` / `1:1`). */
  targetAspectRatio?: string | null;
  slotType?: string | null;
}

/** Référence explicite au panel précédent pour continuité visuelle. */
export interface PanelRenderPreviousPanelRef {
  panelId: string;
  url?: string | null;
  weight?: number;
}

/** Texte éditorial du panel (hors image) pour traçabilité / adapters. */
export interface PanelRenderPanelTextPayload {
  dialogue?: Array<{ speaker: string; text: string }>;
  narration?: string | null;
  sfx?: string[];
}

export interface PanelRenderSpec {
  panelId: string;
  pageNumber: number;
  panelNumberInPage: number;
  /**
   * COMMIT C — propagé depuis StoryboardPanel.panelPurpose.
   * Source de vérité éditoriale pour la case (ex: `dialogue_anchor`,
   * `threat_silhouette`, `insert_prop`, `combat_impact`…). Le render-pass
   * s'en sert uniquement pour la traçabilité / QA ; il ne pilote PAS la
   * génération (c'est `renderMode` qui pilote).
   *
   * Obligatoire pour un rendu premium : si manquant, le validator fail.
   *
   * COMMIT P3.B — désormais typé strictement via l'enum PanelPurpose
   * (22 valeurs). Le render-spec-validator refuse toute valeur libre
   * hors enum (fin du `panelPurpose: string` accueillant le legacy).
   */
  panelPurpose: PanelPurpose;
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
  /** Cadrage cible aligné sur la route FAL (après enrichissement render-pass). */
  layoutMeta?: PanelRenderLayoutMeta | null;
  /** Héros / focus principal du chapitre quand identifiable sur le panel. */
  heroCharacterId?: string | null;
  /** Entités devant rester lisibles (mustShow + cast du panel). */
  mandatoryVisibleEntities?: string[];
  /** ADN décor / lieu résolu depuis la mémoire visuelle. */
  environmentDNA?: Record<string, unknown> | null;
  /**
   * PNJ visibles / monde (storyboard → render spec, issu du VisualWorldContract / studio).
   * Consommé par le prompt minimal (plafonné) en complément des héros `visibleCharacters`.
   */
  npcVisualDna?: NpcVisualDna[] | null;
  /** Props monde / beat (VW + `RequiredProp` mappés) pour le prompt image. */
  worldPropsVisualDna?: VisualWorldPropDna[] | null;
  /** Lien explicite vers le rendu du panel précédent. */
  previousPanelRef?: PanelRenderPreviousPanelRef | null;
  /** Dialogue, narration, SFX du storyboard pour le rendu / logs. */
  panelTextPayload?: PanelRenderPanelTextPayload | null;
  /**
   * P0 — LoRA bindings pour les personnages visibles.
   * Résolu depuis la visual memory et injecté dans l'appel FAL.
   */
  loraBindings?: PanelRenderLoraBinding[];
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
