import type {
  CanonicalChapterProductionPlan,
  ProductionQaResult,
} from "../canonical-production-plan";
import { runProductionPlanQa } from "../production-plan-qa";

import { assignPanelTextAnchors } from "./text-anchors";

export function qaCanonicalProductionPlan(
  plan: CanonicalChapterProductionPlan,
): ProductionQaResult {
  return runProductionPlanQa(plan);
}

export function autoRepairCanonicalPlan(plan: CanonicalChapterProductionPlan): {
  plan: CanonicalChapterProductionPlan;
  messages: string[];
} {
  const next = assignPanelTextAnchors(plan);
  const changed = JSON.stringify(next.panels) !== JSON.stringify(plan.panels);
  return { plan: next, messages: changed ? ["assignPanelTextAnchors"] : [] };
}

export function qaCanonicalProductionPlanWithAutoRepair(
  plan: CanonicalChapterProductionPlan,
): {
  plan: CanonicalChapterProductionPlan;
  qa: ProductionQaResult;
  repairLog: string[];
} {
  let current = plan;
  let qa = runProductionPlanQa(current);
  const repairLog: string[] = [];

  if (!qa.valid) {
    const { plan: repaired, messages } = autoRepairCanonicalPlan(current);
    if (messages.length > 0) {
      repairLog.push(...messages);
      current = repaired;
      qa = runProductionPlanQa(current);
    }
    if (qa.valid) {
      console.warn("[canonical-plan] qa_repaired", repairLog.join(", ") || "noop");
    } else {
      console.error("[canonical-plan] qa_failed", qa.errors.join(" | "));
    }
  } else {
    console.info("[canonical-plan] qa_ok");
  }

  return { plan: current, qa, repairLog };
}
