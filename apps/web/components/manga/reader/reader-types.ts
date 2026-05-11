/**
 * P5.2 — Types extraits de manga-book-reader.tsx pour permettre aux
 * hooks et helpers (`build-reader-pages`, `use-reader-navigation`,
 * `use-reader-tts`, …) de les consommer sans créer de cycles.
 *
 * Les noms et shapes sont strictement identiques au fichier d'origine.
 */

import type {
  GenerationDebugSnapshot,
  ReaderPageTemplateId,
  ReaderTextPlacementHint,
  ReadingDirection,
} from "@manga-ai-studio/core";

export type SceneImage = {
  id: string;
  imageUrl: string | null;
  persistedUrl?: string | null;
  panelNumber: number;
  status?: string;
  provider?: string | null;
  model?: string | null;
  /**
   * FIX-31 — Indique qu'un panel a été explicitement validé par
   * l'utilisateur. Lui permet de rester rendu côté reader même si son
   * `status` est FAILED/BLOCKED (override manuel).
   */
  userValidatedAt?: Date | null;
  metadata?: {
    dialogue?: { speaker: string; text: string } | Array<{ speaker: string; text: string }>;
    dialogues?: Array<{ speaker: string; text: string }>;
    narration?: string;
    sfx?: string;
    caption?: string;
    layout?: string;
    mood?: string;
    textScale?: "normal" | "compact" | "micro";
    error?: string;
    blockedReason?: string;
    renderMeta?: {
      cropMode?: "contain" | "cover";
      focalPoint?: { x: number; y: number };
      safeArea?: { top: number; right: number; bottom: number; left: number };
      reservedTextZones?: Array<"top-left" | "top-right" | "bottom-left" | "bottom-right" | "center">;
    };
    layoutMeta?: {
      slotType?: "wide" | "tall" | "square" | "closeup" | "dialogue";
      targetAspectRatio?: string;
      layoutTemplate?: string;
    };
    textMeta?: ReaderTextPlacementHint & {
      overlayReadingDirection?: ReadingDirection;
    };
    readerLayout?: {
      templateId?: ReaderPageTemplateId | string;
      readingDirection?: ReadingDirection;
      panelSlotArea?: string | null;
      panelSlotOrder?: number | null;
    };
    generationDebugSnapshot?: GenerationDebugSnapshot;
  };
};

export type ChapterScene = {
  id: string;
  title: string | null;
  pageLayoutTemplate?: string | null;
  isSplashPage?: boolean | null;
  isDoublePage?: boolean | null;
  dramaticWeight?: number | null;
  images: SceneImage[];
};

export type ChapterPayload = {
  id: string;
  chapterNumber: number;
  title: string | null;
  summary: string | null;
  cliffhanger: string | null;
  storyboard: unknown;
  outline: unknown;
  script: unknown;
  scenes: ChapterScene[];
};

export type CanonStateData = {
  hasCanonState: boolean;
  worldState?: {
    activeLocations: string[];
    activeThreats: string[];
    activeMysteries: string[];
  };
  openThreads?: Array<{
    label: string;
    description: string;
    priority: string;
    introducedAtChapter: number;
  }>;
  characterStates?: Array<{
    characterName: string;
    currentState: {
      location?: string;
      outfit?: string;
      injuries?: string[];
      emotion?: string;
      objective?: string;
    };
  }>;
  canonEvents?: Array<{
    type: string;
    subjectName?: string | null;
    description: string;
    irreversible: boolean;
  }>;
  continuityWarnings?: string[];
};

export type ReaderResponse = {
  chapter: ChapterPayload;
  /** PHASE 5: Format du projet pour initialisation correcte du reader */
  projectFormat?: "manga" | "webtoon";
  memorySnapshot?: {
    narrativeSummary?: string | null;
    openLoops?: string[] | null;
  } | null;
  activeJob?: { id: string; status: string } | null;
  imageStats?: { total: number; completed: number; failed: number; pending: number } | null;
  generationDiagnostics?: {
    operationalStatus?: string;
    degradedModes?: string[];
    outline?: { fallbackReason?: string; usedFallback?: boolean } | null;
    dialogue?: { usedFallback?: boolean; fallbackSceneIds?: string[] } | null;
    sceneFallbacks?: Array<{ sceneId: string; title: string | null; reason: string }>;
    creativityControls?: {
      noveltyLevel?: number;
      worldStrictness?: number;
      visualExoticism?: number;
      npcVariety?: number;
      environmentRichness?: number;
    } | null;
    qualityReport?: {
      averageReleaseScore?: number;
      releaseThreshold?: number;
      premiumReleaseAccepted?: boolean;
      weakPanels?: Array<{ panelIndex: number; releaseScore: number; issues: number }>;
    } | null;
    panelDebug?: Array<{
      sceneId: string;
      panelId: string;
      panelNumber: number;
      status: string | null;
      provider: string | null;
      model: string | null;
      keyframeId: string | null;
      keyframeImageUrl: string | null;
      workflow: string | null;
      referencePolicy: string | null;
      panelCategory: string | null;
      sceneComplexityScore: number | null;
      environmentCritical: boolean;
      continuityCritical: boolean;
      prompt: string | null;
      promptDebug?: {
        finalPrompt: string | null;
        finalNegativePrompt?: string | null;
        promptSource?: string | null;
        usedPacket?: boolean;
        packetVersion?: string | null;
        provider?: string | null;
        model?: string | null;
        referencePolicy?: string | null;
        width?: number | null;
        height?: number | null;
        refsCount?: number | null;
        lorasCount?: number | null;
        seed?: number | null;
        origin?: string | null;
        requestedAt?: string | null;
        retryMode?: string | null;
        retryAttemptIndex?: number | null;
        promptWarnings: string[];
      } | null;
      generationDebugSnapshot?: GenerationDebugSnapshot | null;
      canonicalPacket?: {
        packetVersion: string | null;
        imageIntentType: string | null;
        dominantSubjectKind: string | null;
        heroPresenceMode: string | null;
        contentRating: string | null;
        finalEnglishStructuredPrompt: string | null;
        negativePromptEnglish: string | null;
        modelRoutingDecision: Record<string, unknown> | null;
        providerPayload: Record<string, unknown> | null;
        buildWarnings: string[];
      } | null;
      canonicalPacketValidation?: Record<string, unknown> | null;
      packetRerollPlans?: Array<Record<string, unknown>>;
      releaseScore: number | null;
      backgroundPresenceScore: number | null;
      interactionScore: number | null;
      styleConsistencyScore: number | null;
      visionScore: number | null;
      visionEnabled: boolean;
      visionFindings: string[];
      rerollCount: number;
      rerollKind: string | null;
      scenePass: string | null;
      imageSize: string | null;
      issues: Array<{ message?: string; severity?: string; type?: string }>;
      traces: Array<{
        id: string;
        status: string;
        mode: string;
        provider: string;
        model: string;
        requestId: string | null;
        jobId: string | null;
        refsUsed: string[];
        lorasUsed: unknown[];
        timings: Record<string, unknown> | null;
        requestPayload: Record<string, unknown> | null;
      }>;
    }>;
  } | null;
};
