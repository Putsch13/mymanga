/**
 * Intent Coverage QA — verifies that downstream artefacts
 * (outline beats, VisualWorld, PanelText, Dialogue) actually cover
 * every constraint declared in the IntentNarrativeContract.
 */

import type { IntentNarrativeContract } from "../intent/intent-narrative-contract";

export type IntentCoverageInput = {
  intentContract: IntentNarrativeContract;
  /** Beat summaries (from outline) — used to check requiredEvents coverage. */
  beatSummaries: string[];
  /** Location ids present in the VisualWorldContract. */
  visualWorldLocationNames?: string[];
  /** NPC group labels present in the VisualWorldContract. */
  visualWorldNpcGroupLabels?: string[];
  /** Speaker ids that have at least one dialogue line. */
  dialogueSpeakerIds?: string[];
  /** Premium: treat missing coverage as blocking. */
  strict?: boolean;
};

export type IntentCoverageIssue = {
  code:
    | "REQUIRED_EVENT_MISSING"
    | "REQUIRED_NPC_GROUP_MISSING"
    | "REQUIRED_DIALOGUE_MISSING"
    | "REQUIRED_LOCATION_MISSING"
    | "FORBIDDEN_TERM_DETECTED";
  severity: "warning" | "error";
  detail: string;
};

export type IntentCoverageResult = {
  ok: boolean;
  intentCoverageScore: number;
  requiredEventsCovered: number;
  requiredEventsTotal: number;
  missingEvents: string[];
  issues: IntentCoverageIssue[];
};

const DEFAULT_FORBIDDEN_FALLBACK_TERMS = [
  "lieu principal non spécifié",
  "adversaire",
  "alliances sous pression",
  "confrontation directe",
  "conséquence brutale",
  "un personnage secondaire intervient",
];

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function runIntentCoverageQa(input: IntentCoverageInput): IntentCoverageResult {
  const { intentContract, beatSummaries, strict = false } = input;
  const issues: IntentCoverageIssue[] = [];
  const severity = strict ? "error" as const : "warning" as const;

  const allBeatsText = beatSummaries.map(normalize).join(" ");

  // Check requiredEvents coverage
  const missingEvents: string[] = [];
  let covered = 0;
  for (const evt of intentContract.requiredEvents) {
    const evtLabel = normalize(evt.label);
    const words = evtLabel.split(/\s+/).filter((w) => w.length > 3);
    const matchRatio = words.length === 0
      ? 0
      : words.filter((w) => allBeatsText.includes(w)).length / words.length;

    if (matchRatio >= 0.4) {
      covered++;
    } else {
      missingEvents.push(evt.id);
      issues.push({
        code: "REQUIRED_EVENT_MISSING",
        severity,
        detail: `event=${evt.id} label="${evt.label.slice(0, 60)}"`,
      });
    }
  }

  // Check requiredLocations in VisualWorld
  const vwLocNames = (input.visualWorldLocationNames ?? []).map(normalize);
  for (const loc of intentContract.requiredLocations) {
    if (!vwLocNames.some((n) => n.includes(normalize(loc)))) {
      issues.push({
        code: "REQUIRED_LOCATION_MISSING",
        severity,
        detail: `location="${loc}"`,
      });
    }
  }

  // Check requiredNpcGroups in VisualWorld
  const vwNpcLabels = (input.visualWorldNpcGroupLabels ?? []).map(normalize);
  for (const npc of intentContract.requiredNpcGroups) {
    if (!vwNpcLabels.some((l) => l.includes(normalize(npc.label)))) {
      issues.push({
        code: "REQUIRED_NPC_GROUP_MISSING",
        severity,
        detail: `npcGroup="${npc.label}"`,
      });
    }
    if (npc.requiredDialogue) {
      const speakerIds = input.dialogueSpeakerIds ?? [];
      if (!speakerIds.includes(npc.id)) {
        issues.push({
          code: "REQUIRED_DIALOGUE_MISSING",
          severity,
          detail: `npcGroup="${npc.label}" requiredDialogue=true`,
        });
      }
    }
  }

  // Check forbidden terms in beat summaries
  const forbidden = intentContract.forbiddenInventions.length > 0
    ? intentContract.forbiddenInventions
    : DEFAULT_FORBIDDEN_FALLBACK_TERMS;
  for (const term of forbidden) {
    if (allBeatsText.includes(normalize(term))) {
      issues.push({
        code: "FORBIDDEN_TERM_DETECTED",
        severity,
        detail: `term="${term}"`,
      });
    }
  }

  const total = intentContract.requiredEvents.length;
  const score = total === 0 ? 100 : Math.round((covered / total) * 100);
  const hasErrors = issues.some((i) => i.severity === "error");

  return {
    ok: !hasErrors,
    intentCoverageScore: score,
    requiredEventsCovered: covered,
    requiredEventsTotal: total,
    missingEvents,
    issues,
  };
}
