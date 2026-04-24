/**
 * Budgets et adequations contractuelles calcules sur une liste de blueprints.
 *
 * Regroupe les analyses "read-only" :
 *   - computeChapterFocusBudget      : distribution focus + violations
 *   - computeShotVarietyBudget       : variete de CADRAGES
 *   - computeCutawayBudget           : qualite des plans de coupe
 *   - computeContractualFocusAdequacy: variete de SUJETS (hero vs env/npc/prop)
 *   - computePremiumReadinessScore   : score synthetique [0..1]
 *
 * Extrait de `panel-blueprint-builder.ts` dans le Sprint C.
 */

import type {
  PanelBlueprintPremium,
  SubjectFocus,
  ChapterFocusBudget,
  FocusBudgetViolation,
} from "@manga-ai-studio/core";
import { MANGA_SHOT_BUDGET } from "@manga-ai-studio/core";

// ─── Focus Budget ─────────────────────────────────────────────────────────────

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
    if (bp.subjectFocus === "enemy" || (bp.subjectFocus === "visual_entity" && bp.mustShowEnemy)) {
      enemyFocusCount++;
    }
    if (bp.subjectFocus === "prop" || bp.cutawayType === "prop_insert") propInsertCount++;
    if (bp.subjectFocus === "environment") environmentCount++;
    // P1.6 : un panel compte comme couverture NPC seulement si son focus l'est
    // reellement (subjectFocus=npc|group). Un blueprint heros avec
    // `requiredNpcCount>0` exprime une obligation, pas une satisfaction.
    if (bp.subjectFocus === "npc" || bp.subjectFocus === "group" || (bp.subjectFocus === "visual_entity" && !bp.mustShowEnemy)) {
      npcCount++;
    }
    if (bp.subjectFocus === "reaction") reactionCount++;
    if (bp.subjectFocus === "speaker" || bp.dialogueCarrier === "speaker_visible") speakerCount++;
    if (bp.subjectFocus === "group" || bp.subjectFocus === "duo") groupCount++;
  }

  const heroCenterRatio = heroCenterCount / total;
  const cutawayRatio = cutawayCount / total;

  const violations: FocusBudgetViolation[] = [];

  // BUG-03 fix : aligner le seuil sur MANGA_SHOT_BUDGET (packages/core)
  //   - MAX_HERO_CENTER_RATIO (0.30) -> warning
  //   - HERO_CENTER_FAIL_RATIO (0.70) -> blocking
  if (heroCenterRatio > MANGA_SHOT_BUDGET.MAX_HERO_CENTER_RATIO) {
    violations.push({
      type: "hero_overload",
      message: `${Math.round(heroCenterRatio * 100)}% des panels sont centrés héros (max recommandé : ${Math.round(MANGA_SHOT_BUDGET.MAX_HERO_CENTER_RATIO * 100)}%)`,
      severity: heroCenterRatio >= MANGA_SHOT_BUDGET.HERO_CENTER_FAIL_RATIO ? "blocking" : "warning",
    });
  }

  // Regle : au moins 1 panel environnement par chapitre
  if (environmentCount === 0) {
    violations.push({
      type: "missing_environment",
      message: "Aucun panel environnement/décor dans le chapitre",
      severity: "blocking",
    });
  }

  // Regle : au moins 1 panel ennemi si ennemi present
  const hasEnemyObligation = blueprints.some((bp) => bp.mustShowEnemy);
  if (hasEnemyObligation && enemyFocusCount === 0) {
    violations.push({
      type: "missing_enemy_focus",
      message: "Un ennemi est obligatoire mais aucun panel ne le met au focus",
      severity: "blocking",
    });
  }

  // Regle : au moins 1 prop insert si prop obligatoire
  const hasMandatoryProp = blueprints.some((bp) => bp.requiredProps.length > 0);
  if (hasMandatoryProp && propInsertCount === 0) {
    violations.push({
      type: "missing_prop_insert",
      message: "Des props obligatoires sont présents mais aucun panel prop/insert n'est prévu",
      severity: "warning",
    });
  }

  // P1.5 : arme / objet narratif critique (mustBeVisible === true) — exige
  // un insert fort (subjectFocus=prop OU cutawayType=prop_insert).
  const hasMustBeVisibleProp = blueprints.some(
    (bp) => Array.isArray(bp.requiredProps) && bp.requiredProps.some((p) => p.mustBeVisible === true),
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

  // P1.6 : si au moins un blueprint porte une obligation foule/PNJ, au moins
  // un panel doit reellement couvrir cette foule.
  const hasNpcObligation = blueprints.some(
    (bp) => bp.requiredNpcCount > 0 || bp.subjectFocus === "npc" || bp.subjectFocus === "group",
  );
  if (hasNpcObligation && npcCount === 0) {
    violations.push({
      type: "missing_npc_population",
      message:
        "Une scène de foule/PNJ est attendue mais aucun panel ne la met en scène.",
      severity: "blocking",
    });
  }

  // P1.7 : establishing shot manquant pour un chapitre multi-lieux. Soft
  // (warning) pour ne pas bloquer les chapitres huis-clos.
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
      message:
        `${distinctLocations.size} lieux sont mentionnés mais aucun plan d'établissement (wide + environment) n'est prévu.`,
      severity: "warning",
    });
  }

  // Regle : au moins un cutaway
  if (cutawayCount === 0 && total > 3) {
    violations.push({
      type: "no_cutaway",
      message: "Aucun plan de coupe dans le chapitre",
      severity: "warning",
    });
  }

  // Regle : variete de plans
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

// ─── Shot Variety Budget ──────────────────────────────────────────────────────

export interface ShotVarietyReport {
  hasWide: boolean;
  hasMedium: boolean;
  hasCloseup: boolean;
  hasInsert: boolean;
  hasOverShoulder: boolean;
  varietyScore: number;
  missingShots: string[];
}

export function computeShotVarietyBudget(
  blueprints: PanelBlueprintPremium[],
): ShotVarietyReport {
  const shots = new Set(blueprints.map((bp) => bp.shotType));
  const hasWide = shots.has("wide");
  const hasMedium = shots.has("medium");
  const hasCloseup = shots.has("closeup") || shots.has("extreme_closeup");
  const hasInsert = blueprints.some((bp) => bp.cutawayType === "prop_insert");
  const hasOverShoulder = shots.has("over_shoulder");

  const present = [hasWide, hasMedium, hasCloseup, hasInsert, hasOverShoulder].filter(Boolean).length;
  const varietyScore = present / 5;

  const missingShots: string[] = [];
  if (!hasWide) missingShots.push("wide");
  if (!hasMedium) missingShots.push("medium");
  if (!hasCloseup) missingShots.push("closeup");
  if (!hasInsert) missingShots.push("insert");
  if (!hasOverShoulder) missingShots.push("over_shoulder");

  return { hasWide, hasMedium, hasCloseup, hasInsert, hasOverShoulder, varietyScore, missingShots };
}

// ─── Cutaway Budget ───────────────────────────────────────────────────────────

export interface CutawayBudgetReport {
  totalCutaways: number;
  cutawayRatio: number;
  hasEnvironmentCutaway: boolean;
  hasEnemyCutaway: boolean;
  hasPropInsert: boolean;
  hasReactionCutaway: boolean;
  meetsMinimum: boolean;
  recommendations: string[];
}

export function computeCutawayBudget(
  blueprints: PanelBlueprintPremium[],
): CutawayBudgetReport {
  const total = blueprints.length;
  const cutaways = blueprints.filter((bp) => bp.cutawayType !== "none");
  const cutawayRatio = total > 0 ? cutaways.length / total : 0;

  const hasEnvironmentCutaway = cutaways.some((bp) => bp.cutawayType === "environment");
  const hasEnemyCutaway = cutaways.some((bp) => bp.cutawayType === "enemy");
  const hasPropInsert = cutaways.some((bp) => bp.cutawayType === "prop_insert");
  const hasReactionCutaway = cutaways.some((bp) => bp.cutawayType === "reaction");

  const meetsMinimum = cutawayRatio >= 0.2 && hasEnvironmentCutaway;

  const recommendations: string[] = [];
  if (!hasEnvironmentCutaway) recommendations.push("Ajouter au moins un plan décor/environnement");
  if (!hasEnemyCutaway && blueprints.some((bp) => bp.mustShowEnemy)) {
    recommendations.push("Ajouter un plan ennemi (mustShowEnemy détecté)");
  }
  if (!hasPropInsert && blueprints.some((bp) => bp.requiredProps.length > 0)) {
    recommendations.push("Ajouter un insert prop (props obligatoires détectés)");
  }
  if (!hasReactionCutaway && total > 4) {
    recommendations.push("Ajouter un plan de réaction pour équilibrer");
  }

  return {
    totalCutaways: cutaways.length,
    cutawayRatio,
    hasEnvironmentCutaway,
    hasEnemyCutaway,
    hasPropInsert,
    hasReactionCutaway,
    meetsMinimum,
    recommendations,
  };
}

// ─── Contractual Focus Adequacy (P1.3 + P3.1) ────────────────────────────────

/**
 * P3.1 — `computeShotVarietyBudget` mesure la variete des CADRAGES mais ignore
 * la variete des SUJETS. Un chapitre peut avoir wide/medium/closeup/insert
 * varies tout en restant 100% heros-centre. Cette fonction scrute explicitement
 * les inserts contractuels (arme, decor, PNJ, ennemi, aftermath, reaction)
 * pour bloquer ce biais.
 *
 * Score = nombre de contrats respectes / total des contrats actifs.
 * `blocking = true` si au moins un contrat dur (enemy, props, env) est casse.
 */
export interface ContractualFocusAdequacyReport {
  score: number;
  environmentPanels: number;
  propInsertPanels: number;
  enemyFocusPanels: number;
  npcPanels: number;
  reactionPanels: number;
  aftermathPanels: number;
  heroCenterRatio: number;
  violations: Array<{
    type:
      | "missing_environment"
      | "missing_enemy_focus"
      | "missing_prop_insert"
      | "missing_npc_population"
      | "hero_overload_vs_contract";
    message: string;
    severity: "warning" | "blocking";
  }>;
  blocking: boolean;
}

export function computeContractualFocusAdequacy(
  blueprints: PanelBlueprintPremium[],
): ContractualFocusAdequacyReport {
  const total = blueprints.length;
  if (total === 0) {
    return {
      score: 0,
      environmentPanels: 0,
      propInsertPanels: 0,
      enemyFocusPanels: 0,
      npcPanels: 0,
      reactionPanels: 0,
      aftermathPanels: 0,
      heroCenterRatio: 0,
      violations: [],
      blocking: false,
    };
  }

  let environmentPanels = 0;
  let propInsertPanels = 0;
  let enemyFocusPanels = 0;
  let npcPanels = 0;
  let reactionPanels = 0;
  let aftermathPanels = 0;
  let heroCenterCount = 0;

  let hasEnemyObligation = false;
  let hasMandatoryProp = false;
  let hasNpcObligation = false;

  for (const bp of blueprints) {
    if (bp.subjectFocus === "environment") environmentPanels++;
    if (bp.subjectFocus === "prop" || bp.cutawayType === "prop_insert") propInsertPanels++;
    if (bp.subjectFocus === "enemy" || (bp.subjectFocus === "visual_entity" && bp.mustShowEnemy)) {
      enemyFocusPanels++;
    }
    if (
      bp.subjectFocus === "npc"
      || bp.subjectFocus === "group"
      || (bp.subjectFocus === "visual_entity" && !bp.mustShowEnemy)
      || bp.requiredNpcCount > 0
    ) {
      npcPanels++;
    }
    if (bp.subjectFocus === "reaction") reactionPanels++;
    if (bp.subjectFocus === "aftermath") aftermathPanels++;
    if (bp.heroCenterAllowed && bp.subjectFocus === "hero") heroCenterCount++;

    if (bp.mustShowEnemy) hasEnemyObligation = true;
    if (bp.requiredProps && bp.requiredProps.length > 0) hasMandatoryProp = true;
    if (bp.requiredNpcCount > 0) hasNpcObligation = true;
  }

  const heroCenterRatio = heroCenterCount / total;
  const violations: ContractualFocusAdequacyReport["violations"] = [];

  if (environmentPanels === 0 && total > 3) {
    violations.push({
      type: "missing_environment",
      message: "Aucun panel environnement/décor n'est prévu pour ce chapitre.",
      severity: "blocking",
    });
  }
  if (hasEnemyObligation && enemyFocusPanels === 0) {
    violations.push({
      type: "missing_enemy_focus",
      message: "Un ennemi est obligatoire mais aucun panel ne le met au focus.",
      severity: "blocking",
    });
  }
  if (hasMandatoryProp && propInsertPanels === 0) {
    violations.push({
      type: "missing_prop_insert",
      message: "Un prop/arme obligatoire est présent mais jamais dédié à un insert.",
      severity: "blocking",
    });
  }
  if (hasNpcObligation && npcPanels === 0) {
    violations.push({
      type: "missing_npc_population",
      message: "Une scène de foule/PNJ est attendue mais aucun panel ne la couvre.",
      severity: "blocking",
    });
  }
  if (heroCenterRatio > MANGA_SHOT_BUDGET.HERO_CENTER_FAIL_RATIO) {
    violations.push({
      type: "hero_overload_vs_contract",
      message:
        `${Math.round(heroCenterRatio * 100)}% des panels sont centrés héros — ` +
        `le plan est trop égocentré pour laisser vivre le décor / PNJ / inserts.`,
      severity: "blocking",
    });
  }

  const totalContracts = [
    hasEnemyObligation,
    hasMandatoryProp,
    hasNpcObligation,
    true, // environment target — toujours attendu
    true, // hero-ratio — toujours attendu
  ].filter(Boolean).length;
  const respectedContracts = totalContracts - violations.filter((v) => v.severity === "blocking").length;
  const score = totalContracts > 0 ? Math.max(0, Math.min(1, respectedContracts / totalContracts)) : 1;

  return {
    score,
    environmentPanels,
    propInsertPanels,
    enemyFocusPanels,
    npcPanels,
    reactionPanels,
    aftermathPanels,
    heroCenterRatio,
    violations,
    blocking: violations.some((v) => v.severity === "blocking"),
  };
}

// ─── Score de premium readiness ───────────────────────────────────────────────

/**
 * P2.15 — Score de préparation premium honnête.
 *
 * Pénalités appliquées :
 *   - violations bloquantes (-15% chacune)
 *   - violations warnings (-5% chacune)
 *   - cutawayRatio > 35% (-10% + 5% par 10% supplémentaire)
 *   - locationName unknown > 20% (-10%)
 *   - dialogueCarrier floating > 30% (-5%)
 *   - pas de character ref (hero) visible (-15%)
 *
 * Bonus :
 *   - variété de shots (+10% max)
 *   - cutaways présents (+5%)
 */
export function computePremiumReadinessScore(
  blueprints: PanelBlueprintPremium[],
): number {
  if (blueprints.length === 0) return 0;

  const budget = computeChapterFocusBudget(blueprints);
  const shotVariety = computeShotVarietyBudget(blueprints);
  const cutaway = computeCutawayBudget(blueprints);

  let score = 1.0;

  // Pénalités pour violations bloquantes
  const blockingViolations = budget.violations.filter((v) => v.severity === "blocking").length;
  score -= blockingViolations * 0.15;

  // Pénalités pour violations warnings
  const warningViolations = budget.violations.filter((v) => v.severity === "warning").length;
  score -= warningViolations * 0.05;

  // P2.15 — Pénalité pour cutaway ratio excessif (> 35%)
  const MAX_CUTAWAY_RATIO = 0.35;
  if (budget.cutawayRatio > MAX_CUTAWAY_RATIO) {
    score -= 0.10;
    const excessRatio = budget.cutawayRatio - MAX_CUTAWAY_RATIO;
    score -= Math.floor(excessRatio * 10) * 0.05;
  }

  // P2.15 — Pénalité pour locationName unknown trop fréquent
  const unknownLocationPanels = blueprints.filter((bp) => {
    const envDna = bp.environmentVisualDna as { locationName?: string } | null | undefined;
    const locName = envDna?.locationName ?? "unknown";
    return locName.toLowerCase() === "unknown" || locName.toLowerCase() === "story-consistent setting";
  });
  const unknownLocationRatio = unknownLocationPanels.length / blueprints.length;
  if (unknownLocationRatio > 0.2) {
    score -= 0.10;
  }

  // P2.15 — Pénalité pour dialogueCarrier non ancré trop fréquent
  // offscreen_allowed = locuteur hors champ, narration = pas de dialogue visible
  const floatingDialoguePanels = blueprints.filter(
    (bp) => bp.dialogueCarrier === "offscreen_allowed" || bp.dialogueCarrier === "narration" || !bp.dialogueCarrier,
  );
  const floatingDialogueRatio = floatingDialoguePanels.length / blueprints.length;
  if (floatingDialogueRatio > 0.5) {
    score -= 0.05;
  }

  // P2.15 — Pénalité si aucun panel hero avec character ref
  const heroFocusPanels = blueprints.filter(
    (bp) => bp.subjectFocus === "hero" || bp.subjectFocus === "speaker",
  );
  const heroWithCharacterRef = heroFocusPanels.filter(
    (bp) =>
      (bp.mustShowCharacterIds && bp.mustShowCharacterIds.length > 0) ||
      (bp.requiredCharacterIds && bp.requiredCharacterIds.length > 0) ||
      (bp.characterVisualDna && Array.isArray(bp.characterVisualDna) && bp.characterVisualDna.length > 0),
  );
  if (heroFocusPanels.length > 0 && heroWithCharacterRef.length === 0) {
    score -= 0.15;
  }

  // Bonus variété de plans
  score += shotVariety.varietyScore * 0.1;

  // Bonus cutaways
  if (cutaway.meetsMinimum) score += 0.05;

  return Math.max(0, Math.min(1, score));
}
