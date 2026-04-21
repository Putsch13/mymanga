/**
 * narrative-truth-pass — Phase 1 enforcement pass.
 *
 * Given a panel's narrative contract, action contract and the *effective*
 * prompt that will actually be sent to the provider, this pass verifies
 * that the image about to be generated is consistent with the beat that
 * was approved.
 *
 * The pass is deliberately conservative:
 *   - it never rewrites the beat,
 *   - it never invents events,
 *   - it only flags divergences and (optionally) blocks the panel.
 *
 * Return shape is designed to feed both:
 *   - the pipeline control flow (should we stop generating this panel?),
 *   - the PipelineTruthReport (for the review UI and KPIs).
 */

import type {
  ActionContract,
  BeatNarrativeContract,
  PanelContract,
  TruthViolation,
} from "@manga-ai-studio/core";
import { TRUTH_VIOLATION_CODES } from "@manga-ai-studio/core";
import {
  lintPromptAgainstActionContract,
  type LintPromptResult,
} from "../prompt-action-linter";

export interface NarrativeTruthInput {
  beatContract: BeatNarrativeContract;
  actionContract: ActionContract;
  panelContract: Pick<PanelContract, "purpose" | "panelId">;
  effectivePrompt: string;
  /** Optional caption / narration text included in the visual beat. */
  captionText?: string | null;
}

export interface NarrativeTruthResult {
  valid: boolean;
  /** True if at least one violation has severity=error. */
  blocking: boolean;
  violations: TruthViolation[];
  /** Rewrite of the prompt with forbidden action verbs softened. */
  sanitisedPrompt: string;
  /** Raw linter output, useful for UI debugging. */
  actionLint: LintPromptResult;
}

/**
 * Panels that can legitimately be `action` given the beat envelope.
 */
const ACTION_ALLOWED_FOR_ENVELOPE: Record<
  ActionContract["level"],
  boolean
> = {
  none: false,
  micro: false,
  physical_nonviolent: false,
  combat_light: true,
  combat_full: true,
};

export function runNarrativeTruthPass(
  input: NarrativeTruthInput,
): NarrativeTruthResult {
  const violations: TruthViolation[] = [];

  // ── 1. Panel purpose vs. action envelope ─────────────────────────────
  // The most common failure we saw in captures: a dialogue_tension beat
  // with actionEnvelope=none produced a panel with purpose=action. The
  // purpose must be consistent with what the beat allows.
  if (
    input.panelContract.purpose === "action" &&
    !ACTION_ALLOWED_FOR_ENVELOPE[input.actionContract.level]
  ) {
    violations.push({
      code: TRUTH_VIOLATION_CODES.action_envelope_exceeded,
      severity: "error",
      pass: "narrative-truth-pass",
      detail: `Panel purpose="action" but beat envelope="${input.actionContract.level}" forbids combat.`,
      context: {
        panelId: input.panelContract.panelId,
        beatId: input.beatContract.beatId,
        envelope: input.actionContract.level,
      },
    });
  }

  // ── 2. Action linter on the effective prompt ─────────────────────────
  const actionLint = lintPromptAgainstActionContract({
    prompt: input.effectivePrompt,
    actionContract: input.actionContract,
  });
  for (const v of actionLint.violations) {
    violations.push({
      ...v,
      context: {
        ...(v.context ?? {}),
        beatId: input.beatContract.beatId,
        panelId: input.panelContract.panelId,
      },
    });
  }

  // ── 3. Forbidden visual events explicitly listed on the beat ─────────
  if (input.beatContract.forbiddenVisualEvents.length > 0) {
    const haystack = `${input.effectivePrompt} ${input.captionText ?? ""}`.toLowerCase();
    for (const forbidden of input.beatContract.forbiddenVisualEvents) {
      const needle = forbidden.toLowerCase().trim();
      if (needle.length > 0 && haystack.includes(needle)) {
        violations.push({
          code: TRUTH_VIOLATION_CODES.narrative_beat_invented,
          severity: "error",
          pass: "narrative-truth-pass",
          detail: `Panel mentions forbidden beat event "${forbidden}".`,
          context: {
            beatId: input.beatContract.beatId,
            panelId: input.panelContract.panelId,
            forbiddenEvent: forbidden,
          },
        });
      }
    }
  }

  // ── 4. Escalation policy ─────────────────────────────────────────────
  // `forbid_invented_action` + purpose=action with no combat envelope is
  // the classic invented-fight scenario. Already covered by #1, but we
  // also record the specific policy that was violated so the audit log
  // tells the reviewer *why*.
  if (
    input.beatContract.visualEscalationPolicy === "forbid_invented_action" &&
    input.panelContract.purpose === "action" &&
    !ACTION_ALLOWED_FOR_ENVELOPE[input.actionContract.level]
  ) {
    violations.push({
      code: TRUTH_VIOLATION_CODES.action_policy_violation,
      severity: "error",
      pass: "narrative-truth-pass",
      detail: "Visual escalation policy forbids invented action on this beat.",
      context: {
        beatId: input.beatContract.beatId,
        panelId: input.panelContract.panelId,
        policy: input.beatContract.visualEscalationPolicy,
      },
    });
  }

  const blocking = violations.some((v) => v.severity === "error");

  return {
    valid: violations.length === 0,
    blocking,
    violations,
    sanitisedPrompt: actionLint.sanitisedPrompt,
    actionLint,
  };
}
