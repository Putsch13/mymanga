import type { PanelTextContract } from "../generation/panel-text-contract";

export type BubbleType =
  | "speech"
  | "thought"
  | "whisper"
  | "shout"
  | "inner_monologue"
  | "narration_box"
  | "radio"
  | "demonic_voice"
  | "sfx";

export interface MangaBubble {
  id: string;
  speaker?: string;
  text: string;
  bubbleType: BubbleType;
  emotion?: string;
  priority: number;
  tailTarget?: string;
  readingOrder: number;
}

export interface MangaPanelText {
  panelId: string;
  bubbles: MangaBubble[];
  narration?: string[];
  sfx?: string[];
  pauseWeight?: number;
  /** PR5 — contrat texte unique (generation) aligné bulles / narration / SFX. */
  textContract?: PanelTextContract | null;
}

export interface MangaSceneDialogue {
  sceneId: string;
  panels: MangaPanelText[];
  totalBubbles: number;
}
