import type { PanelBlueprintPremium } from "./types/narrative-facts";

export const MANGA_SHOT_BUDGET = {
  MAX_HERO_CENTER_RATIO: 0.30,
  HERO_CENTER_WARNING_RATIO: 0.60,
  HERO_CENTER_FAIL_RATIO: 0.70,
  MIN_ENVIRONMENT_RATIO: 0.12,
  MIN_NPC_RATIO: 0.10,
  MIN_REACTION_RATIO: 0.08,
  MIN_INSERT_RATIO: 0.06,
  MIN_OTS_RATIO: 0.06,
  MAX_CONSECUTIVE_SAME_SHOT: 3,
  MAX_CONSECUTIVE_HERO_CENTER: 2,
} as const;

export type ShotDiversityReport = {
  valid: boolean;
  heroCenterRatio: number;
  environmentRatio: number;
  npcRatio: number;
  reactionRatio: number;
  insertRatio: number;
  otsRatio: number;
  violations: Array<{
    type: string;
    message: string;
    severity: "warning" | "blocking";
    currentValue: number;
    requiredValue: number;
    affectedPanelIndices: number[];
  }>;
  corrections: Array<{
    panelIndex: number;
    originalSubjectFocus: string;
    newSubjectFocus: string;
    originalShotType: string;
    newShotType: string;
    reason: string;
  }>;
};

export type CoverageMetrics = {
  planned: {
    enemyCoverage: number;
    npcCoverage: number;
    cutawayCoverage: number;
    heroCenterRatio: number;
    environmentRatio: number;
    insertRatio: number;
  };
  rendered: {
    enemyCoverage: number;
    npcCoverage: number;
    cutawayCoverage: number;
    heroCenterRatio: number;
    environmentRatio: number;
    insertRatio: number;
  };
  gaps: Array<{
    metric: string;
    planned: number;
    rendered: number;
    delta: number;
    severity: "ok" | "warning" | "critical";
  }>;
};

export function computePlannedCoverage(
  blueprints: PanelBlueprintPremium[],
): CoverageMetrics["planned"] {
  const total = blueprints.length || 1;
  return {
    enemyCoverage: blueprints.filter(b => b.mustShowEnemy || b.subjectFocus === "enemy").length / total,
    npcCoverage: blueprints.filter(b => b.subjectFocus === "npc" || b.requiredNpcCount > 0).length / total,
    cutawayCoverage: blueprints.filter(b => b.cutawayType !== "none").length / total,
    heroCenterRatio: blueprints.filter(b => b.heroCenterAllowed && b.subjectFocus === "hero").length / total,
    environmentRatio: blueprints.filter(b => b.subjectFocus === "environment" || b.subjectFocus === "aftermath").length / total,
    insertRatio: blueprints.filter(b => b.subjectFocus === "prop" || b.cutawayType === "prop_insert").length / total,
  };
}

export function computeCoverageGaps(
  planned: CoverageMetrics["planned"],
  rendered: CoverageMetrics["rendered"],
): CoverageMetrics["gaps"] {
  const metrics = ["enemyCoverage", "npcCoverage", "cutawayCoverage", "heroCenterRatio", "environmentRatio", "insertRatio"] as const;
  return metrics.map(metric => {
    const delta = planned[metric] - rendered[metric];
    const severity = Math.abs(delta) > 0.15 ? "critical" : Math.abs(delta) > 0.08 ? "warning" : "ok";
    return { metric, planned: planned[metric], rendered: rendered[metric], delta, severity };
  });
}

export type ShotValidationResult = {
  shotId: string;
  requestedShotType: string;
  requestedSubjectFocus: string;
  requiredSubjects: string[];
  passed: boolean;
  failures: string[];
};

export function validateShotCompliance(
  shotId: string,
  blueprint: PanelBlueprintPremium,
  renderedAnalysis: {
    detectedSubjects?: string[];
    detectedShotType?: string;
    hasVisibleEnvironment?: boolean;
    dominantSubject?: string;
  },
): ShotValidationResult {
  const failures: string[] = [];

  if (blueprint.requiredSubjects && blueprint.requiredSubjects.length > 0) {
    const detected = new Set((renderedAnalysis.detectedSubjects ?? []).map(s => s.toLowerCase()));
    for (const required of blueprint.requiredSubjects) {
      if (!detected.has(required.toLowerCase())) {
        failures.push(`missing_required_subject:${required}`);
      }
    }
  }

  if (blueprint.subjectFocus === "environment" && !renderedAnalysis.hasVisibleEnvironment) {
    failures.push("environment_shot_without_visible_environment");
  }

  if (blueprint.mustShowEnemy) {
    const hasEnemy = (renderedAnalysis.detectedSubjects ?? []).some(
      s => /enemy|antagonist|guard|soldier|threat/i.test(s)
    );
    if (!hasEnemy) {
      failures.push("enemy_required_but_not_detected");
    }
  }

  return {
    shotId,
    requestedShotType: blueprint.shotType,
    requestedSubjectFocus: blueprint.subjectFocus,
    requiredSubjects: blueprint.requiredSubjects ?? [],
    passed: failures.length === 0,
    failures,
  };
}

export function detectConsecutiveRepetitions(
  blueprints: PanelBlueprintPremium[],
  windowSize: number = 3,
): Array<{ startIndex: number; endIndex: number; repeatedPattern: string }> {
  const repetitions: Array<{ startIndex: number; endIndex: number; repeatedPattern: string }> = [];
  for (let i = windowSize; i < blueprints.length; i++) {
    const current = blueprints[i]!;
    const window = blueprints.slice(i - windowSize, i);
    const allSame = window.every(
      p => p.shotType === current.shotType &&
           p.subjectFocus === current.subjectFocus &&
           p.heroCenterAllowed === current.heroCenterAllowed
    );
    if (allSame) {
      repetitions.push({
        startIndex: i - windowSize,
        endIndex: i,
        repeatedPattern: `${current.shotType}/${current.subjectFocus}/${current.heroCenterAllowed ? "hero" : "other"}`,
      });
    }
  }
  return repetitions;
}

export function analyzeShotDiversity(
  blueprints: PanelBlueprintPremium[],
): ShotDiversityReport {
  const total = blueprints.length;
  if (total === 0) {
    return {
      valid: true, heroCenterRatio: 0, environmentRatio: 0,
      npcRatio: 0, reactionRatio: 0, insertRatio: 0, otsRatio: 0,
      violations: [], corrections: [],
    };
  }

  const heroCount = blueprints.filter(
    b => b.heroCenterAllowed && (b.subjectFocus === "hero" || (b.subjectFocus === "reaction" && b.heroCenterAllowed))
  ).length;
  const envCount = blueprints.filter(b => b.subjectFocus === "environment" || b.subjectFocus === "aftermath").length;
  const npcCount = blueprints.filter(b => b.subjectFocus === "npc" || b.mustShowEnemy).length;
  const reactionCount = blueprints.filter(b => b.subjectFocus === "reaction").length;
  const insertCount = blueprints.filter(b => b.cutawayType === "prop_insert" || b.subjectFocus === "prop").length;
  const otsCount = blueprints.filter(b => b.shotType === "over_shoulder").length;

  const heroCenterRatio = heroCount / total;
  const environmentRatio = envCount / total;
  const npcRatio = npcCount / total;
  const reactionRatio = reactionCount / total;
  const insertRatio = insertCount / total;
  const otsRatio = otsCount / total;

  const violations: ShotDiversityReport["violations"] = [];

  if (heroCenterRatio > MANGA_SHOT_BUDGET.MAX_HERO_CENTER_RATIO) {
    const excess = Math.round((heroCenterRatio - MANGA_SHOT_BUDGET.MAX_HERO_CENTER_RATIO) * total);
    const affectedIndices = blueprints
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => b.heroCenterAllowed && b.subjectFocus === "hero")
      .slice(0, excess)
      .map(({ i }) => i);

    const severity: "warning" | "blocking" =
      heroCenterRatio >= MANGA_SHOT_BUDGET.HERO_CENTER_FAIL_RATIO ? "blocking"
      : heroCenterRatio >= MANGA_SHOT_BUDGET.HERO_CENTER_WARNING_RATIO ? "warning"
      : "blocking";

    violations.push({
      type: "hero_over_represented",
      message: heroCenterRatio >= MANGA_SHOT_BUDGET.HERO_CENTER_FAIL_RATIO
        ? `CRITIQUE : héros centré à ${Math.round(heroCenterRatio * 100)}% (seuil fail ${Math.round(MANGA_SHOT_BUDGET.HERO_CENTER_FAIL_RATIO * 100)}%). Chapitre rejeté — régénération requise.`
        : heroCenterRatio >= MANGA_SHOT_BUDGET.HERO_CENTER_WARNING_RATIO
          ? `ATTENTION : héros centré à ${Math.round(heroCenterRatio * 100)}% (seuil warning ${Math.round(MANGA_SHOT_BUDGET.HERO_CENTER_WARNING_RATIO * 100)}%). Distribution à améliorer.`
          : `Le héros est au centre de ${Math.round(heroCenterRatio * 100)}% des panels (max ${Math.round(MANGA_SHOT_BUDGET.MAX_HERO_CENTER_RATIO * 100)}%). Ajouter des plans environnement, NPC ou inserts.`,
      severity,
      currentValue: heroCenterRatio,
      requiredValue: MANGA_SHOT_BUDGET.MAX_HERO_CENTER_RATIO,
      affectedPanelIndices: affectedIndices,
    });
  }

  if (environmentRatio < MANGA_SHOT_BUDGET.MIN_ENVIRONMENT_RATIO) {
    violations.push({
      type: "environment_missing",
      message: `Seulement ${Math.round(environmentRatio * 100)}% de plans d'environnement (min ${Math.round(MANGA_SHOT_BUDGET.MIN_ENVIRONMENT_RATIO * 100)}%). Le monde doit exister visuellement.`,
      severity: "warning",
      currentValue: environmentRatio,
      requiredValue: MANGA_SHOT_BUDGET.MIN_ENVIRONMENT_RATIO,
      affectedPanelIndices: [],
    });
  }

  if (npcRatio < MANGA_SHOT_BUDGET.MIN_NPC_RATIO) {
    violations.push({
      type: "npc_missing",
      message: `Seulement ${Math.round(npcRatio * 100)}% de panels montrant des NPC ou antagonistes (min ${Math.round(MANGA_SHOT_BUDGET.MIN_NPC_RATIO * 100)}%).`,
      severity: "warning",
      currentValue: npcRatio,
      requiredValue: MANGA_SHOT_BUDGET.MIN_NPC_RATIO,
      affectedPanelIndices: [],
    });
  }

  return {
    valid: violations.filter(v => v.severity === "blocking").length === 0,
    heroCenterRatio,
    environmentRatio,
    npcRatio,
    reactionRatio,
    insertRatio,
    otsRatio,
    violations,
    corrections: [],
  };
}

export function enforceShotDiversity(
  blueprints: PanelBlueprintPremium[],
): { blueprints: PanelBlueprintPremium[]; report: ShotDiversityReport } {
  const report = analyzeShotDiversity(blueprints);
  if (report.valid && report.violations.length === 0) {
    return { blueprints, report };
  }

  const corrected = [...blueprints];

  for (const violation of report.violations) {
    if (violation.type === "hero_over_represented") {
      const rotationMap = ["environment", "npc", "reaction", "prop"] as const;
      const shotTypeMap: Record<string, string> = {
        environment: "wide", npc: "medium", reaction: "medium", prop: "closeup",
      };
      const purposeMap: Record<string, string> = {
        environment: "environment establishing — rythme visuel",
        npc: "personnages secondaires / antagonistes — présence dans la scène",
        reaction: "reaction — second personnage",
        prop: "insert objet / détail narratif",
      };
      const cutawayMap: Record<string, string> = {
        environment: "environment", npc: "none", reaction: "reaction", prop: "prop_insert",
      };

      for (const idx of violation.affectedPanelIndices) {
        const original = corrected[idx];
        if (!original) continue;
        const newFocus = rotationMap[idx % rotationMap.length] ?? "environment";

        corrected[idx] = {
          ...original,
          subjectFocus: newFocus as PanelBlueprintPremium["subjectFocus"],
          heroCenterAllowed: false,
          shotType: shotTypeMap[newFocus] ?? "wide",
          purpose: purposeMap[newFocus] ?? "cutaway",
          cutawayType: (cutawayMap[newFocus] ?? "none") as PanelBlueprintPremium["cutawayType"],
          requiredNpcCount: newFocus === "npc" ? Math.max(1, original.requiredNpcCount) : original.requiredNpcCount,
          mustShowEnemy: newFocus === "npc" && original.mustShowEnemy ? true : original.mustShowEnemy,
        };
        report.corrections.push({
          panelIndex: idx,
          originalSubjectFocus: original.subjectFocus,
          newSubjectFocus: newFocus,
          originalShotType: original.shotType,
          newShotType: corrected[idx]!.shotType,
          reason: "hero_over_represented — conversion pour diversité manga",
        });
      }
    }
  }

  // Correcteur npcRatio trop bas → injection panel NPC forcé
  const finalReport = analyzeShotDiversity(corrected);
  if (finalReport.npcRatio < MANGA_SHOT_BUDGET.MIN_NPC_RATIO) {
    const candidateIdx = corrected.findIndex(
      b => b.subjectFocus === "reaction" && !b.heroCenterAllowed
    );
    if (candidateIdx >= 0) {
      const original = corrected[candidateIdx]!;
      corrected[candidateIdx] = {
        ...original,
        subjectFocus: "npc",
        purpose: "personnages secondaires obligatoires — diversité NPC",
        requiredNpcCount: Math.max(2, original.requiredNpcCount),
        cutawayType: "none" as PanelBlueprintPremium["cutawayType"],
      };
      report.corrections.push({
        panelIndex: candidateIdx,
        originalSubjectFocus: original.subjectFocus,
        newSubjectFocus: "npc",
        originalShotType: original.shotType,
        newShotType: original.shotType,
        reason: "npc_missing — injection panel NPC obligatoire",
      });
    }
  }

  // Anti-repetition: no more than MAX_CONSECUTIVE_SAME_SHOT same shot type in a row
  const maxConsec = MANGA_SHOT_BUDGET.MAX_CONSECUTIVE_SAME_SHOT;
  for (let i = maxConsec; i < corrected.length; i++) {
    const current = corrected[i]!;
    const prevSame = corrected.slice(i - maxConsec, i).every(
      p => p.shotType === current.shotType && p.subjectFocus === current.subjectFocus
    );
    if (prevSame) {
      const altFocus = current.subjectFocus === "hero" ? "environment" :
                       current.subjectFocus === "environment" ? "npc" : "reaction";
      corrected[i] = {
        ...current,
        subjectFocus: altFocus as typeof current.subjectFocus,
        shotType: altFocus === "environment" ? "wide" : "medium",
        heroCenterAllowed: false,
        purpose: `anti-repetition: was ${current.subjectFocus}/${current.shotType} × ${maxConsec}`,
      };
      report.corrections.push({
        panelIndex: i,
        originalSubjectFocus: current.subjectFocus,
        newSubjectFocus: altFocus,
        originalShotType: current.shotType,
        newShotType: corrected[i]!.shotType,
        reason: `consecutive_same_shot × ${maxConsec + 1}`,
      });
    }
  }

  // Anti hero-center: no more than MAX_CONSECUTIVE_HERO_CENTER hero-centered in a row
  const maxHeroConsec = MANGA_SHOT_BUDGET.MAX_CONSECUTIVE_HERO_CENTER;
  for (let i = maxHeroConsec; i < corrected.length; i++) {
    const current = corrected[i]!;
    if (!current.heroCenterAllowed) continue;
    const prevAllHero = corrected.slice(i - maxHeroConsec, i).every(p => p.heroCenterAllowed);
    if (prevAllHero) {
      corrected[i] = {
        ...current,
        heroCenterAllowed: false,
        subjectFocus: "reaction" as typeof current.subjectFocus,
        purpose: `anti-hero-center: was hero × ${maxHeroConsec}`,
      };
      report.corrections.push({
        panelIndex: i,
        originalSubjectFocus: current.subjectFocus,
        newSubjectFocus: "reaction",
        originalShotType: current.shotType,
        newShotType: current.shotType,
        reason: `consecutive_hero_center × ${maxHeroConsec + 1}`,
      });
    }
  }

  return { blueprints: corrected, report };
}
