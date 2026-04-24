/**
 * production-rules.ts — Configuration métier centrale et unique.
 *
 * RÈGLE ABSOLUE: Aucune valeur magique ne doit exister ailleurs dans le codebase.
 * Tous les modules doivent importer cette config. Pas de copie en dur.
 *
 * Ce fichier est la SOURCE DE VÉRITÉ UNIQUE pour:
 * - Nombre de panels (min/target/max)
 * - Ratios cutaway / actor-driven
 * - Contraintes de rythme
 * - Paramètres de retry image
 * - Seuils de QA
 */

const VISUAL_QA = {
  enabledInProduction: true,
  passScore: 0.75,
  excellentScore: 0.88,
  maxAttemptsPerPanel: 4,
} as const;

const RENDER_POLICY = {
  allowMockInProduction: false,
  allowMockInTest: true,
  allowMockInDevelopment: true,
} as const;

export const PRODUCTION_RULES = {
  panelCount: {
    minimum: 70,
    target: 72,
    maximum: 75,
  },

  cutaway: {
    maxRatio: 0.30,
    maxConsecutive: 2,
    idealRatio: 0.25,
  },

  actorDriven: {
    minRatio: 0.70,
    idealRatio: 0.75,
  },

  dialogue: {
    requireNarrativeAnchorOnActorDrivenPanels: true,
    minAnchoredRatio: 0.60,
    maxFloatingRatio: 0.40,
    /** Ratio max de panels actor-driven volontairement sans bulle/narration/SFX (hors cutaway). */
    maxSilentActorDrivenRatio: 0.20,
    maxSilentNonCutawayRatio: 0.20,
  },

  rhythm: {
    actorDrivenMinRatio: 0.70,
    cutawayMaxRatio: 0.30,
    maxConsecutiveCutaways: 2,
    preferredNarrativePattern: [2, 3, 2, 3] as readonly number[],
    defaultPattern: [2, 3, 2, 3] as readonly number[],
    cutawayInsertionPolicy: "distributed" as const,
  },

  visualQa: VISUAL_QA,

  render: RENDER_POLICY,

  retry: {
    maxImageAttempts: VISUAL_QA.maxAttemptsPerPanel,
    visualQaPassScore: VISUAL_QA.passScore,
    retryStrategies: [
      "same_prompt",
      "refined_prompt",
      "stronger_character_lock",
      "composition_fix",
      "text_space_fix",
      "style_lock",
      "simplify_scene",
    ] as const,
  },

  qa: {
    blockOnCutawayOverflow: true,
    blockOnActorDrivenUnderflow: true,
    blockOnMissingBeatCoverage: true,
    blockOnDialogueDeficit: false,
    warnOnHighPropRatio: 0.15,
    warnOnHighEnvironmentRatio: 0.20,
    warnOnLowDuoRatio: 0.10,
  },

  format: {
    manga: {
      pagesTarget: 12,
      panelsPerPageRange: [4, 7] as const,
      readingDirection: "rtl" as const,
    },
    webtoon: {
      pagesTarget: 1,
      panelsPerPageRange: [70, 75] as const,
      readingDirection: "vertical" as const,
    },
  },
} as const;

export type ProductionRules = typeof PRODUCTION_RULES;
export type ChapterFormat = "manga" | "webtoon";
export type RetryStrategy = (typeof PRODUCTION_RULES.retry.retryStrategies)[number];
export type CutawayInsertionPolicy = "distributed" | "clustered" | "end_weighted";

export function getFormatRules(format: ChapterFormat) {
  return PRODUCTION_RULES.format[format];
}

export function isValidPanelCount(count: number): boolean {
  return (
    Number.isFinite(count) &&
    count >= PRODUCTION_RULES.panelCount.minimum &&
    count <= PRODUCTION_RULES.panelCount.maximum
  );
}

export function classifyPanelCount(
  count: number,
): "ok" | "under_min" | "over_max" {
  if (!Number.isFinite(count) || count < PRODUCTION_RULES.panelCount.minimum) {
    return "under_min";
  }
  if (count > PRODUCTION_RULES.panelCount.maximum) {
    return "over_max";
  }
  return "ok";
}

export function isValidCutawayRatio(ratio: number): boolean {
  return ratio <= PRODUCTION_RULES.cutaway.maxRatio;
}

export function isValidActorDrivenRatio(ratio: number): boolean {
  return ratio >= PRODUCTION_RULES.actorDriven.minRatio;
}

/**
 * Autorise les images mock (FAL sans clé) : test / dev par défaut,
 * production uniquement si `ENABLE_IMAGE_MOCKS=true`.
 */
export function isPremiumImageMockAllowed(): boolean {
  if (process.env.ENABLE_IMAGE_MOCKS === "true") return true;
  if (process.env.ENABLE_IMAGE_MOCKS === "false") return false;
  const env = process.env.NODE_ENV ?? "development";
  if (env === "test") return PRODUCTION_RULES.render.allowMockInTest;
  if (env === "production") return PRODUCTION_RULES.render.allowMockInProduction;
  return PRODUCTION_RULES.render.allowMockInDevelopment;
}
