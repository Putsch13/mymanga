/**
 * production-plan-qa.ts — QA structurelle pré-génération.
 *
 * RÈGLE ABSOLUE: La génération ne doit JAMAIS démarrer avec un plan structurellement mauvais.
 * Si cette QA échoue, le lancement est bloqué.
 */

import { PRODUCTION_RULES } from "./production-rules";
import type {
  CanonicalChapterProductionPlan,
  ProductionQaResult,
  CanonicalPanelPlan,
} from "./canonical-production-plan";

export interface QaCheckResult {
  passed: boolean;
  message: string;
  severity: "error" | "warning";
}

function checkPanelCount(plan: CanonicalChapterProductionPlan): QaCheckResult {
  const count = plan.panels.length;
  if (count < PRODUCTION_RULES.panelCount.minimum) {
    return {
      passed: false,
      message: `Panel count ${count} is below minimum ${PRODUCTION_RULES.panelCount.minimum}`,
      severity: "error",
    };
  }
  if (count > PRODUCTION_RULES.panelCount.maximum) {
    return {
      passed: false,
      message: `Panel count ${count} exceeds maximum ${PRODUCTION_RULES.panelCount.maximum}`,
      severity: "error",
    };
  }
  return { passed: true, message: "Panel count OK", severity: "warning" };
}

function checkCutawayRatio(plan: CanonicalChapterProductionPlan): QaCheckResult {
  const { cutawayRatio } = plan.metrics;
  if (cutawayRatio > PRODUCTION_RULES.cutaway.maxRatio) {
    return {
      passed: false,
      message: `Cutaway ratio ${(cutawayRatio * 100).toFixed(1)}% exceeds max ${(PRODUCTION_RULES.cutaway.maxRatio * 100).toFixed(1)}%`,
      severity: "error",
    };
  }
  return { passed: true, message: "Cutaway ratio OK", severity: "warning" };
}

function checkActorDrivenRatio(plan: CanonicalChapterProductionPlan): QaCheckResult {
  const { actorDrivenRatio } = plan.metrics;
  if (actorDrivenRatio < PRODUCTION_RULES.actorDriven.minRatio) {
    return {
      passed: false,
      message: `Actor-driven ratio ${(actorDrivenRatio * 100).toFixed(1)}% below min ${(PRODUCTION_RULES.actorDriven.minRatio * 100).toFixed(1)}%`,
      severity: "error",
    };
  }
  return { passed: true, message: "Actor-driven ratio OK", severity: "warning" };
}

function checkConsecutiveCutaways(plan: CanonicalChapterProductionPlan): QaCheckResult {
  let maxConsecutive = 0;
  let currentStreak = 0;

  for (const panel of plan.panels) {
    if (panel.isCutaway) {
      currentStreak++;
      maxConsecutive = Math.max(maxConsecutive, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  if (maxConsecutive > PRODUCTION_RULES.cutaway.maxConsecutive) {
    return {
      passed: false,
      message: `Max consecutive cutaways ${maxConsecutive} exceeds limit ${PRODUCTION_RULES.cutaway.maxConsecutive}`,
      severity: "error",
    };
  }
  return { passed: true, message: "Consecutive cutaways OK", severity: "warning" };
}

function checkBeatCoverage(plan: CanonicalChapterProductionPlan): QaCheckResult {
  const beatIds = new Set(plan.beats.map((b) => b.beatId));
  const coveredBeatIds = new Set(plan.panels.map((p) => p.beatId));

  const uncoveredBeats = [...beatIds].filter((id) => !coveredBeatIds.has(id));

  if (uncoveredBeats.length > 0) {
    return {
      passed: false,
      message: `${uncoveredBeats.length} beats have no panels: ${uncoveredBeats.slice(0, 3).join(", ")}${uncoveredBeats.length > 3 ? "..." : ""}`,
      severity: "error",
    };
  }
  return { passed: true, message: "Beat coverage OK", severity: "warning" };
}

function countVerbalTextPanels(plan: CanonicalChapterProductionPlan): number {
  return plan.panels.filter((p) => {
    const mode = p.textPlan.mode;
    return mode === "dialogue" || mode === "thought" || mode === "narration";
  }).length;
}

function checkDialogueCoverage(plan: CanonicalChapterProductionPlan): QaCheckResult {
  const dialogueBeats = plan.beats.filter((b) => b.hasDialogue);
  if (dialogueBeats.length === 0) {
    return { passed: true, message: "No dialogue beats to check", severity: "warning" };
  }

  const verbalPanels = countVerbalTextPanels(plan);
  if (verbalPanels === 0) {
    return {
      passed: false,
      message:
        "Chapter has dialogue beats but no textual panels (dialogue, thought, or narration) — premium requires verbal coverage",
      severity: "error",
    };
  }

  const { dialogueAnchoredCount, dialogueFloatingCount } = plan.metrics;
  const total = dialogueAnchoredCount + dialogueFloatingCount;

  if (total === 0) {
    return {
      passed: true,
      message: "Dialogue beats covered by non-dialogue textual modes (thought/narration)",
      severity: "warning",
    };
  }

  const anchoredRatio = dialogueAnchoredCount / total;
  if (anchoredRatio < PRODUCTION_RULES.dialogue.minAnchoredRatio) {
    return {
      passed: true,
      message: `Dialogue anchored ratio ${(anchoredRatio * 100).toFixed(1)}% below recommended ${(PRODUCTION_RULES.dialogue.minAnchoredRatio * 100).toFixed(1)}%`,
      severity: "warning",
    };
  }

  return { passed: true, message: "Dialogue coverage OK", severity: "warning" };
}

function checkNonCutawayNarrativeAnchor(plan: CanonicalChapterProductionPlan): QaCheckResult {
  const nonCutawayPanels = plan.panels.filter((p) => !p.isCutaway);
  const withoutAnchor = nonCutawayPanels.filter((p) => p.textPlan.mode === "silent");

  const silentRatio = nonCutawayPanels.length > 0 ? withoutAnchor.length / nonCutawayPanels.length : 0;

  if (silentRatio > PRODUCTION_RULES.dialogue.maxSilentActorDrivenRatio) {
    return {
      passed: false,
      message: `${(silentRatio * 100).toFixed(1)}% of non-cutaway panels are silent (max ${(PRODUCTION_RULES.dialogue.maxSilentActorDrivenRatio * 100).toFixed(1)}%)`,
      severity: "error",
    };
  }

  return { passed: true, message: "Non-cutaway narrative anchor OK", severity: "warning" };
}

function checkIntentionalSilenceBudget(plan: CanonicalChapterProductionPlan): QaCheckResult {
  const actorDriven = plan.panels.filter((p) => p.isActorDriven && !p.isCutaway);
  const intentional = plan.panels.filter(
    (p) => p.isActorDriven && !p.isCutaway && p.textPlan.mode === "intentional_silence",
  );
  const ratio = actorDriven.length > 0 ? intentional.length / actorDriven.length : 0;
  if (ratio > PRODUCTION_RULES.dialogue.maxSilentActorDrivenRatio) {
    return {
      passed: false,
      message: `Intentional silence ratio ${(ratio * 100).toFixed(1)}% exceeds max ${(PRODUCTION_RULES.dialogue.maxSilentActorDrivenRatio * 100).toFixed(1)}% on actor-driven panels`,
      severity: "error",
    };
  }
  return { passed: true, message: "Intentional silence budget OK", severity: "warning" };
}

function checkUnresolvedCharacterRefsInBeats(plan: CanonicalChapterProductionPlan): QaCheckResult {
  const lines: string[] = [];
  for (const b of plan.beats) {
    const u = b.unresolvedCharacterRefs ?? [];
    for (const name of u) {
      lines.push(`Unresolved character ref in beat ${b.beatId}: ${name}`);
    }
  }
  if (lines.length === 0) {
    return { passed: true, message: "No unresolved character label refs on beats", severity: "warning" };
  }
  return {
    passed: false,
    message:
      lines.length <= 8
        ? lines.join(" | ")
        : `${lines.slice(0, 8).join(" | ")} | …`,
    severity: "error",
  };
}

function checkDialogueSpeakerAnchors(plan: CanonicalChapterProductionPlan): QaCheckResult {
  const issues: string[] = [];
  for (const p of plan.panels) {
    const mode = p.textPlan.mode;
    if (p.isCutaway && mode === "dialogue") {
      issues.push(`Panel ${p.panelId} carries visible dialogue on a cutaway panel`);
      continue;
    }
    if (mode !== "dialogue") continue;
    const sid = p.textPlan.anchor?.speakerId?.trim();
    if (!sid) {
      issues.push(`Panel ${p.panelId} has dialogue mode but no speakerId anchor`);
      continue;
    }
    const allowed = new Set([
      ...p.requiredCharacterIds,
      ...p.mustShowCharacterIds,
      ...p.mayShowCharacterIds,
    ]);
    if (!allowed.has(sid)) {
      issues.push(`Panel ${p.panelId} has dialogue but speaker ${sid} is not visually present`);
    }
  }
  if (issues.length === 0) {
    return { passed: true, message: "Dialogue speaker anchors OK", severity: "warning" };
  }
  return {
    passed: false,
    message: issues.slice(0, 6).join(" | ") + (issues.length > 6 ? " | …" : ""),
    severity: "error",
  };
}

function checkRequiredCharacterPresence(plan: CanonicalChapterProductionPlan): QaCheckResult {
  const requiredCharacters = new Set<string>();
  for (const beat of plan.beats) {
    for (const charId of beat.involvedCharacters) {
      requiredCharacters.add(charId);
    }
  }

  const presentCharacters = new Set<string>();
  for (const panel of plan.panels) {
    for (const charId of panel.requiredCharacterIds) {
      presentCharacters.add(charId);
    }
    for (const charId of panel.mustShowCharacterIds) {
      presentCharacters.add(charId);
    }
  }

  const missingCharacters = [...requiredCharacters].filter((id) => !presentCharacters.has(id));

  if (missingCharacters.length > 0) {
    return {
      passed: false,
      message: `${missingCharacters.length} characters required by beats are absent from panels: ${missingCharacters.slice(0, 5).join(", ")}`,
      severity: "error",
    };
  }

  return { passed: true, message: "Character presence OK", severity: "warning" };
}

function checkHighPropRatio(plan: CanonicalChapterProductionPlan): QaCheckResult {
  const propPanels = plan.panels.filter((p) => p.role === "prop");
  const ratio = plan.panels.length > 0 ? propPanels.length / plan.panels.length : 0;

  if (ratio > PRODUCTION_RULES.qa.warnOnHighPropRatio) {
    return {
      passed: true,
      message: `Prop panel ratio ${(ratio * 100).toFixed(1)}% is high (threshold ${(PRODUCTION_RULES.qa.warnOnHighPropRatio * 100).toFixed(1)}%)`,
      severity: "warning",
    };
  }

  return { passed: true, message: "Prop ratio OK", severity: "warning" };
}

function checkHighEnvironmentRatio(plan: CanonicalChapterProductionPlan): QaCheckResult {
  const envPanels = plan.panels.filter((p) => p.role === "environment");
  const ratio = plan.panels.length > 0 ? envPanels.length / plan.panels.length : 0;

  if (ratio > PRODUCTION_RULES.qa.warnOnHighEnvironmentRatio) {
    return {
      passed: true,
      message: `Environment panel ratio ${(ratio * 100).toFixed(1)}% is high (threshold ${(PRODUCTION_RULES.qa.warnOnHighEnvironmentRatio * 100).toFixed(1)}%)`,
      severity: "warning",
    };
  }

  return { passed: true, message: "Environment ratio OK", severity: "warning" };
}

export function runProductionPlanQa(plan: CanonicalChapterProductionPlan): ProductionQaResult {
  const checks: QaCheckResult[] = [
    checkPanelCount(plan),
    checkCutawayRatio(plan),
    checkActorDrivenRatio(plan),
    checkConsecutiveCutaways(plan),
    checkBeatCoverage(plan),
    checkDialogueCoverage(plan),
    checkNonCutawayNarrativeAnchor(plan),
    checkIntentionalSilenceBudget(plan),
    checkUnresolvedCharacterRefsInBeats(plan),
    checkDialogueSpeakerAnchors(plan),
    checkRequiredCharacterPresence(plan),
    checkHighPropRatio(plan),
    checkHighEnvironmentRatio(plan),
  ];

  const errors = checks.filter((c) => !c.passed && c.severity === "error").map((c) => c.message);
  const warnings = checks.filter((c) => !c.passed && c.severity === "warning").map((c) => c.message);

  const valid = errors.length === 0;

  return {
    valid,
    warnings,
    errors,
    details: {
      cutawayRatioOk: checks.find((c) => c.message.includes("Cutaway ratio"))?.passed ?? true,
      actorDrivenRatioOk: checks.find((c) => c.message.includes("Actor-driven"))?.passed ?? true,
      consecutiveCutawaysOk: checks.find((c) => c.message.includes("consecutive"))?.passed ?? true,
      beatCoverageOk: checks.find((c) => c.message.includes("Beat coverage"))?.passed ?? true,
      dialogueCoverageOk: checks.find((c) => c.message.includes("Dialogue"))?.passed ?? true,
      panelCountOk: checks.find((c) => c.message.includes("Panel count"))?.passed ?? true,
    },
  };
}

export class ProductionPlanQaError extends Error {
  constructor(
    public readonly qaResult: ProductionQaResult,
  ) {
    super(`Production plan QA failed: ${qaResult.errors.join(" | ")}`);
    this.name = "ProductionPlanQaError";
  }
}

export function runProductionPlanQaOrThrow(plan: CanonicalChapterProductionPlan): ProductionQaResult {
  const result = runProductionPlanQa(plan);
  if (!result.valid) {
    throw new ProductionPlanQaError(result);
  }
  return result;
}

export function assertCanonicalPlanIsUsable(plan: CanonicalChapterProductionPlan): void {
  runProductionPlanQaOrThrow(plan);
}
