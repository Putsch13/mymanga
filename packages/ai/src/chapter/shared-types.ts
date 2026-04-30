/**
 * Types partagés du pipeline chapitre (sans logique).
 * Les services (`visual-inference`, `page-dedup`, etc.) importent depuis ici
 * pour éviter un cycle avec `chapter-pipeline.ts` (qui orchestre ces modules).
 */

import type { SceneContinuityPayload, StructuredBeatPayload, VisualWorldContract } from "@manga-ai-studio/core";

export type ProjectContextForChapter = {
  project: {
    title: string;
    pitch: string | null;
    description?: string | null;
    primaryGenre: string | null;
    subGenres?: string[];
    tone: string | null;
    format: string | null;
    visualStyle?: string | null;
    contentRating?: string | null;
    intensityLayer?: string | null;
  };
  focusCharacterIds?: string[];
  /** Personnage avec rôle secondaire / co-protagoniste détecté dans le projet. */
  secondaryHeroCharacterId?: string | null;
  settings?: {
    violenceLevel?: number | null;
    romanceLevel?: number | null;
    sensualityLevel?: number | null;
    darknessLevel?: number | null;
    mysteryLevel?: number | null;
    dialogueDensity?: number | null;
    canonStrictness?: number | null;
  } | null;
  stylePack?: {
    renderFamily?: string | null;
    lineWeight?: string | null;
    shadingMode?: string | null;
    contrastProfile?: string | null;
    anatomyBias?: string | null;
    backgroundDensity?: string | null;
    cameraLanguage?: string | null;
    negativeConstraints?: string[];
  } | null;
  storyBible?: {
    summary?: string | null;
    themes?: string[];
    worldRules?: unknown;
    lore?: unknown;
    glossary?: unknown;
    lockedCanon?: unknown;
  } | null;
  locations?: Array<{
    id?: string;
    name: string;
    /** Clé stable cross-chapitres (Prisma `Location.slug`). */
    slug?: string | null;
    type?: string | null;
    description?: string | null;
    aliases?: string[];
    visualBrief?: string | null;
    establishedVisualBrief?: string | null;
    canonImageUrl?: string | null;
    visualRefs?: unknown;
    metadata?: Record<string, unknown> | null;
    canonLocked?: boolean;
    parentLocationId?: string | null;
    firstSeenChapterId?: string | null;
  }>;
  intentEntities?: Array<{
    name: string;
    entityKind: string;
    dialogueMode: string;
    recurrencePolicy: string;
    roleHint?: string | null;
    speciesLabel?: string | null;
  }>;
  characters: Array<{
    id: string;
    name: string;
    roleType: string | null;
    gender?: string | null;
    biography?: string | null;
    objective: string | null;
    fear: string | null;
    emotionalState: string | null;
    status: string;
    canonLocked?: boolean;
    traits?: string[];
    flaws?: string[];
    speechProfile?: Record<string, unknown>;
    appearance?: string | null;
    outfitDefault?: string | null;
    hairColor?: string | null;
    eyeColor?: string | null;
    bodyState?: Record<string, unknown>;
    wardrobeProfile?: Record<string, unknown>;
    visualProfile?: Record<string, unknown>;
    continuityProfile?: Record<string, unknown>;
    /** Traits visuels verrouillés (configurateur / studio). */
    stableVisualDNA?: Record<string, unknown> | null;
    entityKind?: string | null;
    speciesLabel?: string | null;
    dialogueMode?: string | null;
    recurrencePolicy?: string | null;
  }>;
  relationships: Array<{
    sourceCharacterId: string;
    targetCharacterId: string;
    relationType: string;
    intensity: number;
  }>;
  arcs: Array<{
    name: string;
    summary: string | null;
    status: string;
  }>;
  recentChapters: Array<{
    chapterNumber: number;
    title: string | null;
    summary: string | null;
    cliffhanger: string | null;
  }>;
  recentMemory: Array<{
    narrativeSummary: string | null;
  }>;
  retrievedDocs: Array<{
    title: string | null;
    entityType?: string | null;
    content: string;
    metadata?: unknown;
  }>;
  recentContinuityEvents?: Array<{
    eventType: string;
    summary: string | null;
    permanent: boolean;
    importance: number;
    entities?: unknown;
  }>;
  seriesSynopsis?: string;
};

export type PanelMood =
  | "action"
  | "tension"
  | "emotion"
  | "revelation"
  | "calm"
  | "horror"
  | "romance"
  | "comedy"
  | "dramatic";

export type GridLayout = "A" | "B" | "C" | "D" | "E" | "F";

export type StoryboardPanel = {
  panelNumber: number;
  sceneId: string;
  beatId: string;
  caption: string;
  prompt: string;
  negativePrompt: string;
  camera: string;
  characters: string[];
  mood: PanelMood;
  sfx?: string;
  dialogue?: { speaker: string; text: string };
  dialogues?: Array<{ speaker: string; text: string }>;
  narration?: string;
  textScale?: "normal" | "compact" | "micro";
};

export type StoryboardPage = {
  pageNumber: number;
  layout: GridLayout;
  panels: StoryboardPanel[];
};

export type GeneratedChapterBundle = {
  generationDiagnostics: {
    operationalStatus: string;
    degradedModes: string[];
    outline: {
      degradedStatus: string;
      usedFallback: boolean;
      fallbackReason?: string;
      model?: string;
    };
    dialogue: {
      degradedStatus: string;
      usedFallback: boolean;
      fallbackSceneIds: string[];
      reasonsByScene: Array<{ sceneId: string; reason: string }>;
    };
  };
  creativeDirection: {
    chapterGoal: string;
    tone: string;
    whyNow: string;
  };
  plotOptions: Array<{
    id: string;
    title: string;
    label: "safe" | "bold" | "shock";
    summary: string;
  }>;
  outline: {
    chapter_title: string;
    chapter_goal: string;
    tone: string;
    beats: Array<{
      id: string;
      summary: string;
      tension: number;
      characters: string[];
      location: string;
      purpose: string;
      pageRole?: string;
      turn?: string;
      emotionalDelta?: number;
      structuredBeat?: StructuredBeatPayload;
    }>;
    cliffhanger: string;
    continuity_notes: string[];
  };
  script: {
    scenes: Array<{
      id: string;
      title: string;
      summary: string;
      location: string;
      characters: string[];
      purpose: string;
      continuityPayload: SceneContinuityPayload;
      dialogue: Array<{
        speaker: string;
        text: string;
        subtext: string;
        emotion: string;
        intensity: number;
        balloon: string;
      }>;
      generationDiagnostics?: {
        dialogue: {
          degradedStatus: string;
          usedFallback: boolean;
          fallbackReason?: string;
        };
      };
    }>;
  };
  storyboard: {
    pageCount: number;
    pages: StoryboardPage[];
  };
  memory: {
    narrativeSummary: string;
    structuredState: Record<string, unknown>;
    timelineEvents: Array<Record<string, unknown>>;
    openLoops: string[];
  };
  /** Présent quand le bundle a été généré avec un contrat monde (ex. estimate premium, builder). */
  visualWorldContract?: VisualWorldContract | null;
};
