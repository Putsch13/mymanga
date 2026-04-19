/**
 * P2.2 — Observabilité métier.
 *
 * Cette couche émet des métriques métier **structurées**, dérivées du
 * `logPipeline` JSON déjà en place. Le but n'est pas d'ajouter une
 * dépendance à un SDK prometheus/posthog — on veut surtout que :
 *
 *   1. chaque dérive métier critique devienne observable sans code review
 *      manuel (grep/jq sur `event: "metric.*"`),
 *   2. la forme des events soit **stable** (même shape à chaque émission),
 *   3. tout ajout futur de métrique reste typé (pas de drift silencieux),
 *   4. un agrégateur tiers (loki, datadog, posthog via ingestion de logs)
 *      puisse calculer les ratios demandés dans le TODO :
 *        - % panels non-héros avec biais héros
 *        - % drift PNJ
 *        - % drift décor
 *        - % retry par type de panel
 *        - % fallback IA PNJ
 *        - % persistence image échouée
 *        - % panels manuels non-canoniques
 *        - score de stabilité par chapitre
 */

import { logPipelineInfo, logPipelineWarn, type PipelineLogOptions } from "./pipeline-logger";

// ──────────────────────────────────────────────────────────────────────────
// Types publics
// ──────────────────────────────────────────────────────────────────────────

export type BusinessMetricContext = {
  projectId?: string;
  chapterId?: string;
  sceneId?: string;
  panelId?: string;
  userId?: string;
};

/**
 * Type discriminant des events `metric.*` émis par le pipeline. Garde la
 * shape stable pour les consommateurs aval.
 */
export type BusinessMetricEvent =
  | "metric.hero_bias_on_non_hero_panel"
  | "metric.npc_drift_detected"
  | "metric.decor_drift_detected"
  | "metric.panel_retry"
  | "metric.npc_ai_fallback"
  | "metric.image_persist_failed"
  | "metric.manual_visual_ref_non_canonical"
  | "metric.chapter_stability_score";

type LogOpts = PipelineLogOptions & BusinessMetricContext;

function toLogOpts(ctx: BusinessMetricContext | undefined): LogOpts {
  return {
    ns: "metrics",
    ...(ctx ?? {}),
  };
}

function emit(
  event: BusinessMetricEvent,
  payload: Record<string, unknown>,
  ctx: BusinessMetricContext | undefined,
  level: "info" | "warn" = "info",
): void {
  const opts = toLogOpts(ctx);
  const enrichedPayload = {
    ...payload,
    ...(ctx?.sceneId ? { sceneId: ctx.sceneId } : {}),
    ...(ctx?.panelId ? { panelId: ctx.panelId } : {}),
    ...(ctx?.userId ? { userId: ctx.userId } : {}),
  };
  if (level === "warn") {
    logPipelineWarn(event, enrichedPayload, opts);
  } else {
    logPipelineInfo(event, enrichedPayload, opts);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Émetteurs typés, un par métrique demandée dans le TODO.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Un panel qui N'EST PAS un panel héros (dominantSubject != hero) a néanmoins
 * été routé avec un biais héros explicite ou implicite. Symptôme typique :
 * `CHARACTER_LOCK` posé sur un cutaway `environment`.
 */
export function emitHeroBiasOnNonHeroPanel(
  args: {
    dominantKind: string;
    panelCategory: string | null;
    cutawayType?: string | null;
    /** "explicit" si hero_focus=true, "implicit" si déduit via fallback. */
    biasSource: "explicit" | "implicit";
  },
  ctx?: BusinessMetricContext,
): void {
  emit(
    "metric.hero_bias_on_non_hero_panel",
    {
      dominantKind: args.dominantKind,
      panelCategory: args.panelCategory,
      cutawayType: args.cutawayType ?? null,
      biasSource: args.biasSource,
    },
    ctx,
    "warn",
  );
}

/**
 * Un PNJ canon (même label, même rôle) a changé de marqueurs visuels entre
 * deux panels du même chapitre / même arc narratif sans justification
 * narrative (event transfer, transformation, age-up).
 */
export function emitNpcDriftDetected(
  args: {
    npcLabel: string;
    npcId?: string | null;
    driftedFields: string[];
    severity: "minor" | "major" | "critical";
  },
  ctx?: BusinessMetricContext,
): void {
  emit(
    "metric.npc_drift_detected",
    {
      npcLabel: args.npcLabel,
      npcId: args.npcId ?? null,
      driftedFields: args.driftedFields,
      severity: args.severity,
    },
    ctx,
    "warn",
  );
}

/**
 * Un lieu canonique a vu ses marqueurs visuels fixes (architecture, props
 * fixes, palette) changer entre deux panels sans transition narrative.
 */
export function emitDecorDriftDetected(
  args: {
    locationId: string;
    locationName: string;
    driftedMarkers: string[];
    severity: "minor" | "major" | "critical";
  },
  ctx?: BusinessMetricContext,
): void {
  emit(
    "metric.decor_drift_detected",
    {
      locationId: args.locationId,
      locationName: args.locationName,
      driftedMarkers: args.driftedMarkers,
      severity: args.severity,
    },
    ctx,
    "warn",
  );
}

/**
 * Un panel a déclenché un retry/reroll (environment, character, composition,
 * full). Permet ensuite de calculer retry_rate par panelCategory.
 */
export function emitPanelRetry(
  args: {
    panelCategory: string | null;
    retryMode: "environment" | "character" | "composition" | "full" | string;
    retryReason: string;
    attemptNumber: number;
  },
  ctx?: BusinessMetricContext,
): void {
  emit(
    "metric.panel_retry",
    {
      panelCategory: args.panelCategory,
      retryMode: args.retryMode,
      retryReason: args.retryReason,
      attemptNumber: args.attemptNumber,
    },
    ctx,
  );
}

/**
 * Le resolver NPC a dû tomber sur `buildControlledNpcFallback` parce que la
 * sortie IA était invalide. Signal fort d'un souci prompt/modèle.
 */
export function emitNpcAiFallback(
  args: {
    reason:
      | "missing_openai"
      | "llm_call_failed"
      | "invalid_json"
      | "invalid_schema";
    rawDescriptionPreview?: string;
  },
  ctx?: BusinessMetricContext,
): void {
  emit(
    "metric.npc_ai_fallback",
    {
      reason: args.reason,
      rawDescriptionPreview: args.rawDescriptionPreview?.slice(0, 120) ?? null,
    },
    ctx,
    "warn",
  );
}

/**
 * Une génération image a réussi côté provider mais la persistence (Supabase
 * upload, asset creation, signed URL) a échoué. Les refund doivent être
 * observables pour détecter la dérive du storage.
 */
export function emitImagePersistFailed(
  args: {
    stage: "upload" | "signing" | "asset_create" | "assert_stable";
    provider: "fal" | "bfl" | "other";
    detail?: string;
  },
  ctx?: BusinessMetricContext,
): void {
  emit(
    "metric.image_persist_failed",
    {
      stage: args.stage,
      provider: args.provider,
      detail: args.detail?.slice(0, 200) ?? null,
    },
    ctx,
    "warn",
  );
}

/**
 * Un `characterVisualRef` a été créé manuellement à partir d'une URL externe
 * stable, donc non-canonique (politique permissive mais traçable P0.3).
 */
export function emitManualVisualRefNonCanonical(
  args: {
    characterId: string;
    assetProvenance: "external_stable_url" | "supabase_direct" | "other";
    hadMediaAssetId: boolean;
  },
  ctx?: BusinessMetricContext,
): void {
  emit(
    "metric.manual_visual_ref_non_canonical",
    {
      characterId: args.characterId,
      assetProvenance: args.assetProvenance,
      hadMediaAssetId: args.hadMediaAssetId,
    },
    ctx,
  );
}

/**
 * Score agrégé de stabilité visuelle/continuité d'un chapitre, calculé à la
 * fin du pipeline. Exposé pour pouvoir détecter une régression chapitre par
 * chapitre.
 */
export function emitChapterStabilityScore(
  args: {
    score: number;
    panelCount: number;
    driftIssuesCount: number;
    continuityIssuesCount: number;
    retryRate: number;
  },
  ctx?: BusinessMetricContext,
): void {
  emit(
    "metric.chapter_stability_score",
    {
      score: clamp01(args.score),
      panelCount: Math.max(0, Math.floor(args.panelCount)),
      driftIssuesCount: Math.max(0, Math.floor(args.driftIssuesCount)),
      continuityIssuesCount: Math.max(0, Math.floor(args.continuityIssuesCount)),
      retryRate: clamp01(args.retryRate),
    },
    ctx,
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return Number(n.toFixed(4));
}

/**
 * Calcule un `chapterStabilityScore` ∈ [0,1] à partir de compteurs bruts.
 * Pur, testable. La formule pondère plus lourdement les issues critiques
 * de continuité (timeline/causality) que les retries.
 */
export function computeChapterStabilityScore(args: {
  panelCount: number;
  driftIssues: { severity: "minor" | "major" | "critical" }[];
  continuityIssues: { severity: "minor" | "major" | "critical" }[];
  retryCount: number;
}): { score: number; retryRate: number } {
  const panels = Math.max(1, Math.floor(args.panelCount));
  const retryRate = Math.min(1, args.retryCount / panels);

  const issueWeight = (sev: "minor" | "major" | "critical"): number =>
    sev === "critical" ? 1 : sev === "major" ? 0.5 : 0.2;
  const driftPenalty = args.driftIssues.reduce((acc, i) => acc + issueWeight(i.severity), 0) / panels;
  const contPenalty = args.continuityIssues.reduce((acc, i) => acc + issueWeight(i.severity) * 1.5, 0) / panels;
  const retryPenalty = retryRate * 0.3;

  const raw = 1 - driftPenalty - contPenalty - retryPenalty;
  return { score: clamp01(raw), retryRate: clamp01(retryRate) };
}
