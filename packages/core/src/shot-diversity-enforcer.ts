import type { PanelBlueprintPremium } from "./types/narrative-facts";

export const MANGA_SHOT_BUDGET = {
  MAX_HERO_CENTER_RATIO: 0.35,
  MIN_ENVIRONMENT_RATIO: 0.15,
  MIN_NPC_RATIO: 0.12,
  MIN_REACTION_RATIO: 0.10,
  MIN_INSERT_RATIO: 0.05,
  MIN_OTS_RATIO: 0.08,
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
    violations.push({
      type: "hero_over_represented",
      message: `Le héros est au centre de ${Math.round(heroCenterRatio * 100)}% des panels (max ${Math.round(MANGA_SHOT_BUDGET.MAX_HERO_CENTER_RATIO * 100)}%). Ajouter des plans environnement, NPC ou inserts.`,
      severity: "blocking",
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

  return { blueprints: corrected, report };
}
