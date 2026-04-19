/**
 * P7.1 — Panel Hierarchy Logger
 *
 * Fournit des logs structurés pour la hiérarchie visuelle de chaque panel.
 * Utilisé pour le debugging et l'observabilité pendant la génération.
 *
 * Les logs incluent :
 *   - Type d'intent du panel
 *   - Sujet dominant et sujets secondaires
 *   - Entités visibles vs reléguées
 *   - Décisions de référence et de lock
 */

import type { PanelGenerationIntent } from "./generation-intent-planner";
import type { RelegationConfig } from "./entity-relegation";
import type { PromptRecipe } from "./prompt-recipe-builder";
import type { SharedSpotlightConfig } from "./shared-spotlight";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface PanelHierarchyLog {
  timestamp: number;
  panelId: string;
  panelNumber: number;
  pageNumber: number;
  intentSummary: IntentSummary;
  hierarchySummary: HierarchySummary;
  decisionsSummary: DecisionsSummary;
  warnings: string[];
}

export interface IntentSummary {
  intentType: string;
  dominantSubject: string;
  secondarySubjects: string[];
  cutawayType: string | null;
  cameraIntent: string;
}

export interface HierarchySummary {
  foregroundEntities: string[];
  midgroundEntities: string[];
  backgroundEntities: string[];
  relegatedEntities: string[];
  suppressedClauses: string[];
}

export interface DecisionsSummary {
  referencePolicy: string;
  subjectLockBehavior: string | null;
  forbiddenTokensCount: number;
  useVisionCheck: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Logger
// ────────────────────────────────────────────────────────────────────────────

export function buildPanelHierarchyLog(
  intent: PanelGenerationIntent,
  relegation?: RelegationConfig | null,
  recipe?: PromptRecipe | null,
  spotlight?: SharedSpotlightConfig | null,
): PanelHierarchyLog {
  const warnings: string[] = [];

  // Check for potential issues
  if (intent.dominantSubject === "hero" && intent.cutawayType) {
    warnings.push(`hero_dominant_with_cutaway_${intent.cutawayType}`);
  }

  if (
    intent.dominantSubject !== "hero" &&
    intent.requiredVisibleEntities.some((e) => e.role === "primary" && e.label === "hero")
  ) {
    warnings.push("hero_marked_primary_but_not_dominant");
  }

  if (relegation?.relegatedEntities.length && relegation.relegatedEntities.length > 3) {
    warnings.push("many_entities_relegated");
  }

  return {
    timestamp: Date.now(),
    panelId: intent.panelId,
    panelNumber: intent.panelNumber,
    pageNumber: intent.pageNumber,
    intentSummary: {
      intentType: intent.intentType,
      dominantSubject: intent.dominantSubject,
      secondarySubjects: intent.secondarySubjects,
      cutawayType: intent.cutawayType,
      cameraIntent: intent.cameraIntent,
    },
    hierarchySummary: {
      foregroundEntities: intent.visualHierarchy.foreground,
      midgroundEntities: intent.visualHierarchy.midground,
      backgroundEntities: intent.visualHierarchy.background,
      relegatedEntities: relegation?.relegatedEntities.map((e) => e.characterName) ?? [],
      suppressedClauses: intent.suppressedPromptClauses,
    },
    decisionsSummary: {
      referencePolicy: intent.allowedReferencePolicy,
      subjectLockBehavior: spotlight?.subjectLockBehavior ?? null,
      forbiddenTokensCount: intent.forbiddenPromptTokens.length,
      useVisionCheck: recipe?.elementWeights.character ?? 0 > 50,
    },
    warnings,
  };
}

export function formatPanelHierarchyLog(log: PanelHierarchyLog): string {
  const lines: string[] = [
    `[panel-hierarchy] panel=${log.panelId} p${log.pageNumber}/${log.panelNumber}`,
    `  intent=${log.intentSummary.intentType} dominant=${log.intentSummary.dominantSubject}`,
    `  camera=${log.intentSummary.cameraIntent}${log.intentSummary.cutawayType ? ` cutaway=${log.intentSummary.cutawayType}` : ""}`,
    `  hierarchy: fg=${log.hierarchySummary.foregroundEntities.length} mg=${log.hierarchySummary.midgroundEntities.length} bg=${log.hierarchySummary.backgroundEntities.length}`,
    `  relegated=${log.hierarchySummary.relegatedEntities.length} suppressed=${log.hierarchySummary.suppressedClauses.length}`,
    `  ref=${log.decisionsSummary.referencePolicy}${log.decisionsSummary.subjectLockBehavior ? ` lock=${log.decisionsSummary.subjectLockBehavior}` : ""}`,
  ];

  if (log.warnings.length > 0) {
    lines.push(`  warnings: ${log.warnings.join(", ")}`);
  }

  return lines.join("\n");
}

export function logPanelHierarchy(log: PanelHierarchyLog, logFn: (msg: string) => void = console.log): void {
  logFn(formatPanelHierarchyLog(log));
}

// ────────────────────────────────────────────────────────────────────────────
// Chapter-level aggregation
// ────────────────────────────────────────────────────────────────────────────

export interface ChapterHierarchySummary {
  totalPanels: number;
  intentTypeDistribution: Record<string, number>;
  dominantSubjectDistribution: Record<string, number>;
  relegatedPanelsCount: number;
  warningsCount: number;
  warningsByType: Record<string, number>;
}

export function aggregateChapterHierarchyLogs(logs: PanelHierarchyLog[]): ChapterHierarchySummary {
  const intentTypeDist: Record<string, number> = {};
  const dominantSubjectDist: Record<string, number> = {};
  const warningsByType: Record<string, number> = {};
  let relegatedCount = 0;
  let warningsCount = 0;

  for (const log of logs) {
    intentTypeDist[log.intentSummary.intentType] = (intentTypeDist[log.intentSummary.intentType] ?? 0) + 1;
    dominantSubjectDist[log.intentSummary.dominantSubject] =
      (dominantSubjectDist[log.intentSummary.dominantSubject] ?? 0) + 1;

    if (log.hierarchySummary.relegatedEntities.length > 0) {
      relegatedCount++;
    }

    for (const warning of log.warnings) {
      warningsByType[warning] = (warningsByType[warning] ?? 0) + 1;
      warningsCount++;
    }
  }

  return {
    totalPanels: logs.length,
    intentTypeDistribution: intentTypeDist,
    dominantSubjectDistribution: dominantSubjectDist,
    relegatedPanelsCount: relegatedCount,
    warningsCount,
    warningsByType,
  };
}

export function formatChapterHierarchySummary(summary: ChapterHierarchySummary): string {
  const lines: string[] = [
    `[chapter-hierarchy-summary] total=${summary.totalPanels}`,
    `  intents: ${Object.entries(summary.intentTypeDistribution).map(([k, v]) => `${k}=${v}`).join(" ")}`,
    `  subjects: ${Object.entries(summary.dominantSubjectDistribution).map(([k, v]) => `${k}=${v}`).join(" ")}`,
    `  relegated=${summary.relegatedPanelsCount} warnings=${summary.warningsCount}`,
  ];

  if (Object.keys(summary.warningsByType).length > 0) {
    lines.push(`  warning_types: ${Object.entries(summary.warningsByType).map(([k, v]) => `${k}=${v}`).join(" ")}`);
  }

  return lines.join("\n");
}
