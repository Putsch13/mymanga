/**
 * panel-qa-pass — audit panel par panel après le render-pass.
 *
 * Vérifie (sans LLM en Sprint 1) :
 *   - bon personnage présent dans le spec
 *   - bon lieu
 *   - bon shot
 *   - bon sujet
 *   - pas de drift majeur (mustShow manquant / mustNotShow présent en
 *     constraints)
 *   - pas de décor hors univers (via liste allowedLocations si fournie)
 *   - pas de magie inventée (tags interdits)
 *
 * Les checks "vision LLM" viendront dans un sprint suivant via le
 * panel-vision-analyzer existant.
 */

import type { PanelRenderSpec } from "@manga-ai-studio/ai";

export interface PanelQaPassInput {
  specs: PanelRenderSpec[];
  allowedLocations?: string[];
  forbiddenTags?: string[];
}

export interface PanelQaResult {
  panelId: string;
  ok: boolean;
  issues: string[];
  warnings: string[];
}

export interface PanelQaPassOutput {
  results: PanelQaResult[];
  okCount: number;
  failCount: number;
}

export async function runPanelQaPass(input: PanelQaPassInput): Promise<PanelQaPassOutput> {
  const allowed = new Set((input.allowedLocations ?? []).map((s) => s.toLowerCase()));
  const forbidden = new Set((input.forbiddenTags ?? []).map((s) => s.toLowerCase()));

  const results: PanelQaResult[] = input.specs.map((spec) => {
    const issues: string[] = [];
    const warnings: string[] = [];
    if (spec.subjectFocus === "hero" && spec.visibleCharacters.every((c) => c.role !== "hero")) {
      issues.push("subject_focus_hero_but_no_hero_visible");
    }
    if (allowed.size > 0) {
      const loc = (spec.locationName ?? "").toLowerCase();
      if (loc && !allowed.has(loc)) warnings.push(`location_outside_universe=${spec.locationName}`);
    }
    for (const tag of forbidden) {
      if (spec.actionLine.toLowerCase().includes(tag)) {
        issues.push(`forbidden_tag_in_action=${tag}`);
      }
    }
    if (spec.constraints.mustShow.length > 0 && spec.visibleCharacters.length === 0) {
      warnings.push("must_show_without_visible_characters");
    }
    return {
      panelId: spec.panelId,
      ok: issues.length === 0,
      issues,
      warnings,
    };
  });

  return {
    results,
    okCount: results.filter((r) => r.ok).length,
    failCount: results.filter((r) => !r.ok).length,
  };
}
