/**
 * PageLayoutIntent — Phase 4 source of LAYOUT truth.
 *
 * The existing layout picker (`pickLayoutForPage`) chooses a template
 * from just the panel count + a boolean `hasMajor` importance flag. That
 * loses too much context: a 4-panel page of dialogue-heavy panels and a
 * 4-panel page of silent action both end up on `grid_2x2`, even though
 * the former needs wider panels for speech bubbles and the latter wants
 * `asymmetric_hero` to emphasise the impact.
 *
 * `PageLayoutIntent` captures the content shape of the page: shot types,
 * dialogue density, focus character, and narrative function. The content-
 * aware scorer then ranks candidate templates using five axes:
 *
 *   1. narrativeFitScore     — template emphasis matches the beat shape
 *   2. textFitScore          — enough panel area for the dialogue budget
 *   3. focusPreservationScore — the hero/major panel gets the biggest slot
 *   4. readingFlowScore      — left-to-right / top-to-bottom continuity
 *   5. whitespaceBalanceScore — no tiny-dominant layouts when page is calm
 *
 * The scorer is intentionally pure + deterministic so it can run both on
 * the server (narrative pass) and on the client (paginator).
 */

import {
  PAGE_LAYOUT_CONFIGS,
  type PageLayoutTemplate,
} from "./page-layout-configs";

/**
 * Shot type for a single panel, aligned with `PanelShotPlan.shotType`. We
 * redeclare it here to avoid a cross-file dep cycle with `shot-plan.ts`.
 */
export type LayoutIntentShotType =
  | "extreme_closeup"
  | "closeup"
  | "medium"
  | "over_shoulder"
  | "wide"
  | "establishing";

export type LayoutIntentNarrativeShape =
  | "establishing"
  | "dialogue_steady"
  | "dialogue_escalating"
  | "action_burst"
  | "revelation_peak"
  | "aftermath_quiet"
  | "transition_mood"
  | "investigation_procedural";

export type LayoutPanelImportance = "splash" | "major" | "normal" | "insert";

export interface PageLayoutPanelIntent {
  panelIndex: number;
  shotType: LayoutIntentShotType;
  importance: LayoutPanelImportance;
  /** Rough number of dialogue lines in the panel. 0 means silent. */
  dialogueLines: number;
  /** True if the panel centers the hero/major focus character. */
  isFocusPanel: boolean;
  /** True if the panel is a wide/establishing environment shot. */
  isEnvironmentPanel: boolean;
}

export interface PageLayoutIntent {
  intentVersion: "1.0.0";
  pageNumber: number;
  panelCount: number;
  panels: PageLayoutPanelIntent[];
  narrativeShape: LayoutIntentNarrativeShape;
  /** True when the page is climactic — opens up the splash/double_spread candidates. */
  isClimaxPage: boolean;
  /** Allow 5-panel native layouts. Off by default for back-compat. */
  allowFivePanelLayouts?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────────────────────────────────────

export interface LayoutScoreBreakdown {
  narrativeFitScore: number;
  textFitScore: number;
  focusPreservationScore: number;
  readingFlowScore: number;
  whitespaceBalanceScore: number;
  /** Weighted sum in [0, 1]. */
  totalScore: number;
}

export interface LayoutCandidateScore extends LayoutScoreBreakdown {
  template: PageLayoutTemplate;
}

const SCORE_WEIGHTS = {
  narrativeFitScore: 0.3,
  textFitScore: 0.2,
  focusPreservationScore: 0.2,
  readingFlowScore: 0.15,
  whitespaceBalanceScore: 0.15,
} as const;

/** Templates that only fit specific panel counts. */
const TEMPLATE_SLOT_COUNT: Record<PageLayoutTemplate, number> = {
  splash: 1,
  double_spread: 2,
  asymmetric_hero: 3,
  cinematic_bar: 3,
  focus_closeup: 3,
  vertical_strip: 3,
  grid_2x2: 4,
  grid_2x3: 6,
  action_strip: 6,
  montage_rapid: 8,
  grid_1_2_2: 5,
  hero_top_2_2: 5,
  "2_1_2_dialogue": 5,
  staggered_5: 5,
  vertical_hero_4: 5,
};

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Narrative shape → affinity per template. Values are in [0, 1]; missing
 * entries default to 0.5 (neutral).
 */
const NARRATIVE_AFFINITY: Record<
  LayoutIntentNarrativeShape,
  Partial<Record<PageLayoutTemplate, number>>
> = {
  establishing: {
    splash: 1,
    cinematic_bar: 0.85,
    asymmetric_hero: 0.7,
    hero_top_2_2: 0.75,
    grid_1_2_2: 0.6,
  },
  dialogue_steady: {
    grid_2x2: 1,
    grid_2x3: 0.75,
    "2_1_2_dialogue": 0.95,
    focus_closeup: 0.6,
  },
  dialogue_escalating: {
    asymmetric_hero: 0.9,
    focus_closeup: 0.9,
    "2_1_2_dialogue": 0.8,
    grid_1_2_2: 0.7,
  },
  action_burst: {
    action_strip: 1,
    double_spread: 0.95,
    asymmetric_hero: 0.9,
    vertical_hero_4: 0.85,
    splash: 0.8,
  },
  revelation_peak: {
    splash: 1,
    double_spread: 0.9,
    hero_top_2_2: 0.8,
  },
  aftermath_quiet: {
    grid_2x2: 0.85,
    cinematic_bar: 0.8,
    vertical_strip: 0.7,
    "2_1_2_dialogue": 0.7,
  },
  transition_mood: {
    vertical_strip: 0.9,
    cinematic_bar: 0.85,
    montage_rapid: 0.7,
    staggered_5: 0.7,
  },
  investigation_procedural: {
    grid_2x3: 1,
    montage_rapid: 0.85,
    staggered_5: 0.75,
    grid_2x2: 0.7,
  },
};

function narrativeFit(
  template: PageLayoutTemplate,
  shape: LayoutIntentNarrativeShape,
): number {
  return NARRATIVE_AFFINITY[shape][template] ?? 0.5;
}

/**
 * Heuristic: more dialogue needs more panel area. We approximate by
 * comparing total dialogue budget vs. the average panel weight.
 */
function textFit(
  template: PageLayoutTemplate,
  intent: PageLayoutIntent,
): number {
  const config = PAGE_LAYOUT_CONFIGS[template];
  const totalLines = intent.panels.reduce(
    (sum, p) => sum + Math.max(0, p.dialogueLines),
    0,
  );
  if (totalLines === 0) {
    // Silent page — reward compact/dynamic templates, penalise text-heavy.
    if (template === "grid_2x2" || template === "grid_2x3") return 0.55;
    if (template === "action_strip" || template === "double_spread") return 0.9;
    return 0.75;
  }
  // Lines per weighted panel area — if dialogue density is high we need
  // panels that are at least medium-sized (weight >= 0.15).
  const avgWeight =
    config.panelWeights.reduce((a, b) => a + b, 0) / config.panelWeights.length;
  const density = totalLines / Math.max(1, intent.panelCount);
  // density low (<=1) → any layout works; density high (>=3) → need big avg weight.
  const needed = Math.min(0.3, 0.1 + 0.1 * density);
  const margin = avgWeight - needed;
  return clamp01(0.6 + margin * 2);
}

/**
 * Reward layouts that give the biggest slot to the focus/major panel.
 */
function focusPreservation(
  template: PageLayoutTemplate,
  intent: PageLayoutIntent,
): number {
  const config = PAGE_LAYOUT_CONFIGS[template];
  const majorIdx = intent.panels.findIndex(
    (p) => p.importance === "splash" || p.importance === "major" || p.isFocusPanel,
  );
  if (majorIdx === -1) {
    // No hero panel — reward balanced layouts.
    const weights = config.panelWeights;
    const avg = weights.reduce((a, b) => a + b, 0) / weights.length;
    const variance =
      weights.reduce((s, w) => s + (w - avg) ** 2, 0) / weights.length;
    return clamp01(1 - variance * 10);
  }
  // Major panel should land on the biggest weight slot.
  const weights = config.panelWeights;
  const maxWeight = Math.max(...weights);
  const majorWeight = weights[majorIdx] ?? 0;
  return clamp01(majorWeight / maxWeight);
}

/**
 * Reading flow — mostly structural: templates with a clear
 * left-to-right-top-to-bottom cssGridAreas score high, repeat-letter
 * (merged) areas still count as linear when they appear in order.
 */
function readingFlow(template: PageLayoutTemplate): number {
  const config = PAGE_LAYOUT_CONFIGS[template];
  const letters = config.cssGridAreas
    .replace(/["]/g, "")
    .split(/\s+/)
    .filter((s) => s.length > 0);
  // Dedupe successive repeats (merged cells).
  const seen = new Set<string>();
  const order: string[] = [];
  for (const l of letters) {
    if (!seen.has(l)) {
      seen.add(l);
      order.push(l);
    }
  }
  // Ideal order matches the template's `areas` (which is canonical reading order).
  let matches = 0;
  for (let i = 0; i < order.length && i < config.areas.length; i++) {
    if (order[i] === config.areas[i]) matches += 1;
  }
  return clamp01(matches / Math.max(1, config.areas.length));
}

/**
 * Whitespace balance — penalise layouts whose tiniest slot is extreme
 * relative to the biggest when the page is calm (few panels, no action).
 */
function whitespaceBalance(
  template: PageLayoutTemplate,
  intent: PageLayoutIntent,
): number {
  const config = PAGE_LAYOUT_CONFIGS[template];
  const weights = config.panelWeights;
  const max = Math.max(...weights);
  const min = Math.min(...weights);
  const ratio = min / Math.max(max, 0.0001);
  // Calm narratives want balanced layouts (ratio → 1).
  // Action / revelation pages happily accept imbalance.
  const tolerateImbalance =
    intent.isClimaxPage ||
    intent.narrativeShape === "action_burst" ||
    intent.narrativeShape === "revelation_peak";
  if (tolerateImbalance) {
    // Imbalance is a feature, not a bug — but extreme montage_rapid (too many tiny slots) still bad.
    return clamp01(0.6 + ratio * 0.4);
  }
  return clamp01(0.3 + ratio * 0.7);
}

export function scoreLayoutForIntent(
  template: PageLayoutTemplate,
  intent: PageLayoutIntent,
): LayoutScoreBreakdown {
  const narrativeFitScore = clamp01(narrativeFit(template, intent.narrativeShape));
  const textFitScore = clamp01(textFit(template, intent));
  const focusPreservationScore = clamp01(focusPreservation(template, intent));
  const readingFlowScore = clamp01(readingFlow(template));
  const whitespaceBalanceScore = clamp01(whitespaceBalance(template, intent));
  const totalScore = clamp01(
    narrativeFitScore * SCORE_WEIGHTS.narrativeFitScore +
      textFitScore * SCORE_WEIGHTS.textFitScore +
      focusPreservationScore * SCORE_WEIGHTS.focusPreservationScore +
      readingFlowScore * SCORE_WEIGHTS.readingFlowScore +
      whitespaceBalanceScore * SCORE_WEIGHTS.whitespaceBalanceScore,
  );
  return {
    narrativeFitScore,
    textFitScore,
    focusPreservationScore,
    readingFlowScore,
    whitespaceBalanceScore,
    totalScore,
  };
}

/**
 * Returns the ordered list of candidate templates for the given intent,
 * scored and filtered by exact slot count match. Callers pick the
 * top-scoring one (or let a UI expose the runners-up for debugging).
 */
export function rankLayoutCandidatesForIntent(
  intent: PageLayoutIntent,
): LayoutCandidateScore[] {
  const candidates: LayoutCandidateScore[] = [];
  for (const template of Object.keys(PAGE_LAYOUT_CONFIGS) as PageLayoutTemplate[]) {
    const slotCount = TEMPLATE_SLOT_COUNT[template];
    if (slotCount !== intent.panelCount) continue;
    if (slotCount === 5 && !intent.allowFivePanelLayouts) continue;
    const breakdown = scoreLayoutForIntent(template, intent);
    candidates.push({ template, ...breakdown });
  }
  candidates.sort((a, b) => b.totalScore - a.totalScore);
  return candidates;
}

export function pickBestLayoutForIntent(
  intent: PageLayoutIntent,
): LayoutCandidateScore | null {
  const ranked = rankLayoutCandidatesForIntent(intent);
  return ranked[0] ?? null;
}

export const __pageLayoutIntentTesting = {
  SCORE_WEIGHTS,
  TEMPLATE_SLOT_COUNT,
};
