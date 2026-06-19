import type { StoryboardPlan } from "@manga-ai-studio/ai/contracts";

import { logPipelineInfo, logPipelineWarn, logPipelineError } from "../lib/pipeline-logger";
function structuralFingerprint(plan: StoryboardPlan): string {
  const rows: string[] = [];
  for (const page of plan.pages ?? []) {
    for (const p of page.panels ?? []) {
      rows.push(
        [
          p.panelId,
          p.sourceBeatId,
          p.panelPurpose,
          p.renderMode,
          p.subjectFocus,
          p.cutawayType,
          (p.characters ?? []).join("|"),
        ].join("::"),
      );
    }
  }
  return rows.join("\n");
}

/**
 * En mode plan approuvé, le LLM ne doit pas modifier la structure (IDs, rôles,
 * ordre, cutaway, casting minimal). Toute divergence lève une erreur.
 */
export function assertLlmDidNotChangeStructuralFields(before: StoryboardPlan, after: StoryboardPlan): void {
  const a = structuralFingerprint(before);
  const b = structuralFingerprint(after);
  if (a !== b) {
    logPipelineWarn("approved.plan.llm_structural_mutation_rejected", {});
    throw new Error(
      "approved_plan_structural_mutation: la sortie LLM diverge du storyboard déterministe (structure non autorisée).",
    );
  }
}
