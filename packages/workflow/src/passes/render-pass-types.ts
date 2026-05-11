/**
 * render-pass-types.ts
 *
 * Types publics + erreurs hard-fail du render-pass v3. Extrait de
 * `render-pass.ts` (audit-v9) pour passer sous 500 lignes.
 */

import type {
  ChapterStyleBible,
  ChapterVisualMemory,
  FalRenderRoute,
  PanelRenderSpec,
  StoryboardPlan,
} from "@manga-ai-studio/ai";
import type {
  CanonicalChapterProductionPlan,
  CharacterVisualDna,
} from "@manga-ai-studio/core";
import type { VisualQaResult } from "@manga-ai-studio/ai";
import type { RenderPassResultSummary } from "../persistence/render-persistence";
import type {
  PanelFinalStatus,
  V3PanelRenderAttemptLog,
} from "../persistence/v3-scene-image-persistence";
import type { PanelQaPassOutput } from "./panel-qa-pass";
import type { PageQaPassOutput } from "./page-qa-pass";

/** Détail structuré d’un échec image (logs / persistance / debug). */
export interface RenderPassImageFailureDetail {
  panelId: string;
  renderMode: PanelRenderSpec["renderMode"];
  locationName: string;
  mustShow: string[];
  errorCode: string;
  errorMessage: string;
}

export interface RenderedPanelDescriptor {
  spec: PanelRenderSpec;
  prompt: { positive: string; negative: string };
  route: FalRenderRoute;
  imageUrl?: string | null;
  provider?: string | null;
  model?: string | null;
  seed?: number | null;
  error?: string | null;
  renderFailure?: RenderPassImageFailureDetail | null;
  /** QA visuelle (heuristique + vision si `VISUAL_PANEL_QA_VISION`) après rendu. */
  visualQa?: VisualQaResult | null;
  /** Tentatives FAL + scores QA (persistées en DB). */
  renderAttempts?: V3PanelRenderAttemptLog[];
  /** Après QA visuelle : livrable ou relecture manuelle. */
  finalStatus?: PanelFinalStatus | null;
}

export interface GeneratePanelImageResult {
  ok: boolean;
  error?: string;
  /** Code machine stable (ex. FAL_TIMEOUT) quand l’adapter le fournit. */
  errorCode?: string;
  imageUrl?: string;
  provider?: string;
  model?: string;
  seed?: number | null;
}

export interface RunRenderPassInput {
  chapterId: string;
  /** Requis pour persister une URL stable avant Vision QA sur URL FAL temporaire. */
  projectId?: string;
  storyboardPlan: StoryboardPlan;
  /** Plan canonique (premium) — alimente la QA visuelle critique + debug. */
  canonicalProductionPlan?: CanonicalChapterProductionPlan | null;
  styleBible: ChapterStyleBible;
  visualMemory: ChapterVisualMemory;
  characters: Array<{
    id: string;
    name: string;
    roleType?: string | null;
    hairColor?: string | null;
    eyeColor?: string | null;
    canonSignatureText?: string | null;
    hairStyle?: string | null;
    skinTone?: string | null;
    outfitSignature?: string | null;
    loraUrl?: string | null;
    loraTriggerWord?: string | null;
    loraScale?: number | null;
    forbiddenVisualDrift?: string[] | null;
    stableVisualDNA?: Record<string, unknown> | null;
    /** DNA complet studio / pipeline — prioritaire sur les champs plats pour le prompt. */
    characterVisualDna?: CharacterVisualDna | null;
  }>;
  mainCharacterIds: string[];
  allowedLocations?: string[];
  forbiddenTags?: string[];
  generatePanelImage?: (args: {
    spec: PanelRenderSpec;
    prompt: string;
    negative: string;
    route: FalRenderRoute;
  }) => Promise<GeneratePanelImageResult>;
  /**
   * COMMIT B — quand `true` (défaut), persiste les panels rendus comme
   * `SceneImage` en DB (via `persistV3RenderedPanels`). Permet au reader
   * de consommer la sortie v3 sans dépendre de la passe images historique.
   * À laisser à `false` uniquement en tests unitaires.
   */
  persistToDb?: boolean;
  /**
   * P1.14 — Si absent et `persistToDb`, un nouveau run est créé (chapter + purge
   * des SceneImage non validées). Fournir une valeur pour les tests sans DB.
   */
  generationRunId?: string | null;
  /**
   * Prod premium : config QA vision incomplète mais lancement autorisé
   * (`PREMIUM_VISUAL_QA_REQUIRED=false`) — force `v3RenderQualityStatus=needs_review`.
   */
  visualQaProductionConfigIncomplete?: boolean;
  /** Mode premium-only : refuse les prompts contenant des termes hors contrat (parasites). */
  premiumOutOfContractPromptCheck?: boolean;
}

export interface RunRenderPassResult {
  summary: RenderPassResultSummary;
  specs: PanelRenderSpec[];
  rendered: RenderedPanelDescriptor[];
  panelQa: PanelQaPassOutput;
  pageQa: PageQaPassOutput;
}

/**
 * P0.2 — Erreur bloquante quand la queue de rendu est incomplète.
 * On refuse de payer FAL si le nombre de specs valides != totalPanels.
 */
export class RenderQueueIncompleteError extends Error {
  constructor(
    public readonly totalPanels: number,
    public readonly specsCount: number,
    public readonly preflightErrors: Array<{ panelId: string; error: string }>,
  ) {
    const errorsPreview = preflightErrors
      .slice(0, 5)
      .map((e) => `${e.panelId}:${e.error.substring(0, 50)}`)
      .join(" | ");
    super(
      `premium_render_queue_incomplete totalPanels=${totalPanels} specs=${specsCount} errors=${errorsPreview}`,
    );
    this.name = "RenderQueueIncompleteError";
  }
}

/**
 * P0.2 — Erreur bloquante quand la persistance V3 échoue.
 * Un job ne peut être completed que si toutes les images sont persistées.
 */
export class V3ImagePersistenceError extends Error {
  readonly chapterId: string;
  readonly expectedPanels: number;
  readonly persistedPanels: number;
  readonly missingPanels: string[];
  readonly extraPanels: string[];
  readonly cause?: Error;

  constructor(args: {
    chapterId: string;
    expectedPanels: number;
    persistedPanels: number;
    missingPanels: string[];
    extraPanels?: string[];
    cause?: Error;
  }) {
    const extra = args.extraPanels ?? [];
    const msg =
      `V3_IMAGE_PERSISTENCE_FAILED chapterId=${args.chapterId} ` +
      `expected=${args.expectedPanels} persistedUnique=${args.persistedPanels} ` +
      `missing=[${args.missingPanels.slice(0, 5).join(", ")}${args.missingPanels.length > 5 ? "..." : ""}]` +
      (extra.length > 0
        ? ` extra=[${extra.slice(0, 5).join(", ")}${extra.length > 5 ? "..." : ""}]`
        : "");
    super(msg);
    this.name = "V3ImagePersistenceError";
    this.chapterId = args.chapterId;
    this.expectedPanels = args.expectedPanels;
    this.persistedPanels = args.persistedPanels;
    this.missingPanels = args.missingPanels;
    this.extraPanels = extra;
    this.cause = args.cause;
  }
}
