/**
 * PipelineTruthReport — Phase 0 observability contract.
 *
 * Persisted per SceneImage (via `SceneImage.metadata.debugTrace.pipelineTruth`)
 * to make the pipeline observable after the fact:
 *   - where did the prompt come from?
 *   - which style contract was enforced?
 *   - was a legacy fallback used?
 *   - which truth invariant was violated, if any?
 *
 * The five invariants tracked here mirror the product-level invariants:
 *   narrative truth, style truth, action truth, character truth, layout truth.
 *
 * The report is append-only per pipeline run; it is never mutated after the
 * image has been persisted.
 */

export type NarrativeSource =
  | "approved_outline"
  | "production_outline"
  | "legacy";

export type PromptSource = "canonical" | "legacy";

export type StyleSource =
  | "project_style_pack"
  | "preset"
  | "fallback_default";

export type ActionPolicy = "strict" | "soft";

export type LayoutSource =
  | "role_based"
  | "count_based"
  | "manual_override";

export interface PipelineTruthContinuityRefs {
  characterRefs: number;
  faceRefs: number;
  actionRefs: number;
  sceneRefs: number;
}

export type TruthViolationSeverity = "warn" | "error";

/**
 * Closed set of violation codes. Any new code must be added to
 * `TRUTH_VIOLATION_CODES` below; string literals are rejected at compile time.
 *
 * The codes cluster by invariant so logs can be filtered without parsing
 * free-form messages.
 */
export const TRUTH_VIOLATION_CODES = {
  // Observability / pipeline
  canonical_packet_missing: "canonical_packet_missing",
  canonical_packet_preflight_invalid: "canonical_packet_preflight_invalid",
  legacy_prompt_fallback_used: "legacy_prompt_fallback_used",
  legacy_prompt_fallback_blocked: "legacy_prompt_fallback_blocked",

  // Style truth
  style_contract_missing: "style_contract_missing",
  style_contract_fallback_default: "style_contract_fallback_default",
  style_contract_hard_negative_missing: "style_contract_hard_negative_missing",
  style_contract_family_mismatch: "style_contract_family_mismatch",

  // Narrative truth
  narrative_source_not_approved: "narrative_source_not_approved",
  narrative_beat_invented: "narrative_beat_invented",

  // Action truth
  action_policy_violation: "action_policy_violation",
  action_envelope_exceeded: "action_envelope_exceeded",
  forbidden_action_verb_in_prompt: "forbidden_action_verb_in_prompt",

  // Character truth
  face_closeup_ref_missing: "face_closeup_ref_missing",
  character_identity_contract_missing: "character_identity_contract_missing",

  // Layout truth
  layout_downgraded_to_count_based: "layout_downgraded_to_count_based",
  layout_manual_override_required: "layout_manual_override_required",
} as const;

export type TruthViolationCode =
  (typeof TRUTH_VIOLATION_CODES)[keyof typeof TRUTH_VIOLATION_CODES];

export interface TruthViolation {
  code: TruthViolationCode;
  severity: TruthViolationSeverity;
  detail: string;
  /** Which pass emitted the violation (e.g. "narrative-truth-pass"). */
  pass?: string;
  /** Optional structured context for debug UI (no PII). */
  context?: Record<string, unknown>;
}

export interface PipelineTruthReport {
  narrativeSource: NarrativeSource;
  promptSource: PromptSource;
  styleSource: StyleSource;
  actionPolicy: ActionPolicy;
  layoutSource: LayoutSource;
  continuityRefs: PipelineTruthContinuityRefs;
  violations: TruthViolation[];
  /** ISO timestamp of when the report was sealed. */
  sealedAt: string;
  /** Version of the truth-report schema itself. */
  reportVersion: "1.0.0";
}

/**
 * Creates an empty report with sensible defaults. Callers mutate fields as
 * the pipeline progresses, then seal with `sealPipelineTruthReport`.
 */
export function createPipelineTruthReport(
  overrides: Partial<Omit<PipelineTruthReport, "sealedAt" | "reportVersion">> = {},
): PipelineTruthReport {
  return {
    narrativeSource: "approved_outline",
    promptSource: "canonical",
    styleSource: "project_style_pack",
    actionPolicy: "soft",
    layoutSource: "role_based",
    continuityRefs: {
      characterRefs: 0,
      faceRefs: 0,
      actionRefs: 0,
      sceneRefs: 0,
    },
    violations: [],
    sealedAt: "",
    reportVersion: "1.0.0",
    ...overrides,
  };
}

/** Append a violation, de-duplicated by (code, detail). */
export function addTruthViolation(
  report: PipelineTruthReport,
  violation: TruthViolation,
): void {
  const exists = report.violations.some(
    (v) => v.code === violation.code && v.detail === violation.detail,
  );
  if (!exists) {
    report.violations.push(violation);
  }
}

/** Seals the report so downstream consumers don't accidentally re-seal. */
export function sealPipelineTruthReport(
  report: PipelineTruthReport,
): PipelineTruthReport {
  return {
    ...report,
    sealedAt: report.sealedAt || new Date().toISOString(),
  };
}

export function hasErrorViolations(report: PipelineTruthReport): boolean {
  return report.violations.some((v) => v.severity === "error");
}
