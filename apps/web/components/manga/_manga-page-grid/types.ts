import type {
  GenerationDebugSnapshot,
  PageLayoutTemplate,
  PanelTextContract,
  ReaderTextPlacementHint,
  ReadingDirection,
} from "@manga-ai-studio/core";

import type { AnyPanelMood } from "../manga-panel";

export type DemoPanel = {
  id: string;
  size: "wide" | "tall" | "large" | "normal";
  mood: string;
  dialogue?: string;
  speaker?: string;
  narration?: string;
  sfx?: string;
  characters?: string[];
};

export type DemoMangaPage = {
  id: string;
  layout: "A" | "B" | "C" | "D" | "E";
  panels: DemoPanel[];
};

export interface UniversalPanel {
  id?: string;
  mood: AnyPanelMood;
  imageUrl?: string | null;
  status?: string;
  provider?: string | null;
  model?: string | null;
  error?: string | null;
  dialogue?: string;
  dialogues?: Array<{ speaker: string; text: string }>;
  speaker?: string;
  narration?: string;
  sfx?: string;
  caption?: string;
  textScale?: "normal" | "compact" | "micro";
  /** Métadonnées de rendu strict pour éviter le crop arbitraire */
  renderMeta?: {
    cropMode?: "contain" | "cover";
    focalPoint?: { x: number; y: number };
    safeArea?: { top: number; right: number; bottom: number; left: number };
    reservedTextZones?: Array<
      "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center"
    >;
  };
  /** Métadonnées de layout pour choix intelligent de la page */
  layoutMeta?: {
    slotType?: string | null;
    targetAspectRatio?: string | null;
    layoutTemplate?: string | null;
    layoutHint?: string | null;
    textPlacementPreference?: string | null;
    safeTextZones?: Array<{ x: number; y: number; width: number; height: number }> | null;
    isSplashPage?: boolean;
    isDoublePage?: boolean;
  };
  textMeta?: ReaderTextPlacementHint & {
    overlayReadingDirection?: ReadingDirection;
  };
  generationDebugSnapshot?: GenerationDebugSnapshot;
  /**
   * PR9 — contrat texte (persisté ou synthétisé). `dialogue` / `dialogues`
   * restent des dérivés pour l'UI legacy.
   */
  textContract?: PanelTextContract | null;
}

// LAY-2 : types étendus pour les nouveaux templates de layout
// P1-4 : la partie dynamique (splash/double_spread/...) vient de core.
export type ExtendedLayoutTemplate = "A" | "B" | "C" | "D" | "E" | "F" | PageLayoutTemplate;

export interface UniversalMangaPage {
  id?: string;
  layout: "A" | "B" | "C" | "D" | "E" | "F";
  /** LAY-2 : template étendu (prioritaire sur layout si présent) */
  layoutTemplate?: ExtendedLayoutTemplate;
  readingDirection?: ReadingDirection;
  panelSlots?: Array<{ panelId?: string; area: string; order: number }>;
  isSplashPage?: boolean;
  isDoublePage?: boolean;
  title?: string | null;
  panels: UniversalPanel[];
}

export interface PipelinePanel {
  panelNumber: number;
  mood?: string;
  imageUrl?: string | null;
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
    textScale?: "normal" | "compact" | "micro";
    error?: string;
    blockedReason?: string;
    renderMeta?: UniversalPanel["renderMeta"];
    layoutMeta?: UniversalPanel["layoutMeta"];
    textMeta?: UniversalPanel["textMeta"];
    generationDebugSnapshot?: GenerationDebugSnapshot;
  };
}

export interface PipelineScene {
  id: string;
  images?: PipelinePanel[];
  // URGENCE 3 : champs layout depuis la DB
  pageLayoutTemplate?: string | null;
  isSplashPage?: boolean | null;
  isDoublePage?: boolean | null;
  dramaticWeight?: number | null;
}

export type MangaGridLayout = "A" | "B" | "C" | "D" | "E" | "F";

export type FitResult = { fit: "cover" | "contain"; position: string };
