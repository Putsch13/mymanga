/**
 * Validator du StoryboardPlan produit par le Manga Editor Agent.
 *
 * Objectif :
 *   - refuser un storyboard qui laisserait passer des cases non déterministes
 *   - refuser les invraisemblances narratives (combat sur beat infiltration, etc.)
 *   - alerter sur les ratios éditoriaux aberrants (100% closeups héros...)
 *
 * Sortie : { ok, issues[], warnings[] }.
 * `ok === true` ⇒ pas de blocker. `warnings` n'empêchent pas le rendu.
 */

import type { StoryArc } from "../contracts/story-arc";
import {
  STORYBOARD_LAYOUT_TEMPLATES,
  STORYBOARD_RENDER_MODES,
  type StoryboardPanel,
  type StoryboardPlan,
} from "../contracts/storyboard-plan";

export interface StoryboardValidationResult {
  ok: boolean;
  issues: string[];
  warnings: string[];
}

interface ValidateOptions {
  storyArc?: StoryArc | null;
}

export function validateStoryboardPlan(
  plan: StoryboardPlan,
  options: ValidateOptions = {},
): StoryboardValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (!plan || typeof plan !== "object") {
    return { ok: false, issues: ["storyboard_plan_missing"], warnings: [] };
  }

  if (!plan.chapterId) issues.push("storyboard_plan.chapterId_missing");
  if (!Array.isArray(plan.pages) || plan.pages.length === 0) {
    issues.push("storyboard_plan.pages_empty");
  }

  const renderModes = new Set<string>(STORYBOARD_RENDER_MODES);
  const layoutTemplates = new Set<string>(STORYBOARD_LAYOUT_TEMPLATES);

  const beatById = new Map<string, StoryArc["beats"][number]>();
  if (options.storyArc?.beats) {
    for (const beat of options.storyArc.beats) beatById.set(beat.beatId, beat);
  }

  const allPanels: StoryboardPanel[] = [];
  const pageNumbersSeen = new Set<number>();

  for (const page of plan.pages ?? []) {
    if (typeof page.pageNumber !== "number" || page.pageNumber <= 0) {
      issues.push(`storyboard_plan.page.pageNumber_invalid=${String(page.pageNumber)}`);
    } else if (pageNumbersSeen.has(page.pageNumber)) {
      issues.push(`storyboard_plan.page.pageNumber_duplicate=${page.pageNumber}`);
    } else {
      pageNumbersSeen.add(page.pageNumber);
    }

    if (!layoutTemplates.has(page.layoutTemplate)) {
      issues.push(
        `storyboard_plan.page[${page.pageNumber}].layoutTemplate_invalid=${String(page.layoutTemplate)}`,
      );
    }
    if (!Array.isArray(page.panels) || page.panels.length === 0) {
      issues.push(`storyboard_plan.page[${page.pageNumber}].panels_empty`);
      continue;
    }
    for (const panel of page.panels) {
      allPanels.push(panel);
      validatePanel(panel, { renderModes, beatById, issues, warnings });
    }
  }

  validateEditorialRatios(allPanels, warnings);

  return {
    ok: issues.length === 0,
    issues,
    warnings,
  };
}

function validatePanel(
  panel: StoryboardPanel,
  ctx: {
    renderModes: Set<string>;
    beatById: Map<string, StoryArc["beats"][number]>;
    issues: string[];
    warnings: string[];
  },
) {
  const { renderModes, beatById, issues, warnings } = ctx;
  const prefix = `storyboard_plan.panel[${panel.panelId ?? "?"}]`;

  if (!panel.panelId) issues.push(`${prefix}.panelId_missing`);
  if (!panel.renderMode || !renderModes.has(panel.renderMode)) {
    issues.push(`${prefix}.renderMode_invalid=${String(panel.renderMode)}`);
  }
  if (!panel.shotType) issues.push(`${prefix}.shotType_missing`);
  if (!panel.subjectFocus) issues.push(`${prefix}.subjectFocus_missing`);
  if (!panel.sourceBeatId) {
    issues.push(`${prefix}.sourceBeatId_missing`);
  } else if (beatById.size > 0 && !beatById.has(panel.sourceBeatId)) {
    issues.push(`${prefix}.sourceBeatId_unknown=${panel.sourceBeatId}`);
  }

  const beat = panel.sourceBeatId ? beatById.get(panel.sourceBeatId) : undefined;
  if (beat) {
    const isCombatRender =
      panel.renderMode === "combat_exchange" || panel.renderMode === "combat_aftermath";
    if (isCombatRender && beat.type === "infiltration") {
      issues.push(
        `${prefix}.combat_invented_on_infiltration_beat=${beat.beatId}`,
      );
    }
    if (beat.type === "setup" && panel.renderMode === "combat_exchange") {
      issues.push(`${prefix}.combat_invented_on_setup_beat=${beat.beatId}`);
    }
    if (beat.type === "dialogue_tension" && panel.dialogue.length === 0 && panel.renderMode === "dialogue_two_shot") {
      warnings.push(`${prefix}.dialogue_two_shot_without_dialogue`);
    }
  }

  if (panel.renderMode === "establishing_environment" && panel.subjectFocus === "hero") {
    issues.push(`${prefix}.establishing_environment_cannot_have_subjectFocus_hero`);
  }
  if (panel.renderMode === "insert_object" && panel.subjectFocus === "hero") {
    issues.push(`${prefix}.insert_object_cannot_have_subjectFocus_hero`);
  }
  if (panel.renderMode === "reaction_closeup" && panel.shotType === "wide") {
    issues.push(`${prefix}.reaction_closeup_cannot_have_wide_shot`);
  }

  if (!panel.locationName) warnings.push(`${prefix}.locationName_missing`);
  if (!panel.actionLine) warnings.push(`${prefix}.actionLine_missing`);
}

function validateEditorialRatios(panels: StoryboardPanel[], warnings: string[]) {
  if (panels.length === 0) return;
  const heroFocus = panels.filter((p) => p.subjectFocus === "hero").length;
  const heroRatio = heroFocus / panels.length;
  if (heroRatio > 0.6) {
    warnings.push(
      `storyboard_plan.hero_focus_ratio_too_high=${heroRatio.toFixed(2)}`,
    );
  }

  const closeups = panels.filter(
    (p) => p.shotType === "closeup" || p.shotType === "extreme_closeup",
  ).length;
  if (closeups / panels.length > 0.5) {
    warnings.push(
      `storyboard_plan.closeup_ratio_too_high=${(closeups / panels.length).toFixed(2)}`,
    );
  }
}
