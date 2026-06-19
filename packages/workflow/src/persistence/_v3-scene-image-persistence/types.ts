import type { Prisma } from "@manga-ai-studio/db";
import type {
  FalRenderRoute,
  PanelRenderSpec,
  StoryboardPlan,
  StoryboardPanelV3 as StoryboardPanel,
} from "@manga-ai-studio/ai";
import type { VisualQaResult } from "@manga-ai-studio/ai";
import type { SceneImageStatus } from "@manga-ai-studio/core";

export type PanelFinalStatus =
  | "passed"
  | "passed_after_retry"
  | "manual_review_required"
  | "failed";

/** Historique des tentatives image + QA (persisté dans `SceneImage.metadata`). */
export interface V3PanelRenderAttemptLog {
  attemptNumber: number;
  prompt: string;
  negative: string;
  imageUrl: string | null;
  qaScore: number;
  qaReasons: string[];
  retryStrategy?: string;
  passed: boolean;
  createdAt: string;
}

export interface V3RenderedPanelRecord {
  spec: PanelRenderSpec;
  prompt: { positive: string; negative: string };
  route: FalRenderRoute;
  imageUrl?: string | null;
  provider?: string | null;
  model?: string | null;
  seed?: number | null;
  error?: string | null;
  renderFailure?: unknown;
  /** Statut livrable après génération + QA visuelle (render-pass v3). */
  finalStatus?: PanelFinalStatus | null;
  /** Renseigné par le render-pass v3 après QA (évite un second passage vision en persistance). */
  visualQa?: VisualQaResult | null;
  /** Chaque tentative FAL + résultat QA (ordre chronologique). */
  renderAttempts?: V3PanelRenderAttemptLog[];
}

export interface V3SceneImagePersistInput {
  chapterId: string;
  storyboardPlan: StoryboardPlan;
  rendered: V3RenderedPanelRecord[];
  /** P1.14 — aligné sur Chapter.currentGenerationRunId pour filtrage QA / reader */
  generationRunId?: string | null;
}

export interface V3SceneImagePersistResult {
  scenesCreated: number;
  scenesReused: number;
  imagesUpserted: number;
  imagesSkipped: number;
  imagesPersisted: number;
  imagesAlreadyStable: number;
  imagesStorageFailed: number;
  warnings: string[];
  /**
   * AUDIT-V8 — `panelId` (clé blueprint) effectivement persistés en DB.
   */
  persistedPanelIds: string[];
  /**
   * AUDIT-V8 — `panelId` skippés avec raison structurée.
   */
  skippedPanelIds: Array<{ panelId: string; reason: string }>;
}

export interface PreparedPanelStorageMeta {
  bucket: string | null;
  storageKey: string | null;
  mimeType: string | null;
}

export interface PreparedPanelData {
  panel: StoryboardPanel;
  record: V3RenderedPanelRecord;
  panelNumber: number;
  durableImageUrl: string | null;
  storageMeta: PreparedPanelStorageMeta;
  status: Extract<SceneImageStatus, "completed" | "failed" | "pending">;
  metadata: Prisma.InputJsonValue;
  routingDecision: Prisma.InputJsonValue;
  externalPanelId: string;
  panelBlueprintId: string | null;
  skipped: boolean;
  skipReason?: string;
}
