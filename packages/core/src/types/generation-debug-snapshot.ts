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
  /**
   * Résumé compact issu du `stableVisualDNA` studio (configurateur) — injecté
   * dans les prompts render sans relire tout le JSON.
   */
  visualCanonExcerpt?: string | null;
  /** Champs optionnels alignés configurateur / Prisma — tous optionnels pour rétrocompat. */
  hairStyle?: string | null;
  skinTone?: string | null;
  hairLength?: string | null;
  hairTexture?: string | null;
  faceShape?: string | null;
  eyeShape?: string | null;
  eyeSize?: string | null;
  eyebrowStyle?: string | null;
  noseStyle?: string | null;
  mouthStyle?: string | null;
  jawline?: string | null;
  silhouetteType?: string | null;
  perceivedAge?: string | null;
  /** Cicatrices / marques distinctives (texte déjà joint côté producteur). */
  distinctiveMarksLine?: string | null;
  /** Accessoires portés (texte joint). */
  accessoriesLine?: string | null;
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
  /** Ancres visuelles décor (ex. contrat monde visuel `visualAnchors`). */
  visualAnchors?: string[];
  architectureHints?: string[];
  /** Ambiance / densité / mood (issu du VisualWorldContract ou studio). */
  atmosphere?: string[];
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
    /** P0.3 — URL provider originale (FAL, etc.) pour debug */
    providerImageUrl?: string | null;
    /** P0.3 — Bucket de stockage durable */
    storageBucket?: string | null;
    /** P0.3 — Clef de stockage durable */
    storageKey?: string | null;
    error?: string | null;
  };
}
