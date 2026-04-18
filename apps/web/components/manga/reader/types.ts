/**
 * P5.2 — Types partagés du reader (extraits de manga-book-reader.tsx).
 *
 * L'objectif de cette extraction n'est pas d'ouvrir la boîte noire du reader
 * (risque élevé de régression UX) mais de découpler les types réutilisables
 * — notamment SceneImage, ChapterPayload, ReaderResponse — que d'autres
 * composants pourront consommer sans dépendre du composant principal.
 *
 * Le composant `manga-book-reader.tsx` re-importe ces types depuis ce fichier
 * pour préserver la source de vérité unique.
 */

export type ReaderSceneImage = {
  id: string;
  imageUrl: string | null;
  /** URGENCE 3 : URL stable Supabase — préférée au `imageUrl` via `getStableImageUrl`. */
  persistedUrl?: string | null;
  panelNumber: number;
  status?: string;
  provider?: string | null;
  model?: string | null;
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
  };
};

export type ReaderChapterScene = {
  id: string;
  title: string | null;
  pageLayoutTemplate?: string | null;
  isSplashPage?: boolean | null;
  isDoublePage?: boolean | null;
  dramaticWeight?: number | null;
  images: ReaderSceneImage[];
};

export type ReaderChapterPayload = {
  id: string;
  chapterNumber: number;
  title: string | null;
  summary: string | null;
  cliffhanger: string | null;
  storyboard: unknown;
  outline: unknown;
  script: unknown;
  scenes: ReaderChapterScene[];
};

export type ReaderCanonStateData = {
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
