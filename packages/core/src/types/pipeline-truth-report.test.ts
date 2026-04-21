import { describe, it, expect } from "vitest";
import {
  createPipelineTruthReport,
  addTruthViolation,
  sealPipelineTruthReport,
  hasErrorViolations,
  TRUTH_VIOLATION_CODES,
} from "./pipeline-truth-report";

describe("PipelineTruthReport", () => {
  it("crée un rapport avec des defaults raisonnables", () => {
    const r = createPipelineTruthReport();
    expect(r.narrativeSource).toBe("approved_outline");
    expect(r.promptSource).toBe("canonical");
    expect(r.styleSource).toBe("project_style_pack");
    expect(r.violations).toEqual([]);
    expect(r.reportVersion).toBe("1.0.0");
  });

  it("applique les overrides passés à la création", () => {
    const r = createPipelineTruthReport({
      promptSource: "legacy",
      actionPolicy: "strict",
    });
    expect(r.promptSource).toBe("legacy");
    expect(r.actionPolicy).toBe("strict");
  });

  it("déduplique les violations identiques (code + detail)", () => {
    const r = createPipelineTruthReport();
    addTruthViolation(r, {
      code: TRUTH_VIOLATION_CODES.legacy_prompt_fallback_used,
      severity: "warn",
      detail: "same",
    });
    addTruthViolation(r, {
      code: TRUTH_VIOLATION_CODES.legacy_prompt_fallback_used,
      severity: "warn",
      detail: "same",
    });
    expect(r.violations).toHaveLength(1);
  });

  it("n'agrège pas des violations au même code mais detail différent", () => {
    const r = createPipelineTruthReport();
    addTruthViolation(r, {
      code: TRUTH_VIOLATION_CODES.forbidden_action_verb_in_prompt,
      severity: "error",
      detail: "strike",
    });
    addTruthViolation(r, {
      code: TRUTH_VIOLATION_CODES.forbidden_action_verb_in_prompt,
      severity: "error",
      detail: "slash",
    });
    expect(r.violations).toHaveLength(2);
  });

  it("hasErrorViolations détecte au moins un niveau error", () => {
    const r = createPipelineTruthReport();
    expect(hasErrorViolations(r)).toBe(false);
    addTruthViolation(r, {
      code: TRUTH_VIOLATION_CODES.style_contract_missing,
      severity: "warn",
      detail: "",
    });
    expect(hasErrorViolations(r)).toBe(false);
    addTruthViolation(r, {
      code: TRUTH_VIOLATION_CODES.action_envelope_exceeded,
      severity: "error",
      detail: "",
    });
    expect(hasErrorViolations(r)).toBe(true);
  });

  it("seal renseigne sealedAt une seule fois", () => {
    const r = createPipelineTruthReport();
    const sealed = sealPipelineTruthReport(r);
    expect(sealed.sealedAt).not.toBe("");
    const resealed = sealPipelineTruthReport(sealed);
    expect(resealed.sealedAt).toBe(sealed.sealedAt);
  });
});
