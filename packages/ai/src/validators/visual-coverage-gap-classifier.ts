import type { RequiredVisualCoverage } from "../services/required-visual-coverage";
import type { VisualCoverageGap } from "./visual-coverage-validator";

export type VisualCoverageGapSeverity = "fatal" | "repairable" | "soft" | "rejected";

export interface ClassifiedVisualCoverageGaps {
  fatalGaps: VisualCoverageGap[];
  repairableGaps: VisualCoverageGap[];
  softGaps: VisualCoverageGap[];
  rejectedGaps: VisualCoverageGap[];
}

/**
 * Classe les écarts de couverture visuelle : seuls les gaps « fatal » doivent
 * bloquer la génération premium. Props / lieux / surveillance → réparables ou soft.
 */
export function classifyVisualCoverageGaps(gaps: VisualCoverageGap[]): ClassifiedVisualCoverageGaps {
  const fatalGaps: VisualCoverageGap[] = [];
  const repairableGaps: VisualCoverageGap[] = [];
  const softGaps: VisualCoverageGap[] = [];
  const rejectedGaps: VisualCoverageGap[] = [];

  for (const g of gaps) {
    const c = g.coverage;
    if (isRejectedGap(c)) {
      rejectedGaps.push(g);
      continue;
    }
    const sev = classifySingleGap(c);
    if (sev === "fatal") fatalGaps.push(g);
    else if (sev === "repairable") repairableGaps.push(g);
    else softGaps.push(g);
  }

  return { fatalGaps, repairableGaps, softGaps, rejectedGaps };
}

function isRejectedGap(c: RequiredVisualCoverage): boolean {
  return Boolean((c as { rejected?: boolean }).rejected);
}

function classifySingleGap(c: RequiredVisualCoverage): VisualCoverageGapSeverity {
  const t = c.entityType;
  const dedicated = c.requiresDedicatedPanel;

  if (t === "enemy" && dedicated) return "fatal";
  if (t === "creature" && dedicated) return "fatal";

  if (t === "character") {
    if (dedicated) return "fatal";
    return "soft";
  }

  if (t === "prop" || t === "location" || t === "surveillance" || t === "threat_silhouette") {
    return "repairable";
  }

  return "soft";
}
