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
import { PANEL_PURPOSES } from "../contracts/storyboard-plan";

export interface RenderSpecValidationResult {
  ok: boolean;
  issues: string[];
  warnings: string[];
  /** P7.24 — Erreurs fatales (bloquent le rendu) vs non-fatales (warnings) */
  fatalIssues: string[];
  nonFatalIssues: string[];
}

/**
 * COMMIT C — sentinelles interdites.
 *
 * Une spec ne doit JAMAIS passer en rendu avec ces valeurs. Elles signalent
 * un storyboard qui n'a pas su décider la case (legacy `panel=unknown
 * subjectFocus=none → CHARACTER_IN_SCENE`). On fail tôt, on ne laisse pas
 * le rendu inventer.
 */
const FORBIDDEN_FIELD_SENTINELS = new Set<string>([
  "unknown",
  "none",
  "undefined",
  "null",
  "n/a",
  "tbd",
  "todo",
  "",
]);

const CHARACTER_REQUIRED_RENDER_MODES = new Set<PanelRenderSpec["renderMode"]>([
  "character_focus",
  "reaction_closeup",
  "hero_closeup",
  "npc_closeup",
  "enemy_closeup",
  "dialogue_over_shoulder",
  "aftermath_dialogue",
]);

const MULTI_CHARACTER_REQUIRED_RENDER_MODES = new Set<PanelRenderSpec["renderMode"]>([
  "dialogue_two_shot",
  "group_tension",
]);

function isSentinel(value: string | null | undefined): boolean {
  if (!value) return true;
  return FORBIDDEN_FIELD_SENTINELS.has(value.trim().toLowerCase());
}

/**
 * P7.24 — Erreurs fatales vs non-fatales.
 * Seules les erreurs fatales bloquent le rendu.
 */
const FATAL_ISSUE_PATTERNS = [
  /\.panelId_missing/,
  /\.styleBible_missing/,
  /\.panelPurpose_missing_or_sentinel/,
  /\.renderMode_missing_or_sentinel/,
];

function isFatalIssue(issue: string): boolean {
  return FATAL_ISSUE_PATTERNS.some((p) => p.test(issue));
}

export function validateRenderSpec(spec: PanelRenderSpec): RenderSpecValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];
  const prefix = `panel_render_spec[${spec?.panelId ?? "?"}]`;

  if (!spec || typeof spec !== "object") {
    return { ok: false, issues: [`${prefix}.missing`], warnings };
  }
  if (!spec.panelId) issues.push(`${prefix}.panelId_missing`);

  // COMMIT C — champs éditoriaux obligatoires + interdits aux sentinelles.
  // Un panel premium sans panelPurpose / renderMode / shotType / subjectFocus
  // explicite ne part PAS en rendu. Plus de fallback silencieux vers
  // `CHARACTER_IN_SCENE`.
  if (isSentinel(spec.panelPurpose)) {
    issues.push(`${prefix}.panelPurpose_missing_or_sentinel=${spec.panelPurpose ?? "null"}`);
  } else if (!(PANEL_PURPOSES as readonly string[]).includes(spec.panelPurpose)) {
    // COMMIT P3.B — panelPurpose DOIT appartenir à l'enum fermé.
    // Plus question d'accepter une valeur libre du LLM storyboard
    // (`panel=unknown`, `panel=cool-shot`, etc.).
    issues.push(
      `${prefix}.panelPurpose_not_in_enum=${spec.panelPurpose} (allowed: ${PANEL_PURPOSES.length} values)`,
    );
  }
  if (isSentinel(spec.renderMode)) {
    issues.push(`${prefix}.renderMode_missing_or_sentinel=${spec.renderMode ?? "null"}`);
  }
  if (isSentinel(spec.shotType)) {
    issues.push(`${prefix}.shotType_missing_or_sentinel=${spec.shotType ?? "null"}`);
  }
  if (isSentinel(spec.subjectFocus)) {
    issues.push(`${prefix}.subjectFocus_missing_or_sentinel=${spec.subjectFocus ?? "null"}`);
  }

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
  // COMMIT C — un insert d'objet ou un establishing ne peut pas être un
  // portrait rapproché du héros. Ce sont les deux contradictions qui
  // génèrent le plus de panels "portrait héros en boucle" sur les logs.
  if (
    spec.renderMode === "insert_object" &&
    (spec.shotType === "closeup" || spec.shotType === "extreme_closeup")
  ) {
    issues.push(`${prefix}.contradiction.insert_object+closeup`);
  }
  if (
    spec.renderMode === "establishing_environment" &&
    (spec.shotType === "closeup" || spec.shotType === "extreme_closeup")
  ) {
    issues.push(`${prefix}.contradiction.establishing_environment+closeup`);
  }

  if (CHARACTER_REQUIRED_RENDER_MODES.has(spec.renderMode) && spec.visibleCharacters.length === 0) {
    issues.push(`${prefix}.missing_visible_characters_for_renderMode=${spec.renderMode}`);
  }
  if (MULTI_CHARACTER_REQUIRED_RENDER_MODES.has(spec.renderMode) && spec.visibleCharacters.length < 2) {
    issues.push(`${prefix}.insufficient_visible_characters_for_renderMode=${spec.renderMode}`);
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

  // P7.24 — Séparer erreurs fatales et non-fatales
  const fatalIssues = issues.filter(isFatalIssue);
  const nonFatalIssues = issues.filter((i) => !isFatalIssue(i));

  return {
    ok: fatalIssues.length === 0,
    issues,
    warnings,
    fatalIssues,
    nonFatalIssues,
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

/**
 * P7.24 — Option pour contrôler le comportement de validation.
 * @param strictMode Si true, toutes les erreurs sont fatales. Si false, seules les fatales bloquent.
 */
export function assertValidRenderSpec(spec: PanelRenderSpec, strictMode = false): void {
  const result = validateRenderSpec(spec);

  // En mode non-strict, seules les erreurs fatales bloquent
  if (strictMode) {
    if (!result.ok || result.issues.length > 0) {
      throw new RenderSpecValidationError(result);
    }
  } else {
    if (result.fatalIssues.length > 0) {
      throw new RenderSpecValidationError(result);
    }
    if (result.nonFatalIssues.length > 0) {
      console.warn(
        `[render-spec-validator] non-fatal issues for panel=${spec.panelId}: ${result.nonFatalIssues.join(", ")}`,
      );
    }
  }
}
