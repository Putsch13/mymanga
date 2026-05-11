/**
 * Types publics du module dialogue-writer.
 */
import type {
  MangaPanelText,
  SceneContinuityPayload,
  StructuredBeatPayload,
} from "@manga-ai-studio/core";
import type { GenerationOperationalStatus } from "../../generation-status";

export interface DialogueWriterInput {
  sceneId: string;
  sceneSummary: string;
  location?: string;
  tension: number;
  emotionalObjective: string;
  chapterGoal?: string;
  characters: Array<{
    name: string;
    entityKind?: string | null;
    dialogueMode?: string | null;
    speciesLabel?: string | null;
    roleType?: string | null;
    objective?: string | null;
    fear?: string | null;
    biography?: string | null;
    traits?: string[];
    flaws?: string[];
    speechProfile?: Record<string, unknown>;
    emotionalState?: string;
  }>;
  projectStyle?: string;
  panelCount: number;
  contentIntensityLayer?: string;
  structuredBeatPayload?: StructuredBeatPayload;
  continuityContext?: string[];
  panelBlueprints?: Array<{
    panelId: string;
    action: string;
    mood?: string;
    characters?: string[];
  }>;
}

export interface DialogueWriterResult {
  panels: MangaPanelText[];
  totalBubbles: number;
  continuityPayload: SceneContinuityPayload;
  degradedStatus: GenerationOperationalStatus;
  usedFallback: boolean;
  fallbackReason?: string;
}
