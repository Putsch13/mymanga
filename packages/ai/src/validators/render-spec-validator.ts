/**
 * Validator du PanelRenderSpec produit par render-spec-builder.
 *
 * Rôle :
 *   - refuser les contradictions (closeup_reaction + subjectFocus environment)
 *   - refuser les refs manquantes quand un héros / support est présent
 *     (policy "never NONE" pour les personnages principaux)
 *   - refuser un spec sans styleBible
 *
 * Le render-pass DOIT appeler `assertValidRenderSpec` avant de composer le
 * prompt et d'envoyer à FAL.
 */

import type { PanelRenderSpec } from "../contracts/panel-render-spec";

export interface RenderSpecValidationResult {
  ok: boolean;
  issues: string[];
  warnings: string[];
}

export function validateRenderSpec(spec: PanelRenderSpec): RenderSpecValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];
  const prefix = `panel_render_spec[${spec?.panelId ?? "?"}]`;

  if (!spec || typeof spec !== "object") {
    return { ok: false, issues: [`${prefix}.missing`], warnings };
  }
  if (!spec.panelId) issues.push(`${prefix}.panelId_missing`);
  if (!spec.renderMode) issues.push(`${prefix}.renderMode_missing`);
  if (!spec.shotType) issues.push(`${prefix}.shotType_missing`);
  if (!spec.subjectFocus) issues.push(`${prefix}.subjectFocus_missing`);
  if (!spec.styleBible) issues.push(`${prefix}.styleBible_missing`);
  if (!spec.imageReferences) issues.push(`${prefix}.imageReferences_missing`);

  if (spec.renderMode === "establishing_environment" && spec.subjectFocus === "hero") {
    issues.push(`${prefix}.contradiction.establishing_environment+hero`);
  }
  if (spec.renderMode === "insert_object" && spec.subjectFocus === "hero") {
    issues.push(`${prefix}.contradiction.insert_object+hero`);
  }
  if (
    (spec.renderMode === "reaction_closeup" || spec.renderMode === "hero_closeup") &&
    spec.shotType === "wide"
  ) {
    issues.push(`${prefix}.contradiction.closeup+wide`);
  }

  const hasHeroOrSupport = spec.visibleCharacters.some(
    (c) => c.role === "hero" || c.role === "support",
  );
  if (hasHeroOrSupport) {
    const hasCharRef = (spec.imageReferences?.characterRefs?.length ?? 0) > 0;
    if (!hasCharRef) {
      issues.push(`${prefix}.missing_character_refs_for_hero_or_support`);
    }
  }

  if (!spec.constraints) {
    warnings.push(`${prefix}.constraints_missing`);
  }

  return {
    ok: issues.length === 0,
    issues,
    warnings,
  };
}

export class RenderSpecValidationError extends Error {
  issues: string[];
  warnings: string[];
  constructor(result: RenderSpecValidationResult) {
    super(`render_spec_invalid: ${result.issues.join(" | ")}`);
    this.name = "RenderSpecValidationError";
    this.issues = result.issues;
    this.warnings = result.warnings;
  }
}

export function assertValidRenderSpec(spec: PanelRenderSpec): void {
  const result = validateRenderSpec(spec);
  if (!result.ok) throw new RenderSpecValidationError(result);
}
