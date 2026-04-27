/**
 * P7.23 — RenderSpecRepairPass : réparation automatique des specs avant preflight.
 *
 * Ce pass tente de réparer les problèmes mineurs dans les render specs
 * AVANT de faire échouer le preflight. L'objectif est de maximiser le
 * nombre de panels qui passent en rendu.
 *
 * Réparations effectuées :
 * - Normalisation des valeurs sentinelles → valeurs par défaut
 * - Correction des contradictions évidentes (renderMode vs subjectFocus)
 * - Ajout des références manquantes depuis la visual memory
 *
 * @module render-spec-repair-pass
 */

import type { PanelRenderSpec } from "@manga-ai-studio/ai";
import type { ChapterVisualMemory } from "@manga-ai-studio/ai";

export interface RenderSpecRepairInput {
  specs: PanelRenderSpec[];
  visualMemory?: ChapterVisualMemory | null;
}

export interface RenderSpecRepairResult {
  specs: PanelRenderSpec[];
  repairsApplied: Array<{
    panelId: string;
    repairType: string;
    originalValue: string | null;
    newValue: string;
  }>;
  unrepairable: Array<{ panelId: string; reason: string }>;
}

const SENTINEL_VALUES = new Set([
  "unknown",
  "none",
  "undefined",
  "null",
  "n/a",
  "tbd",
  "todo",
  "",
]);

function isSentinel(value: string | null | undefined): boolean {
  if (!value) return true;
  return SENTINEL_VALUES.has(value.trim().toLowerCase());
}

function inferPanelPurpose(spec: Partial<PanelRenderSpec>): string {
  if (spec.renderMode === "establishing_environment") return "environment_establishing";
  if (spec.renderMode === "character_focus" || spec.renderMode === "hero_closeup") {
    return "character_focus";
  }
  if (spec.renderMode === "dialogue_two_shot" || spec.renderMode === "dialogue_over_shoulder") {
    return "dialogue_beat";
  }
  if (spec.renderMode === "action_sequence") return "action_scene";
  return "character_focus";
}

function inferRenderMode(spec: Partial<PanelRenderSpec>): string {
  if (spec.subjectFocus === "environment") return "establishing_environment";
  if (spec.subjectFocus === "hero" || spec.subjectFocus === "speaker") return "character_focus";
  if (spec.subjectFocus === "duo") return "dialogue_two_shot";
  return "character_focus";
}

function inferShotType(spec: Partial<PanelRenderSpec>): string {
  if (spec.renderMode === "establishing_environment") return "wide";
  if (spec.renderMode === "hero_closeup" || spec.renderMode === "reaction_closeup") {
    return "closeup";
  }
  if (spec.renderMode === "dialogue_two_shot") return "medium";
  return "medium";
}

function inferSubjectFocus(spec: Partial<PanelRenderSpec>): string {
  if (spec.renderMode === "establishing_environment") return "environment";
  if (spec.renderMode === "hero_closeup") return "hero";
  if (spec.renderMode === "dialogue_two_shot") return "duo";
  return "hero";
}

export function runRenderSpecRepairPass(input: RenderSpecRepairInput): RenderSpecRepairResult {
  const repairs: RenderSpecRepairResult["repairsApplied"] = [];
  const unrepairable: RenderSpecRepairResult["unrepairable"] = [];
  const repairedSpecs: PanelRenderSpec[] = [];

  for (const originalSpec of input.specs) {
    const spec = { ...originalSpec };
    let modified = false;

    // 1. Réparer panelPurpose sentinel
    if (isSentinel(spec.panelPurpose)) {
      const newValue = inferPanelPurpose(spec);
      repairs.push({
        panelId: spec.panelId,
        repairType: "panelPurpose_sentinel",
        originalValue: spec.panelPurpose,
        newValue,
      });
      spec.panelPurpose = newValue as PanelRenderSpec["panelPurpose"];
      modified = true;
    }

    // 2. Réparer renderMode sentinel
    if (isSentinel(spec.renderMode)) {
      const newValue = inferRenderMode(spec);
      repairs.push({
        panelId: spec.panelId,
        repairType: "renderMode_sentinel",
        originalValue: spec.renderMode,
        newValue,
      });
      spec.renderMode = newValue as PanelRenderSpec["renderMode"];
      modified = true;
    }

    // 3. Réparer shotType sentinel
    if (isSentinel(spec.shotType)) {
      const newValue = inferShotType(spec);
      repairs.push({
        panelId: spec.panelId,
        repairType: "shotType_sentinel",
        originalValue: spec.shotType,
        newValue,
      });
      spec.shotType = newValue as PanelRenderSpec["shotType"];
      modified = true;
    }

    // 4. Réparer subjectFocus sentinel
    if (isSentinel(spec.subjectFocus)) {
      const newValue = inferSubjectFocus(spec);
      repairs.push({
        panelId: spec.panelId,
        repairType: "subjectFocus_sentinel",
        originalValue: spec.subjectFocus,
        newValue,
      });
      spec.subjectFocus = newValue as PanelRenderSpec["subjectFocus"];
      modified = true;
    }

    // 5. Corriger contradiction establishing_environment + hero
    if (spec.renderMode === "establishing_environment" && spec.subjectFocus === "hero") {
      repairs.push({
        panelId: spec.panelId,
        repairType: "contradiction_env_hero",
        originalValue: `${spec.renderMode}+${spec.subjectFocus}`,
        newValue: "establishing_environment+hero",
      });
      spec.renderMode = "establishing_environment";
      modified = true;
    }

    // 6. Corriger contradiction character_focus + wide establishing
    if (
      spec.renderMode === "character_focus" &&
      (spec.shotType === "wide" || spec.shotType === "extreme_wide")
    ) {
      repairs.push({
        panelId: spec.panelId,
        repairType: "contradiction_char_wide",
        originalValue: `${spec.renderMode}+${spec.shotType}`,
        newValue: "establishing_environment+medium",
      });
      spec.renderMode = "establishing_environment";
      spec.shotType = "medium";
      modified = true;
    }

    // 7. Vérifier si réparable
    if (!spec.styleBible) {
      unrepairable.push({
        panelId: spec.panelId,
        reason: "styleBible_missing_cannot_repair",
      });
    }

    repairedSpecs.push(spec);

    if (modified) {
      console.info(
        `[render-spec-repair] panel=${spec.panelId} repairs=${repairs
          .filter((r) => r.panelId === spec.panelId)
          .map((r) => r.repairType)
          .join(",")}`,
      );
    }
  }

  console.info(
    `[render-spec-repair] total=${input.specs.length} repaired=${repairs.length} unrepairable=${unrepairable.length}`,
  );

  return {
    specs: repairedSpecs,
    repairsApplied: repairs,
    unrepairable,
  };
}

export function formatRenderSpecRepairLog(result: RenderSpecRepairResult): string {
  if (result.repairsApplied.length === 0 && result.unrepairable.length === 0) {
    return "[render-spec-repair] no repairs needed";
  }

  const repairSummary = result.repairsApplied
    .slice(0, 5)
    .map((r) => `${r.panelId}: ${r.repairType}`)
    .join(", ");

  return (
    `[render-spec-repair] repairs=${result.repairsApplied.length} unrepairable=${result.unrepairable.length}` +
    (repairSummary ? ` (${repairSummary})` : "")
  );
}
