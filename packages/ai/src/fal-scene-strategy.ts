import type { FalPanelCategory, ReferencePolicy, RoutingContext } from "./types";
import { FAL_STRATEGY_BASELINES, type FalBenchmarkSceneId } from "./fal-benchmark";

export type FalSceneAssessment = {
  sceneArchetype: FalBenchmarkSceneId | "generic";
  panelCategory: FalPanelCategory;
  referencePolicy: ReferencePolicy;
  sceneComplexityScore: number;
  environmentCritical: boolean;
  continuityCritical: boolean;
  crowdCritical: boolean;
  interactionCritical: boolean;
  retryPolicy: "standard" | "robust";
  sizePreset: "character_ref" | "panel_story" | "panel_establishing" | "reroll_local" | "reroll_scene";
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isHeroRole(role: string) {
  return /hero|protagon|main_hero|héros|heros/i.test(role);
}

function resolveMinimumReferencePolicy(ctx: RoutingContext): ReferencePolicy {
  if (ctx.heroFocus) return "STRONG";
  if (ctx.heroPresent) return "LIGHT";
  if ((ctx.panelCharacterImportanceTiers ?? []).includes("SECONDARY_CORE")) return "STRONG";
  if ((ctx.panelCharacterImportanceTiers ?? []).includes("IMPORTANT_SUPPORTING_CHARACTER")) return "LIGHT";
  if ((ctx.panelCharacterImportanceTiers ?? []).includes("RECURRING_NPC") && ctx.hasCanonReferences) return "LIGHT";
  if ((ctx.shotType === "closeup" || ctx.shotType === "extreme_closeup") && ctx.characterCountInScene > 0) return "STRONG";
  if (ctx.characterCountInScene > 0 && ctx.hasCanonReferences) return "LIGHT";
  return "NONE";
}

export function computeSceneComplexityScore(ctx: RoutingContext) {
  let score = 0;
  score += Math.max(0, ctx.characterCountInScene - 1) * 16;
  score += (ctx.npcCount ?? 0) > 0 || ctx.hasNpcGroup ? 14 : 0;
  score += (ctx.creatureCount ?? 0) > 0 || ctx.hasCreatureGroup ? 12 : 0;
  score += ctx.environmentPriority === "high" ? 22 : ctx.environmentPriority === "medium" ? 10 : 0;
  score += ctx.shotType === "wide" ? 18 : ctx.shotType === "over_shoulder" ? 10 : 0;
  score += ctx.cameraAngle && ctx.cameraAngle !== "eye_level" ? 6 : 0;
  score += ctx.locationComplexity ?? 0;
  score += ctx.environmentDensityRequired === "high" ? 12 : ctx.environmentDensityRequired === "medium" ? 6 : 0;
  score += Math.round((ctx.continuityWeight ?? 0) * 0.2);
  score += ctx.styleBackgroundDensity === "high" ? 8 : ctx.styleBackgroundDensity === "medium" ? 4 : 0;
  return clamp(score, 0, 100);
}

export function computeFalSceneAssessment(ctx: RoutingContext): FalSceneAssessment {
  const sceneText = `${ctx.scenePurpose ?? ""} ${ctx.purpose ?? ""}`.toLowerCase();
  const sceneComplexityScore = computeSceneComplexityScore(ctx);
  const heroPresent =
    ctx.heroPresent === true
    || (ctx.panelCharacterRoles ?? []).some(isHeroRole);
  const heroFocus =
    ctx.heroFocus === true
    || (heroPresent && (ctx.shotType === "closeup" || ctx.shotType === "extreme_closeup"));
  const environmentCritical = Boolean(
    ctx.shotType === "wide"
    || ctx.purpose === "establishing"
    || ctx.environmentPriority === "high"
    || ctx.environmentDensityRequired === "high"
    || (ctx.locationComplexity ?? 0) >= 16,
  );
  const crowdCritical = Boolean(
    (ctx.npcCount ?? 0) > 0
    || (ctx.creatureCount ?? 0) > 0
    || ctx.hasNpcGroup
    || ctx.hasCreatureGroup,
  );
  const interactionCritical = Boolean(
    ctx.characterCountInScene >= 2
    || /interaction|dialogue|confrontation|humiliation|bullying|social/i.test(`${ctx.scenePurpose ?? ""} ${ctx.purpose ?? ""}`),
  );
  const continuityCritical = Boolean(
    ctx.hasCanonReferences
    || (ctx.continuityWeight ?? 0) >= 55
    || ctx.characterCountInScene > 0,
  );

  let panelCategory: FalPanelCategory = "CHARACTER_IN_SCENE";
  if (ctx.mode === "CHARACTER_SHEET" || ctx.mode === "CHARACTER_EXPRESSION_SET") {
    panelCategory = "CHARACTER_LOCK";
  } else if (ctx.needsInpaint || ctx.mode === "INPAINT_FIX" || ctx.needsPoseVariation || ctx.mode === "POSE_LOCK_VARIATION") {
    panelCategory = "LOCAL_FIX";
  } else if (ctx.subjectFocus === "environment" || ctx.subjectFocus === "aftermath") {
    panelCategory = "ESTABLISHING_ENVIRONMENT";
  } else if (ctx.subjectFocus === "npc" || ctx.subjectFocus === "enemy" || ctx.subjectFocus === "group") {
    panelCategory = "CHARACTER_IN_SCENE";
  } else if (ctx.subjectFocus === "hero") {
    panelCategory = "CHARACTER_LOCK";
  } else if (environmentCritical || ctx.purpose === "establishing") {
    panelCategory = "ESTABLISHING_ENVIRONMENT";
  } else if (crowdCritical) {
    panelCategory = "CHARACTER_IN_SCENE";
  }

  const sceneArchetype: FalBenchmarkSceneId | "generic" =
    /lycée|lycee|school|campus|humiliation|bullying/.test(sceneText)
      ? "school_bullying"
      : /ruelle|alley|neon|pnj|passant/.test(sceneText)
        ? "urban_alley_npc"
        : /garden|jardin|romantic|romance/.test(sceneText)
          ? "romantic_garden"
          : /laboratoire|laboratory|lab/.test(sceneText)
            ? "abandoned_lab"
            : /post-apo|post apo|ruin|wasteland/.test(sceneText)
              ? "post_apo_establishing"
              : /duo émotionnel|duo emotionnel|confession|intime/.test(sceneText)
                ? "emotional_duo"
                : /action|combat|arène|arena|group/.test(sceneText)
                  ? "action_group"
                  : /faceoff|confrontation|décor fort|decor/.test(sceneText)
                    ? "faceoff_strong_decor"
                    : "generic";

  let referencePolicy: ReferencePolicy = "LIGHT";
  if (panelCategory === "CHARACTER_LOCK") referencePolicy = "STRONG";
  else if (panelCategory === "ESTABLISHING_ENVIRONMENT") referencePolicy = environmentCritical ? "NONE" : "LIGHT";
  else if (panelCategory === "LOCAL_FIX") referencePolicy = continuityCritical ? "STRONG" : "LIGHT";

  const benchmarkBaseline = sceneArchetype !== "generic" ? FAL_STRATEGY_BASELINES[sceneArchetype] : null;
  if (benchmarkBaseline && panelCategory !== "CHARACTER_LOCK" && panelCategory !== "LOCAL_FIX") {
    referencePolicy = benchmarkBaseline.referencePolicy;
  }

  const minimumReferencePolicy = resolveMinimumReferencePolicy({
    ...ctx,
    heroPresent,
    heroFocus,
  });
  if (minimumReferencePolicy === "STRONG") {
    referencePolicy = "STRONG";
  } else if (minimumReferencePolicy === "LIGHT" && referencePolicy === "NONE") {
    referencePolicy = "LIGHT";
  }

  if (heroFocus && panelCategory !== "LOCAL_FIX") {
    panelCategory = "CHARACTER_LOCK";
  }

  return {
    sceneArchetype,
    panelCategory,
    referencePolicy,
    sceneComplexityScore,
    environmentCritical,
    continuityCritical,
    crowdCritical,
    interactionCritical,
    retryPolicy: sceneComplexityScore >= 55 || environmentCritical ? "robust" : "standard",
    sizePreset:
      panelCategory === "CHARACTER_LOCK"
        ? "character_ref"
        : panelCategory === "ESTABLISHING_ENVIRONMENT"
          ? "panel_establishing"
          : panelCategory === "LOCAL_FIX"
            ? "reroll_local"
            : "panel_story",
  };
}
