/**
 * prompt-action-linter — Phase 1 guard against action inventions.
 *
 * Scans the effective prompt for combat/contact tokens that are forbidden
 * by the panel's `ActionContract`. Returns a list of violations plus a
 * sanitised variant with the forbidden tokens rewritten (best-effort).
 *
 * This runs AFTER the canonical prompt resolver and BEFORE the provider
 * call. It is the last line of defence: even if a prompt gets through the
 * canonical builder with a combat verb, we block it here.
 *
 * Matching is case-insensitive and word-boundary based so that benign
 * substrings ("stabilise", "attacker" as a noun for the *approaching*
 * enemy the beat does describe) do not trigger false positives.
 */

import type {
  ActionContract,
  TruthViolation,
} from "@manga-ai-studio/core";
import { TRUTH_VIOLATION_CODES } from "@manga-ai-studio/core";

export interface LintPromptInput {
  prompt: string;
  actionContract: ActionContract;
}

export interface LintPromptResult {
  ok: boolean;
  /** Tokens from the banlist that were actually found in the prompt. */
  foundForbidden: string[];
  /** Sanitised prompt with forbidden tokens replaced by safer phrasing. */
  sanitisedPrompt: string;
  /** Structured violations suitable for PipelineTruthReport. */
  violations: TruthViolation[];
}

/**
 * Safe replacements used by the sanitiser. Not authoritative output — a
 * caller that cares about prompt quality should regenerate the canonical
 * packet rather than rely on these.
 */
const SOFTENINGS: Record<string, string> = {
  strike: "tense face-off",
  strikes: "tense face-off",
  striking: "tense face-off",
  punch: "clenched fist",
  punches: "clenched fists",
  punching: "bracing motion",
  kick: "firm stance",
  kicks: "firm stance",
  kicking: "firm stance",
  slash: "guarded motion",
  slashes: "guarded motion",
  slashing: "guarded motion",
  stab: "held blade",
  stabs: "held blade",
  stabbing: "held blade",
  clash: "tense proximity",
  clashes: "tense proximity",
  clashing: "tense proximity",
  "fight stance": "guarded posture",
  "combat stance": "guarded posture",
  "fighting stance": "guarded posture",
  "guard stance": "guarded posture",
  "impact burst": "dramatic lighting",
  riposte: "steadying reply",
  attack: "tense approach",
  attacks: "tense approach",
  attacking: "tense approach",
  charge: "decisive step forward",
  charges: "decisive step forward",
  charging: "decisive step forward",
  parry: "steadying motion",
  lunge: "leaning forward",
  lunges: "leaning forward",
  lunging: "leaning forward",
  "sword swing": "held sword",
  "blade swing": "held blade",
  "weapon clash": "tense standoff",
  "duel framing": "face-to-face framing",
};

function buildBoundaryRegex(token: string): RegExp {
  // Escape regex-significant characters in the banlist token.
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Word-boundary for single words; for multi-word tokens we just use
  // the escaped literal (spaces already enforce boundary semantics).
  if (/\s/.test(token)) {
    return new RegExp(escaped, "gi");
  }
  return new RegExp(`\\b${escaped}\\b`, "gi");
}

export function lintPromptAgainstActionContract(
  input: LintPromptInput,
): LintPromptResult {
  const { prompt, actionContract } = input;

  const foundForbidden: string[] = [];
  let sanitised = prompt;

  for (const forbidden of actionContract.forbiddenVerbs) {
    const re = buildBoundaryRegex(forbidden);
    if (re.test(prompt)) {
      foundForbidden.push(forbidden);
      const replacement = SOFTENINGS[forbidden.toLowerCase()] ?? "tense moment";
      sanitised = sanitised.replace(buildBoundaryRegex(forbidden), replacement);
    }
  }

  const violations: TruthViolation[] = foundForbidden.map((token) => ({
    code: TRUTH_VIOLATION_CODES.forbidden_action_verb_in_prompt,
    severity: "error",
    pass: "prompt-action-linter",
    detail: `Forbidden action token "${token}" in prompt for action level "${actionContract.level}".`,
    context: {
      actionLevel: actionContract.level,
      token,
    },
  }));

  return {
    ok: foundForbidden.length === 0,
    foundForbidden,
    sanitisedPrompt: sanitised,
    violations,
  };
}
