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

/**
 * P0.4 — La policy de référence minimale doit respecter le `subjectFocus`.
 *
 * Règles :
 *   - `hero`                               → STRONG autorisé
 *   - `npc` / `important_npc` / `enemy` /
 *     `reaction` / `prop` / `environment` /
 *     `aftermath` / `group`                → plafonné à LIGHT (jamais STRONG)
 *   - close-up sans focus explicite        → STRONG uniquement si le seul
 *                                            sujet probable est le héros
 *
 * La simple présence du héros ne force plus STRONG : auparavant, un close-up
 * ennemi "avec héros dans le cast" recevait la référence canonique du héros
 * (LoRA + canon ref) ce qui faisait un rendu "hero portrait" au lieu d'un
 * rendu ennemi.
 */
function resolveMinimumReferencePolicy(ctx: RoutingContext): ReferencePolicy {
  const explicitNonHeroFocus =
    ctx.subjectFocus === "npc"
    || ctx.subjectFocus === "important_npc"
    || ctx.subjectFocus === "enemy"
    || ctx.subjectFocus === "antagonist"
    || ctx.subjectFocus === "group"
    || ctx.subjectFocus === "environment"
    || ctx.subjectFocus === "aftermath"
    || ctx.subjectFocus === "prop"
    || ctx.subjectFocus === "reaction";

  // P1.3 — `dominantSubject` complète `subjectFocus`. Un panel dont le sujet
  // dominant est clairement non-héros (inféré depuis le cast) ne doit pas
  // passer STRONG même sans subjectFocus explicite.
  const dom = ctx.dominantSubject;
  const domIsNonHeroCharacter = dom
    && dom.characterIndex !== null
    && (dom.kind === "enemy" || dom.kind === "ally" || dom.kind === "npc" || dom.kind === "reaction");
  const domIsEnvOrProp = dom && (dom.kind === "environment" || dom.kind === "prop" || dom.kind === "aftermath");
  const domIsGroup = dom && dom.kind === "group";

  // Focus explicite non-héros → le héros n'a pas voix au chapitre, on ne
  // peut pas revenir à STRONG juste parce qu'il est présent dans la scène.
  if (explicitNonHeroFocus || domIsNonHeroCharacter || domIsEnvOrProp || domIsGroup) {
    if (
      ctx.subjectFocus === "environment"
      || ctx.subjectFocus === "prop"
      || domIsEnvOrProp
    ) {
      return ctx.hasCanonReferences ? "LIGHT" : "NONE";
    }
    if ((ctx.panelCharacterImportanceTiers ?? []).includes("SECONDARY_CORE")) return "LIGHT";
    if ((ctx.panelCharacterImportanceTiers ?? []).includes("IMPORTANT_SUPPORTING_CHARACTER")) return "LIGHT";
    if (ctx.hasCanonReferences) return "LIGHT";
    return "NONE";
  }

  if (ctx.heroFocus) return "STRONG";
  if (dom && dom.kind === "hero") return "STRONG";
  if ((ctx.panelCharacterImportanceTiers ?? []).includes("SECONDARY_CORE")) return "STRONG";
  if ((ctx.panelCharacterImportanceTiers ?? []).includes("IMPORTANT_SUPPORTING_CHARACTER")) return "LIGHT";
  if ((ctx.panelCharacterImportanceTiers ?? []).includes("RECURRING_NPC") && ctx.hasCanonReferences) return "LIGHT";
  // Close-up sans focus déclaré : STRONG uniquement si le héros est présent
  // ET qu'il est bien le seul personnage du panel (sinon c'est probablement
  // le focus d'un autre personnage).
  if (
    (ctx.shotType === "closeup" || ctx.shotType === "extreme_closeup")
    && ctx.characterCountInScene === 1
    && ctx.heroPresent
  ) {
    return "STRONG";
  }
  if (ctx.heroPresent) return "LIGHT";
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
  // P0.4 — `heroFocus` n'est plus déduit de `heroPresent && closeup`.
  // On respecte la valeur fournie par `buildRoutingContext`, qui est elle-même
  // alignée sur le `subjectFocus` du blueprint (voir pipeline-scene-builder).
  // Un close-up sur un NPC avec le héros présent ne doit plus être reclassé
  // implicitement en hero focus.
  const explicitNonHeroFocus =
    ctx.subjectFocus === "npc"
    || ctx.subjectFocus === "important_npc"
    || ctx.subjectFocus === "enemy"
    || ctx.subjectFocus === "antagonist"
    || ctx.subjectFocus === "group"
    || ctx.subjectFocus === "environment"
    || ctx.subjectFocus === "aftermath"
    || ctx.subjectFocus === "prop"
    || ctx.subjectFocus === "reaction";
  // P0.1 (sprint 5) — un `cutawayType` explicite non-héros prime sur toute
  // déduction héros, même si `subjectFocus` n'est pas renseigné et qu'un héros
  // est présent dans la scène.
  const cutawayForcesNonHero =
    ctx.cutawayType === "environment"
    || ctx.cutawayType === "environment_establishing"
    || ctx.cutawayType === "location_transition"
    || ctx.cutawayType === "prop_insert"
    || ctx.cutawayType === "object_insert"
    || ctx.cutawayType === "aftermath"
    || ctx.cutawayType === "movement_trace"
    || ctx.cutawayType === "reaction"
    || ctx.cutawayType === "reaction_insert"
    || ctx.cutawayType === "crowd"
    || ctx.cutawayType === "npc_group"
    || ctx.cutawayType === "surveillance"
    || ctx.cutawayType === "threat_insert";
  // P1.3 — `dominantSubject` est consulté en complément. Un panel avec sujet
  // dominant non-héros (inféré) ne doit pas être verrouillé héros non plus.
  const dom = ctx.dominantSubject;
  const domForcesNonHero =
    dom !== undefined
    && dom.kind !== "hero"
    && dom.kind !== "none";
  const heroFocus =
    ctx.heroFocus === true
    && !explicitNonHeroFocus
    && !domForcesNonHero
    && !cutawayForcesNonHero;
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
  // P0.1 (sprint 5) — cutawayType explicite : les cutaways décor / prop /
  // aftermath ne doivent jamais devenir CHARACTER_LOCK, même en présence du
  // héros dans la scène. On range ces cutaways en ESTABLISHING_ENVIRONMENT
  // (pour que la policy de référence soit gérée via l'environnement), et les
  // cutaways reaction/crowd/npc_group en CHARACTER_IN_SCENE (présence de
  // personnages mais pas lockés sur le héros).
  const cutawayIsEnvLike =
    ctx.cutawayType === "environment"
    || ctx.cutawayType === "environment_establishing"
    || ctx.cutawayType === "location_transition"
    || ctx.cutawayType === "aftermath"
    || ctx.cutawayType === "movement_trace"
    || ctx.cutawayType === "prop_insert"
    || ctx.cutawayType === "object_insert";
  const cutawayIsCharInScene =
    ctx.cutawayType === "reaction"
    || ctx.cutawayType === "reaction_insert"
    || ctx.cutawayType === "crowd"
    || ctx.cutawayType === "npc_group"
    || ctx.cutawayType === "surveillance"
    || ctx.cutawayType === "threat_insert";
  if (ctx.mode === "CHARACTER_SHEET" || ctx.mode === "CHARACTER_EXPRESSION_SET") {
    panelCategory = "CHARACTER_LOCK";
  } else if (ctx.needsInpaint || ctx.mode === "INPAINT_FIX" || ctx.needsPoseVariation || ctx.mode === "POSE_LOCK_VARIATION") {
    panelCategory = "LOCAL_FIX";
  } else if (cutawayIsEnvLike) {
    panelCategory = "ESTABLISHING_ENVIRONMENT";
  } else if (cutawayIsCharInScene) {
    panelCategory = "CHARACTER_IN_SCENE";
  } else if (ctx.subjectFocus === "environment" || ctx.subjectFocus === "aftermath") {
    panelCategory = "ESTABLISHING_ENVIRONMENT";
  } else if (
    ctx.subjectFocus === "npc"
    || ctx.subjectFocus === "important_npc"
    || ctx.subjectFocus === "enemy"
    || ctx.subjectFocus === "antagonist"
    || ctx.subjectFocus === "group"
  ) {
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

  // Ne pas écraser en CHARACTER_LOCK si le subjectFocus est explicitement non-héros
  // (NPC/ennemi/groupe/environnement/prop/reaction/aftermath). `heroFocus` est
  // déjà neutralisé plus haut si un focus non-héros est déclaré, mais on garde
  // la garde explicite par sécurité. Un cutaway explicite non-héros doit aussi
  // bloquer la promotion finale en CHARACTER_LOCK (P0.1 sprint 5).
  if (
    heroFocus
    && panelCategory !== "LOCAL_FIX"
    && !explicitNonHeroFocus
    && !cutawayForcesNonHero
  ) {
    panelCategory = "CHARACTER_LOCK";
  }

  console.log(`[fal:routing] panel=${ctx.purpose ?? "unknown"} subjectFocus=${ctx.subjectFocus ?? "none"} crowd=${crowdCritical} env=${environmentCritical} → ${panelCategory}`);

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
