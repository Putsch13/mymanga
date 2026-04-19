/**
 * `CanonicalImagePromptPacket` — le contrat unique envoyé au provider
 * pour chaque image d'un chapitre.
 *
 * Un packet est :
 *   - canonique (tous les IDs/bindings sont résolus depuis la bible),
 *   - sérialisable (JSON strict, versionné via `packetVersion`),
 *   - auditable (chaque champ explicite, pas de blob texte),
 *   - réinjectable (utilisable pour reroll/continuité/LoRA/bible).
 *
 * Le prompt final existe en deux formes :
 *   - `finalFrenchStructuredPrompt` : version auteur/débogage,
 *   - `finalEnglishStructuredPrompt` : version provider (fal.ai) après
 *     traduction contrôlée via `prompt-translator`.
 *
 * `providerPayload.prompt` DOIT toujours contenir
 * `finalEnglishStructuredPrompt`.
 */

import type {
  ImageIntentType,
  HeroPresenceMode,
  ContentRating,
} from "./image-intent-taxonomy";

export const CANONICAL_PACKET_VERSION = "1.0.0";

export interface CanonicalImagePromptPacket {
  packetVersion: typeof CANONICAL_PACKET_VERSION;

  // ── Identité ─────────────────────────────────────────────────────────────
  projectId: string;
  chapterId: string;
  imageId: string;
  sourceBeatId: string;
  pageIndex: number;
  panelIndex: number;
  beatIndex: number;

  // ── Classification ───────────────────────────────────────────────────────
  imageIntentType: ImageIntentType;
  contentRating: ContentRating;
  universeProfile: UniverseProfileRef;
  mangaStyleProfile: MangaStyleProfileRef;
  visualClassification: VisualClassification;

  // ── Contexte ─────────────────────────────────────────────────────────────
  storyContext: StoryContext;
  sceneContext: SceneContext;
  dialogueContext: DialogueContext | null;
  environmentContext: EnvironmentContext;
  continuityContext: ContinuityContext;

  // ── Entités ──────────────────────────────────────────────────────────────
  characterContext: CharacterContextEntry[];
  npcContext: NpcContextEntry[];
  propContext: PropContextEntry[];
  groupContext: GroupContextEntry | null;

  // ── Hiérarchie visuelle ──────────────────────────────────────────────────
  dominantSubjectKind: string;
  heroPresenceMode: HeroPresenceMode;
  heroVisualWeight: number;
  subjectBalance: SubjectBalance;

  // ── Bindings canon / LoRA ────────────────────────────────────────────────
  loraBindings: LoraBinding[];
  canonBindings: CanonBinding[];

  // ── Prompt structuré ─────────────────────────────────────────────────────
  promptSections: PromptSection[];
  finalFrenchStructuredPrompt: string;
  finalEnglishStructuredPrompt: string;
  negativePromptEnglish: string;

  // ── Payload provider ─────────────────────────────────────────────────────
  provider: "fal";
  modelRoutingDecision: ModelRoutingDecision;
  providerPayload: ProviderPayload;

  // ── Debug / observabilité ────────────────────────────────────────────────
  buildWarnings: string[];
  buildTimestamp: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-types
// ────────────────────────────────────────────────────────────────────────────

export interface UniverseProfileRef {
  universeId: string;
  universeName: string;
  tone: string;
  era: string | null;
  magicLevel: string | null;
}

export interface MangaStyleProfileRef {
  styleId: string;
  styleName: string;
  medium: "manga";
  inkingStyle: string;
  shadingStyle: string;
  compositionStyle: string;
  referenceMangaTitle: string | null;
}

export interface VisualClassification {
  rating: ContentRating;
  audience: string;
  violenceLevel: "none" | "mild" | "moderate" | "intense";
  sensualityLevel: "none" | "mild" | "moderate" | "explicit";
  allowedTokens: string[];
  forbiddenTokens: string[];
}

export interface StoryContext {
  chapterTitle: string;
  chapterSummary: string;
  beatTitle: string;
  beatNarrativeFunction: string;
  previousBeatId: string | null;
  nextBeatId: string | null;
}

export interface SceneContext {
  sceneId: string;
  sceneFunction: string;
  mood: string;
  tension: "low" | "medium" | "high" | "peak";
  actionSummary: string;
}

export interface DialogueContext {
  primarySpeakerId: string | null;
  lines: DialogueLine[];
  dialogueBeat: string | null;
}

export interface DialogueLine {
  speakerId: string | null;
  speakerName: string;
  text: string;
  emotion: string | null;
}

export interface EnvironmentContext {
  locationId: string;
  locationName: string;
  locationCanonDescription: string;
  timeOfDay: string;
  weather: string | null;
  mustShowLocationSignals: string[];
  atmosphereTokens: string[];
}

export interface ContinuityContext {
  anchors: ContinuityAnchor[];
  recentBeatsSummary: string;
  heroKnownInjuries: string[];
  heroKnownOutfit: string | null;
  activeInventory: string[];
}

export interface ContinuityAnchor {
  type: "location" | "prop" | "injury" | "outfit" | "relationship" | "event";
  label: string;
  sourceBeatId: string | null;
}

export interface CharacterContextEntry {
  characterId: string;
  characterName: string;
  role: string;
  isHero: boolean;
  importanceTier:
    | "MAIN_HERO"
    | "SECONDARY_CORE"
    | "IMPORTANT_SUPPORTING_CHARACTER"
    | "RECURRING_NPC"
    | "BACKGROUND_EXTRA";
  canonDescription: string;
  currentOutfit: string | null;
  presenceMode: HeroPresenceMode;
  visualWeight: number;
  requiredFacialReadability: boolean;
  canonRefAssetIds: string[];
}

export interface NpcContextEntry {
  npcId: string;
  npcName: string;
  role: string;
  canonDescription: string;
  presenceMode: HeroPresenceMode;
  visualWeight: number;
}

export interface PropContextEntry {
  propId: string;
  propName: string;
  ownerCategory: "hero" | "enemy" | "guard" | "npc" | "ambient";
  canonDescription: string;
  visualSignificance: "critical" | "high" | "medium" | "low";
}

export interface GroupContextEntry {
  groupKind: "guards" | "soldiers" | "crowd" | "bystanders" | "enemies";
  count: number;
  postureDescription: string;
  threatLevel: "none" | "latent" | "active";
  groupProps: string[];
}

export interface SubjectBalance {
  primarySubjects: string[];
  weightByEntityId: Record<string, number>;
  requiredReadableFaces: string[];
  requiredRelativePosition: string | null;
  forbiddenSoloFraming: boolean;
}

export interface LoraBinding {
  loraId: string;
  loraName: string;
  scope: "style" | "character" | "universe";
  weight: number;
}

export interface CanonBinding {
  canonType: "character" | "npc" | "location" | "prop" | "style" | "universe";
  canonId: string;
  canonLabel: string;
  sourcePath: string | null;
}

export interface PromptSection {
  tag:
    | "VISUAL_STYLE"
    | "CONTENT_CLASSIFICATION"
    | "MANGA_MEDIUM"
    | "SCENE_ACTION"
    | "ENVIRONMENT"
    | "HERO_DESCRIPTION"
    | "SECONDARY_CHARACTER_DESCRIPTION"
    | "NPC_DESCRIPTION"
    | "GROUP_DESCRIPTION"
    | "PROP_DESCRIPTION"
    | "DIALOGUE_CONTEXT"
    | "STORY_CONTEXT"
    | "CANON_CONSTRAINTS"
    | "FORBIDDEN_ELEMENTS";
  languageFr: string;
  languageEn: string;
  required: boolean;
}

export interface ModelRoutingDecision {
  modelId: string;
  referencePolicy: "STRONG" | "LIGHT" | "NONE";
  usedRefAssetIds: string[];
  usedIpAdapterRefAssetIds: string[];
  reason: string;
}

export interface ProviderPayload {
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  refs: ProviderRef[];
  ipAdapterRefs: ProviderRef[];
  guidanceScale: number | null;
  seed: number | null;
  extra: Record<string, unknown>;
}

export interface ProviderRef {
  assetId: string;
  url: string;
  kind: "character" | "style" | "scene";
  weight: number;
}
