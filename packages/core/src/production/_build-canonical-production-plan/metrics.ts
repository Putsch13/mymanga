import type {
  CanonicalPanelPlan,
  PanelRole,
  ProductionMetrics,
} from "../canonical-production-plan";

/** Métriques officielles à partir des panels canoniques (réutilisé par la QA sur blueprints premium). */
export function computeCanonicalProductionMetrics(
  panels: CanonicalPanelPlan[],
): ProductionMetrics {
  const roleDistribution: Record<PanelRole, number> = {
    hero: 0,
    duo: 0,
    enemy: 0,
    reaction: 0,
    action: 0,
    environment: 0,
    prop: 0,
    npc: 0,
    group: 0,
    aftermath: 0,
    transition: 0,
    cutaway: 0,
    speaker: 0,
    listener: 0,
  };

  const shotDistribution: Record<string, number> = {};
  const focusDistribution: Record<string, number> = {};

  let cutawayCount = 0;
  let actorDrivenCount = 0;
  let dialogueAnchoredCount = 0;
  let dialogueFloatingCount = 0;
  let narrationCount = 0;
  let silentCount = 0;
  let intentionalSilenceCount = 0;
  let sfxCount = 0;
  let maxConsecutiveCutaways = 0;
  let currentCutawayStreak = 0;

  for (const panel of panels) {
    roleDistribution[panel.role]++;

    shotDistribution[panel.shotType] = (shotDistribution[panel.shotType] ?? 0) + 1;
    focusDistribution[panel.subjectFocus] = (focusDistribution[panel.subjectFocus] ?? 0) + 1;

    if (panel.isCutaway) {
      cutawayCount++;
      currentCutawayStreak++;
      maxConsecutiveCutaways = Math.max(maxConsecutiveCutaways, currentCutawayStreak);
    } else {
      actorDrivenCount++;
      currentCutawayStreak = 0;
    }

    switch (panel.textPlan.mode) {
      case "dialogue":
        if (panel.textPlan.anchor?.speakerId) {
          dialogueAnchoredCount++;
        } else {
          dialogueFloatingCount++;
        }
        break;
      case "narration":
      case "thought":
        narrationCount++;
        break;
      case "sfx":
        sfxCount++;
        break;
      case "silent":
        silentCount++;
        break;
      case "intentional_silence":
        intentionalSilenceCount++;
        break;
    }
  }

  const totalPanels = panels.length;
  const totalPages = new Set(panels.map((p) => p.pageNumber)).size;
  const totalBeats = new Set(panels.map((p) => p.beatId)).size;

  return {
    totalPanels,
    totalBeats,
    totalPages,
    cutawayCount,
    cutawayRatio: totalPanels > 0 ? cutawayCount / totalPanels : 0,
    actorDrivenCount,
    actorDrivenRatio: totalPanels > 0 ? actorDrivenCount / totalPanels : 1,
    heroCount: roleDistribution.hero,
    duoCount: roleDistribution.duo,
    enemyCount: roleDistribution.enemy,
    reactionCount: roleDistribution.reaction,
    actionCount: roleDistribution.action,
    environmentCount: roleDistribution.environment,
    propCount: roleDistribution.prop,
    npcCount: roleDistribution.npc,
    groupCount: roleDistribution.group,
    dialogueAnchoredCount,
    dialogueFloatingCount,
    narrationCount,
    silentCount,
    intentionalSilenceCount,
    sfxCount,
    maxConsecutiveCutaways,
    focusDistribution,
    shotDistribution,
    roleDistribution,
  };
}
