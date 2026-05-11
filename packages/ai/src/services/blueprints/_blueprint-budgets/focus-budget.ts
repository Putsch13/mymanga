/**
 * `computeChapterFocusBudget` — distribution des focus / cadrages d'un chapitre
 * et violations associées (héros overload, environnement manquant, ennemi
 * oublié, foule absente, establishing manquant, monotonie de plans…).
 */
import type {
  ChapterFocusBudget,
  FocusBudgetViolation,
  PanelBlueprintPremium,
  SubjectFocus,
} from "@manga-ai-studio/core";
import { MANGA_SHOT_BUDGET } from "@manga-ai-studio/core";

export function computeChapterFocusBudget(
  blueprints: PanelBlueprintPremium[],
): ChapterFocusBudget {
  const total = blueprints.length;
  if (total === 0) {
    return {
      totalPanels: 0,
      heroCenterRatio: 0,
      focusDistribution: {} as Record<SubjectFocus, number>,
      shotDistribution: {},
      cutawayCount: 0,
      cutawayRatio: 0,
      heroFocusPanels: 0,
      enemyFocusPanels: 0,
      propInsertPanels: 0,
      environmentPanels: 0,
      reactionPanels: 0,
      speakerPanels: 0,
      groupPanels: 0,
      cutawayPanels: 0,
      npcPanels: 0,
      violations: [],
    };
  }

  const focusCounts: Partial<Record<SubjectFocus, number>> = {};
  const shotCounts: Record<string, number> = {};
  let heroCenterCount = 0;
  let cutawayCount = 0;
  let enemyFocusCount = 0;
  let propInsertCount = 0;
  let environmentCount = 0;
  let npcCount = 0;
  let reactionCount = 0;
  let speakerCount = 0;
  let groupCount = 0;

  for (const bp of blueprints) {
    focusCounts[bp.subjectFocus] = (focusCounts[bp.subjectFocus] ?? 0) + 1;
    shotCounts[bp.shotType] = (shotCounts[bp.shotType] ?? 0) + 1;

    if (bp.heroCenterAllowed && bp.subjectFocus === "hero") heroCenterCount++;
    if (bp.cutawayType !== "none") cutawayCount++;
    if (
      bp.subjectFocus === "enemy" ||
      (bp.subjectFocus === "visual_entity" && bp.mustShowEnemy)
    ) {
      enemyFocusCount++;
    }
    if (bp.subjectFocus === "prop" || bp.cutawayType === "prop_insert") {
      propInsertCount++;
    }
    if (bp.subjectFocus === "environment") environmentCount++;
    // P1.6 : un panel ne compte comme couverture NPC que si son focus l'est
    // réellement (subjectFocus=npc|group|visual_entity sans ennemi).
    if (
      bp.subjectFocus === "npc" ||
      bp.subjectFocus === "group" ||
      (bp.subjectFocus === "visual_entity" && !bp.mustShowEnemy)
    ) {
      npcCount++;
    }
    if (bp.subjectFocus === "reaction") reactionCount++;
    if (bp.subjectFocus === "speaker" || bp.dialogueCarrier === "speaker_visible") {
      speakerCount++;
    }
    if (bp.subjectFocus === "group" || bp.subjectFocus === "duo") groupCount++;
  }

  const heroCenterRatio = heroCenterCount / total;
  const cutawayRatio = cutawayCount / total;
  const violations: FocusBudgetViolation[] = [];

  // BUG-03 fix : aligner le seuil sur MANGA_SHOT_BUDGET (packages/core)
  if (heroCenterRatio > MANGA_SHOT_BUDGET.MAX_HERO_CENTER_RATIO) {
    violations.push({
      type: "hero_overload",
      message: `${Math.round(heroCenterRatio * 100)}% des panels sont centrés héros (max recommandé : ${Math.round(MANGA_SHOT_BUDGET.MAX_HERO_CENTER_RATIO * 100)}%)`,
      severity:
        heroCenterRatio >= MANGA_SHOT_BUDGET.HERO_CENTER_FAIL_RATIO
          ? "blocking"
          : "warning",
    });
  }

  if (environmentCount === 0) {
    violations.push({
      type: "missing_environment",
      message: "Aucun panel environnement/décor dans le chapitre",
      severity: "blocking",
    });
  }

  const hasEnemyObligation = blueprints.some((bp) => bp.mustShowEnemy);
  if (hasEnemyObligation && enemyFocusCount === 0) {
    violations.push({
      type: "missing_enemy_focus",
      message: "Un ennemi est obligatoire mais aucun panel ne le met au focus",
      severity: "blocking",
    });
  }

  const hasMandatoryProp = blueprints.some((bp) =>
    bp.requiredProps.some((p) => p.mustBeVisible === true),
  );
  if (hasMandatoryProp && propInsertCount === 0) {
    violations.push({
      type: "missing_prop_insert",
      message:
        "Des props obligatoires (visibles) sont présents mais aucun panel prop/insert n'est prévu",
      severity: "warning",
    });
  }

  // P1.5 — arme/objet narratif critique requiert un insert dur.
  const hasMustBeVisibleProp = blueprints.some(
    (bp) =>
      Array.isArray(bp.requiredProps) &&
      bp.requiredProps.some((p) => p.mustBeVisible === true),
  );
  const hasPropInsertTarget = blueprints.some(
    (bp) => bp.subjectFocus === "prop" || bp.cutawayType === "prop_insert",
  );
  if (hasMustBeVisibleProp && !hasPropInsertTarget) {
    violations.push({
      type: "missing_weapon_insert",
      message:
        "Une arme/objet narratif (mustBeVisible) est présent mais aucun panel ne lui est dédié en insert.",
      severity: "blocking",
    });
  }

  // P1.6 — obligation foule/PNJ exige une couverture réelle.
  const hasNpcObligation = blueprints.some(
    (bp) =>
      bp.requiredNpcCount > 0 ||
      bp.subjectFocus === "npc" ||
      bp.subjectFocus === "group",
  );
  if (hasNpcObligation && npcCount === 0) {
    violations.push({
      type: "missing_npc_population",
      message:
        "Une scène de foule/PNJ est attendue mais aucun panel ne la met en scène.",
      severity: "blocking",
    });
  }

  // P1.7 — establishing shot manquant pour un chapitre multi-lieux.
  const distinctLocations = new Set<string>();
  for (const bp of blueprints) {
    for (const signal of bp.requiredLocationSignals ?? []) {
      if (typeof signal === "string" && signal.trim().length > 0) {
        distinctLocations.add(signal.trim().toLowerCase());
      }
    }
  }
  const establishingShots = blueprints.filter(
    (bp) => bp.subjectFocus === "environment" && bp.shotType === "wide",
  ).length;
  if (distinctLocations.size >= 2 && establishingShots === 0) {
    violations.push({
      type: "missing_environment_establishing",
      message: `${distinctLocations.size} lieux sont mentionnés mais aucun plan d'établissement (wide + environment) n'est prévu.`,
      severity: "warning",
    });
  }

  if (cutawayCount === 0 && total > 3) {
    violations.push({
      type: "no_cutaway",
      message: "Aucun plan de coupe dans le chapitre",
      severity: "warning",
    });
  }

  const uniqueShots = Object.keys(shotCounts).length;
  if (uniqueShots < 3 && total >= 4) {
    violations.push({
      type: "shot_monotony",
      message: `Seulement ${uniqueShots} types de cadrage différents (min recommandé : 3)`,
      severity: "warning",
    });
  }

  return {
    totalPanels: total,
    heroCenterRatio,
    focusDistribution: focusCounts as Record<SubjectFocus, number>,
    shotDistribution: shotCounts,
    cutawayCount,
    cutawayRatio,
    heroFocusPanels: heroCenterCount,
    enemyFocusPanels: enemyFocusCount,
    propInsertPanels: propInsertCount,
    environmentPanels: environmentCount,
    reactionPanels: reactionCount,
    speakerPanels: speakerCount,
    groupPanels: groupCount,
    cutawayPanels: cutawayCount,
    npcPanels: npcCount,
    violations,
  };
}
