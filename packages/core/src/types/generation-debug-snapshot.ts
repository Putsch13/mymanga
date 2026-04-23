import type {
  ReadingDirection,
  ReaderPageTemplateId,
  TextAnchorZone,
  TextOverflowStrategy,
} from "./reader-page-format";

export interface CharacterVisualDna {
  characterId: string;
  displayName?: string | null;
  hairColor?: string | null;
  eyeColor?: string | null;
  outfitSignature?: string | null;
  canonSignatureText?: string | null;
  forbiddenDrift?: string[];
}

export interface NpcVisualDna {
  continuityId?: string | null;
  displayName?: string | null;
  category?: string | null;
  visualMarkers?: string[];
  forbiddenDrift?: string[];
}

export interface EnvironmentVisualDna {
  locationName: string;
  anchorId?: string | null;
  architectureHints?: string[];
  propAnchors?: string[];
  lightingHints?: string[];
  forbiddenDrift?: string[];
}

export interface SceneRosterEntry {
  entityId: string;
  entityType: "character" | "npc" | "enemy";
  displayName?: string | null;
  presence: "must_show" | "support" | "background";
  continuityNotes?: string[];
}

export interface SceneContinuitySnapshot {
  previousPanelId?: string | null;
  previousEnvironmentAnchorId?: string | null;
  notes: string[];
  mustPersist: string[];
  mustAvoid: string[];
}

export interface PanelTextDebugSnapshot {
  dialogues: Array<{ speaker: string; text: string }>;
  narration?: string | null;
  sfx?: string[];
  reservedZones?: TextAnchorZone[];
  preferredAnchorZones?: TextAnchorZone[];
  overflowStrategy?: TextOverflowStrategy;
}

export interface ReaderLayoutDebugSnapshot {
  templateId: ReaderPageTemplateId | string;
  readingDirection: ReadingDirection;
  panelSlotArea?: string | null;
  panelSlotOrder?: number | null;
}

export interface GenerationDebugSnapshot {
  version: "v2";
  panelId: string;
  pageNumber: number;
  panelNumberInPage: number;
  readerLayout: ReaderLayoutDebugSnapshot;
  roster: SceneRosterEntry[];
  characterVisualDna: CharacterVisualDna[];
  npcVisualDna: NpcVisualDna[];
  environmentVisualDna?: EnvironmentVisualDna | null;
  continuity: SceneContinuitySnapshot;
  text: PanelTextDebugSnapshot;
  prompt: {
    positive: string;
    negative: string;
    provider: string | null;
    model: string | null;
    routeModelId: string;
    referencePolicy: string;
    seed?: number | null;
  };
  result: {
    status: "completed" | "failed" | "pending";
    imageUrl?: string | null;
    error?: string | null;
  };
}
