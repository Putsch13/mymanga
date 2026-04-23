/**
 * Validator du StoryboardPlan produit par le Manga Editor Agent.
 *
 * Objectif :
 *   - refuser un storyboard qui laisserait passer des cases non déterministes
 *   - refuser les invraisemblances narratives (combat sur beat infiltration, etc.)
 *   - refuser la répétition de plans héros en boucle (P6 "portraits en boucle")
 *   - refuser une séquence combat pauvre ("action poster" — P4)
 *   - refuser l'absence de cutaways / inserts / NPC quand requis
 *   - alerter sur les ratios éditoriaux aberrants
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
  type StoryboardRenderMode,
  type StoryboardShotType,
} from "../contracts/storyboard-plan";

export interface StoryboardValidationResult {
  ok: boolean;
  issues: string[];
  warnings: string[];
}

interface ValidateOptions {
  storyArc?: StoryArc | null;
  /**
   * COMMIT D — si `strict` est vrai, les règles "budgets" (hero closeup
   * consécutifs, hero ratio trop élevé, séquences combat incomplètes…)
   * deviennent des `issues` au lieu de `warnings`. Le premium doit passer
   * en `strict: true`. Le legacy peut rester en `strict: false` pendant
   * la transition.
   */
  strict?: boolean;
}

/**
 * COMMIT D — seuils éditoriaux.
 *
 * Ils peuvent être retunés mais doivent rester explicites ici pour servir
 * de contrat produit. Pas de "magic numbers" éparpillés.
 */
const BUDGETS = {
  heroFocusRatioMax: 0.5,
  closeupRatioMax: 0.5,
  heroCloseupConsecutiveMax: 2,
  heroCloseupRatioMax: 0.35,
  minCutawayRatio: 0.05,
  minNonHeroRatio: 0.3,
  minCombatPanels: 3,
} as const;

const CLOSEUP_SHOT_TYPES: ReadonlySet<StoryboardShotType> = new Set([
  "closeup",
  "extreme_closeup",
]);

const CUTAWAY_RENDER_MODES: ReadonlySet<StoryboardRenderMode> = new Set([
  "establishing_environment",
  "silent_transition",
  "insert_object",
  "surveillance_reveal",
  "threat_silhouette",
]);

const COMBAT_RENDER_MODES: ReadonlySet<StoryboardRenderMode> = new Set([
  "combat_exchange",
  "combat_aftermath",
]);

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

  const strict = options.strict === true;
  validateEditorialRatios(allPanels, warnings, issues, strict);
  validateHeroCloseupBudget(allPanels, warnings, issues, strict);
  validateCutawayBudget(allPanels, warnings, issues, strict);
  validateNonHeroBudget(allPanels, warnings, issues, strict);
  validateCombatGrammar(allPanels, options.storyArc ?? null, warnings, issues, strict);
  validateAntiRepetition(allPanels, warnings, issues, strict);

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

function validateEditorialRatios(
  panels: StoryboardPanel[],
  warnings: string[],
  issues: string[],
  strict: boolean,
) {
  if (panels.length === 0) return;
  const heroFocus = panels.filter((p) => p.subjectFocus === "hero").length;
  const heroRatio = heroFocus / panels.length;
  if (heroRatio > BUDGETS.heroFocusRatioMax) {
    const msg = `storyboard_plan.hero_focus_ratio_too_high=${heroRatio.toFixed(2)} max=${BUDGETS.heroFocusRatioMax}`;
    (strict ? issues : warnings).push(msg);
  }

  const closeups = panels.filter((p) => CLOSEUP_SHOT_TYPES.has(p.shotType)).length;
  const closeupRatio = closeups / panels.length;
  if (closeupRatio > BUDGETS.closeupRatioMax) {
    const msg = `storyboard_plan.closeup_ratio_too_high=${closeupRatio.toFixed(2)} max=${BUDGETS.closeupRatioMax}`;
    (strict ? issues : warnings).push(msg);
  }
}

/**
 * COMMIT D — budget hero closeup.
 *
 * Interdit :
 *   - plus de N (BUDGETS.heroCloseupConsecutiveMax) `hero_closeup` consécutifs
 *   - plus de X% de `hero_closeup` sur le chapitre
 *
 * C'est la règle la plus importante contre les "portraits en boucle" cités
 * dans le verdict utilisateur.
 */
function validateHeroCloseupBudget(
  panels: StoryboardPanel[],
  warnings: string[],
  issues: string[],
  strict: boolean,
) {
  if (panels.length === 0) return;
  const heroCloseupCount = panels.filter((p) => p.renderMode === "hero_closeup").length;
  const ratio = heroCloseupCount / panels.length;
  if (ratio > BUDGETS.heroCloseupRatioMax) {
    const msg = `storyboard_plan.hero_closeup_ratio_too_high=${ratio.toFixed(2)} max=${BUDGETS.heroCloseupRatioMax} count=${heroCloseupCount}/${panels.length}`;
    (strict ? issues : warnings).push(msg);
  }
  let run = 0;
  let maxRun = 0;
  for (const p of panels) {
    if (p.renderMode === "hero_closeup") {
      run += 1;
      if (run > maxRun) maxRun = run;
    } else {
      run = 0;
    }
  }
  if (maxRun > BUDGETS.heroCloseupConsecutiveMax) {
    const msg = `storyboard_plan.hero_closeup_consecutive_run_too_long=${maxRun} max=${BUDGETS.heroCloseupConsecutiveMax}`;
    (strict ? issues : warnings).push(msg);
  }
}

/**
 * COMMIT D — budget cutaway / insert.
 *
 * Sur un chapitre de 70-75 panels, on exige AU MOINS un plancher de plans
 * "non-dramatiques directs" (environnement, insert objet, transition,
 * surveillance, silhouette menaçante). Sinon on a un chapitre "tunnel
 * héros".
 */
function validateCutawayBudget(
  panels: StoryboardPanel[],
  warnings: string[],
  issues: string[],
  strict: boolean,
) {
  if (panels.length === 0) return;
  const cutaways = panels.filter((p) => CUTAWAY_RENDER_MODES.has(p.renderMode)).length;
  const ratio = cutaways / panels.length;
  if (ratio < BUDGETS.minCutawayRatio) {
    const msg = `storyboard_plan.cutaway_ratio_too_low=${ratio.toFixed(2)} min=${BUDGETS.minCutawayRatio} count=${cutaways}/${panels.length}`;
    (strict ? issues : warnings).push(msg);
  }
}

/**
 * COMMIT D — budget "non-héros".
 *
 * Sur un chapitre entier, au moins ~30% des panels doivent NE PAS être en
 * subjectFocus=hero. Un PNJ important, un ennemi, un groupe, un prop ou
 * l'environnement doivent pouvoir porter des cases. Sinon le chapitre
 * tombe dans le travers "Miya-centrique" identifié dans le verdict.
 */
function validateNonHeroBudget(
  panels: StoryboardPanel[],
  warnings: string[],
  issues: string[],
  strict: boolean,
) {
  if (panels.length === 0) return;
  const nonHero = panels.filter((p) => p.subjectFocus !== "hero").length;
  const ratio = nonHero / panels.length;
  if (ratio < BUDGETS.minNonHeroRatio) {
    const msg = `storyboard_plan.non_hero_ratio_too_low=${ratio.toFixed(2)} min=${BUDGETS.minNonHeroRatio} count=${nonHero}/${panels.length}`;
    (strict ? issues : warnings).push(msg);
  }
}

/**
 * COMMIT D — grammaire de combat.
 *
 * Si le StoryArc contient un beat de type `combat`, le storyboard doit
 * produire une séquence lisible :
 *   - au moins `minCombatPanels` panels liés à ce beat
 *   - au moins un plan wide/medium (pas uniquement des closeups héros)
 *   - au moins un panel d'aftermath
 *
 * Sinon on génère des "posters d'action" dénoncés par l'utilisateur.
 */
function validateCombatGrammar(
  panels: StoryboardPanel[],
  storyArc: StoryArc | null,
  warnings: string[],
  issues: string[],
  strict: boolean,
) {
  if (!storyArc?.beats?.length) return;
  const combatBeats = storyArc.beats.filter((b) => b.type === "combat");
  if (combatBeats.length === 0) return;

  for (const beat of combatBeats) {
    const beatPanels = panels.filter((p) => p.sourceBeatId === beat.beatId);
    if (beatPanels.length < BUDGETS.minCombatPanels) {
      const msg = `storyboard_plan.combat_beat_underpanelized beatId=${beat.beatId} count=${beatPanels.length} min=${BUDGETS.minCombatPanels}`;
      (strict ? issues : warnings).push(msg);
      continue;
    }
    const hasSpatial = beatPanels.some(
      (p) => p.shotType === "wide" || p.shotType === "medium",
    );
    if (!hasSpatial) {
      const msg = `storyboard_plan.combat_beat_missing_spatial_read beatId=${beat.beatId} (add at least one wide/medium shot)`;
      (strict ? issues : warnings).push(msg);
    }
    const hasAftermath = beatPanels.some(
      (p) => p.renderMode === "combat_aftermath" || p.renderMode === "aftermath_dialogue",
    );
    if (!hasAftermath) {
      const msg = `storyboard_plan.combat_beat_missing_aftermath beatId=${beat.beatId}`;
      (strict ? issues : warnings).push(msg);
    }
    const allCloseup = beatPanels.every((p) => CLOSEUP_SHOT_TYPES.has(p.shotType));
    if (allCloseup) {
      const msg = `storyboard_plan.combat_beat_closeup_only beatId=${beat.beatId} (action poster detected)`;
      (strict ? issues : warnings).push(msg);
    }
    const hasCombatRender = beatPanels.some((p) => COMBAT_RENDER_MODES.has(p.renderMode));
    if (!hasCombatRender) {
      const msg = `storyboard_plan.combat_beat_missing_combat_render beatId=${beat.beatId} (no combat_exchange or combat_aftermath)`;
      (strict ? issues : warnings).push(msg);
    }
  }
}

/**
 * COMMIT D — anti-répétition.
 *
 * Refuse une série de panels qui répètent exactement la même combinaison
 * `(renderMode, shotType, cameraAngle, subjectFocus)`. Un storyboard
 * copié-collé sur 5 panels consécutifs est immédiatement illisible.
 */
function validateAntiRepetition(
  panels: StoryboardPanel[],
  warnings: string[],
  issues: string[],
  strict: boolean,
) {
  const signatures = panels.map(
    (p) => `${p.renderMode}|${p.shotType}|${p.cameraAngle}|${p.subjectFocus}`,
  );
  let run = 1;
  let maxRun = 1;
  let worst = signatures[0] ?? "";
  for (let i = 1; i < signatures.length; i += 1) {
    if (signatures[i] === signatures[i - 1]) {
      run += 1;
      if (run > maxRun) {
        maxRun = run;
        worst = signatures[i];
      }
    } else {
      run = 1;
    }
  }
  if (maxRun >= 3) {
    const msg = `storyboard_plan.repetitive_signature_run=${maxRun} signature=${worst}`;
    (strict ? issues : warnings).push(msg);
  }
}
