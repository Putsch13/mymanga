/**
 * visual-coverage-validator — vérifie qu'un `StoryboardPlan` couvre
 * bien toutes les obligations visuelles extraites d'un `StoryArc`.
 *
 * Directive H12 / H13 du hardening :
 *   - si un beat introduit une créature / silhouette / objet clef /
 *     ennemi et qu'aucun panel dédié ne le couvre : la launch est
 *     refusée (blocker dur, pas un warning).
 *   - un coverage est valide UNIQUEMENT si un panel correspond à la
 *     fois au `renderMode` ET au `subjectFocus` attendus pour
 *     l'entité. Un simple label qui traîne dans `panel.mustShow` ne
 *     suffit PAS (fin des métriques bidon basées sur des labels).
 */

import type {
  RequiredVisualCoverage,
} from "../services/required-visual-coverage";
import type {
  StoryboardPanel,
  StoryboardPlan,
} from "../contracts/storyboard-plan";

export type VisualCoverageGap = {
  coverage: RequiredVisualCoverage;
  reason: string;
};

export interface VisualCoverageValidationResult {
  ok: boolean;
  gaps: VisualCoverageGap[];
  /** Pour debug / UI : chaque coverage avec ses panelIds réellement matchés. */
  fulfilled: RequiredVisualCoverage[];
}

function panelSatisfies(
  coverage: RequiredVisualCoverage,
  panel: StoryboardPanel,
): boolean {
  const modeMatch = coverage.acceptedRenderModes.includes(panel.renderMode);
  const focusMatch = coverage.acceptedSubjectFocuses.includes(panel.subjectFocus);
  if (!modeMatch && !focusMatch) return false;

  // Si le coverage a des tokens indicatifs, le panel doit aussi les
  // mentionner dans mustShow ou actionLine. Cela évite qu'un
  // insert_object générique "couvre" un prop spécifique.
  if (coverage.tokensHint.length > 0) {
    const haystack = [
      ...(panel.mustShow ?? []),
      panel.actionLine ?? "",
      panel.panelPurpose ?? "",
    ]
      .join(" | ")
      .toLowerCase();
    const tokenHit = coverage.tokensHint.some((t) =>
      haystack.includes(t.toLowerCase()),
    );
    if (!tokenHit) return false;
  }
  return true;
}

export function validateVisualCoverage(
  coverage: RequiredVisualCoverage[],
  storyboard: StoryboardPlan,
): VisualCoverageValidationResult {
  const allPanels: StoryboardPanel[] = [];
  for (const page of storyboard.pages ?? []) {
    for (const p of page.panels ?? []) {
      allPanels.push(p);
    }
  }
  const gaps: VisualCoverageGap[] = [];
  const fulfilled: RequiredVisualCoverage[] = [];
  for (const req of coverage) {
    const hits = allPanels
      .filter((panel) => panelSatisfies(req, panel))
      .map((p) => p.panelId);
    const enriched: RequiredVisualCoverage = {
      ...req,
      fulfilledByPanelIds: hits,
    };
    if (hits.length === 0) {
      gaps.push({
        coverage: enriched,
        reason: `no_panel_matches_renderMode∈{${req.acceptedRenderModes.join("|")}}_or_subjectFocus∈{${req.acceptedSubjectFocuses.join("|")}}_for_beat=${req.sourceBeatId}_entity=${req.entity}`,
      });
    } else {
      fulfilled.push(enriched);
    }
  }
  return {
    ok: gaps.length === 0,
    gaps,
    fulfilled,
  };
}

/**
 * Helper strict : jette une exception si des gaps existent. Utilisé
 * directement dans le premium launch path pour bloquer le lancement.
 */
export class VisualCoverageGapsError extends Error {
  readonly gaps: VisualCoverageGap[];
  constructor(gaps: VisualCoverageGap[]) {
    super(
      `visual_coverage_gaps: ${gaps
        .map((g) => `${g.coverage.entityType}:${g.coverage.entity}@${g.coverage.sourceBeatId}`)
        .join(", ")}`,
    );
    this.name = "VisualCoverageGapsError";
    this.gaps = gaps;
  }
}

export function assertVisualCoverage(
  coverage: RequiredVisualCoverage[],
  storyboard: StoryboardPlan,
): VisualCoverageValidationResult {
  const result = validateVisualCoverage(coverage, storyboard);
  if (!result.ok) throw new VisualCoverageGapsError(result.gaps);
  return result;
}
