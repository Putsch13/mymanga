/**
 * Rebalancing premium manga — réduit les cutaways excédentaires après densification
 * et aligne les blueprints sur des panels portés par des acteurs visibles.
 */

import type { CutawayType, PanelBlueprintPremium, SubjectFocus } from "@manga-ai-studio/core";
import {
  blueprintTextBlob,
  buildReadingOrderIndexMap,
  containsBannedPlaceholder,
  isConflictHeavyBeatPanel,
  isPremiumMangaActorDrivenBlueprint,
  isPremiumMangaCutawayBlueprint,
  maxConsecutiveCutawaysInOrder,
  panelDeclaresVisibleOpponent,
  stripBannedPlaceholdersFromBlueprint,
} from "./premium-manga-cutaway";
import {
  pickPrimaryActorForBeat,
  pickRequiredOpponentForBeat,
  subjectFocusForVisualEntity,
  type VisualEntity,
} from "./visual-entity-registry";
import { getRequiredVisualEntityIds } from "./visual-entity-ids";
import {
  beatRequiresResolvedOpponent,
  ensureOpponentEntityForBeat,
} from "./auto-canonize-opponent";
import {
  buildEntityActionLine,
  resolveBlueprintReferencePolicyForEntity,
  resolveRenderModeForEntity,
} from "./visual-entity-prompt";
import { runMangaStructureQaOnBlueprints } from "./manga-structure-qa";

function isDialogueHeavyBeat(bp: PanelBlueprintPremium): boolean {
  return (bp.dialogueLines?.length ?? 0) > 0 || bp.dialogueCarrier === "speaker_visible";
}

/** Cutaway « dur » : plafonné sévèrement (ouverture, splash, révélation majeure, etc.). */
export function isHardCriticalCutawayBlueprint(
  bp: PanelBlueprintPremium,
  readingOrderIndex: number,
): boolean {
  if (bp.contractualCritical === true) return true;

  const purpose = bp.purpose.toLowerCase();
  const shotType = bp.shotType.toLowerCase();
  const actionLine = blueprintTextBlob(bp);

  if ((purpose.includes("establishing") || purpose.includes("establish")) && readingOrderIndex <= 2) {
    return true;
  }
  if (purpose.includes("major_reveal") || purpose.includes("major reveal")) return true;
  if (purpose.includes("cliffhanger") || purpose.includes("cliff-hanger")) return true;
  if (shotType.includes("splash")) return true;

  if (
    purpose.includes("key_object_reveal")
    || purpose.includes("key object reveal")
    || actionLine.includes("reveals the talisman")
    || actionLine.includes("reveals the grimoire")
  ) {
    return true;
  }

  return false;
}

/** Cutaway « soft » : convertible en priorité moindre après les plans normaux. */
export function isSoftCriticalCutawayBlueprint(
  bp: PanelBlueprintPremium,
  readingOrderIndex: number,
): boolean {
  if (isHardCriticalCutawayBlueprint(bp, readingOrderIndex)) return false;

  const purpose = bp.purpose.toLowerCase();
  const actionLine = blueprintTextBlob(bp);
  const requiredProps = Array.isArray(bp.requiredProps) ? bp.requiredProps : [];

  if (requiredProps.length > 0) return true;
  if (purpose.includes("prop")) return true;
  if (purpose.includes("environment")) return true;
  if (purpose.includes("aftermath")) return true;
  if (actionLine.includes("barrière") || actionLine.includes("barrier")) return true;
  if (actionLine.includes("talisman")) return true;
  if (actionLine.includes("grimoire")) return true;
  if (actionLine.includes("magic") || actionLine.includes("magique")) return true;

  return false;
}

function narrativeValueScore(bp: PanelBlueprintPremium): number {
  let score = 50;
  if (bp.contractualCritical) score += 40;
  if (bp.criticality === "high" || bp.criticality === "critical") score += 25;
  const p = bp.purpose.toLowerCase();
  if (p.includes("establish") || p.includes("major_reveal") || p.includes("major reveal")) score += 15;
  if (p.includes("atmos") || p.includes("densified")) score -= 30;
  if (containsBannedPlaceholder(bp)) score -= 25;
  return score;
}

function resolveSubjectFocusForEntity(entity: VisualEntity): SubjectFocus {
  if (entity.isOpponent) return "enemy";
  if (entity.role === "protagonist") return "hero";
  if (entity.canAppearAsGroup) return "group";
  return "npc";
}

export function convertPanelToEntityDrivenPanel(
  bp: PanelBlueprintPremium,
  entity: VisualEntity,
  options: { reason: string },
): void {
  if (entity.consistencyLevel === "strict" && entity.referenceImageUrls.length === 0) {
    throw new Error(`required_entity_missing_model_sheet entity=${entity.id}`);
  }

  bp.cutawayType = "none" as CutawayType;
  bp.rebalancedFromCutaway = true;
  bp.subjectFocus = resolveSubjectFocusForEntity(entity);
  bp.mangaPanelFunction = entity.isOpponent ? "opponent_pressure" : "entity_action";
  bp.renderMode = resolveRenderModeForEntity(entity);
  bp.mustShowEnemy = entity.isOpponent;

  const merged = new Set<string>([
    ...(bp.requiredEntityIds ?? []),
    ...(bp.mustShowCharacterIds ?? []),
    entity.id,
  ]);
  bp.requiredEntityIds = [...merged];
  bp.mustShowCharacterIds = [...merged];
  bp.requiredCharacters = [...merged];

  bp.shotType = bp.shotType === "wide" ? "medium" : bp.shotType || "medium";
  bp.cameraAngle = entity.isOpponent ? bp.cameraAngle || "low" : bp.cameraAngle || "eye_level";

  bp.purpose = buildEntityActionLine(bp, entity);
  bp.referencePolicy = resolveBlueprintReferencePolicyForEntity(entity);

  bp.notes = [...(bp.notes ?? []), options.reason, `entity_driven:${entity.id}`];
}

export function buildActorDrivenReplacement(
  bp: PanelBlueprintPremium,
  entities: VisualEntity[],
  fallbackHeroId: string | null,
): Partial<PanelBlueprintPremium> {
  const primary = pickPrimaryActorForBeat(bp.beatId, entities, fallbackHeroId);
  const opponent = pickRequiredOpponentForBeat({ beatId: bp.beatId, visualEntities: entities });

  if (isDialogueHeavyBeat(bp) && primary) {
    return {
      purpose: "dialogue reaction — visible emotional beat",
      shotType: "medium_close",
      cameraAngle: "eye_level",
      subjectFocus: "speaker",
      secondaryFocus: "hero",
      cutawayType: "none" as CutawayType,
      dialogueCarrier: "speaker_visible",
      heroCenterAllowed: true,
      mustShowCharacterIds: [...(bp.mustShowCharacterIds ?? []), primary.id].filter((id, i, a) => a.indexOf(id) === i),
      requiredCharacters: [primary.id],
    };
  }

  if (isConflictHeavyBeatPanel(bp) && opponent) {
    const sf = subjectFocusForVisualEntity(opponent);
    return {
      purpose: `${opponent.name} — visible pressure / conflict beat`,
      shotType: "medium",
      cameraAngle: "low",
      subjectFocus: sf,
      cutawayType: "none" as CutawayType,
      mustShowEnemy: opponent.isOpponent,
      mustShowCharacterIds: primary
        ? [primary.id, opponent.id].filter((id, i, a) => a.indexOf(id) === i)
        : [opponent.id],
      requiredCharacters: primary ? [primary.id, opponent.id] : [opponent.id],
      requiredEntityIds: [...new Set([...(bp.requiredEntityIds ?? []), opponent.id])],
      heroCenterAllowed: sf === "hero",
    };
  }

  if (primary) {
    const sf: SubjectFocus = primary.role === "protagonist" ? "hero" : "npc";
    return {
      purpose: "character advances the scene — visible action or emotion",
      shotType: "medium",
      cameraAngle: "eye_level",
      subjectFocus: sf,
      cutawayType: "none" as CutawayType,
      mustShowCharacterIds: [primary.id],
      requiredCharacters: [primary.id],
      requiredEntityIds: [...new Set([...(bp.requiredEntityIds ?? []), primary.id])],
      heroCenterAllowed: sf === "hero",
    };
  }

  return {
    purpose: "group tension — character-driven story beat",
    shotType: "medium",
    cameraAngle: "eye_level",
    subjectFocus: "group",
    cutawayType: "none" as CutawayType,
    heroCenterAllowed: false,
  };
}

function rewritePurposeWithVisibleActor(bp: PanelBlueprintPremium): string {
  const propNames = (bp.requiredProps ?? [])
    .filter((p) => p.mustBeVisible !== false)
    .map((p) => p.canonicalName)
    .filter(Boolean);
  const props =
    propNames.length > 0 ? ` Key props stay readable in-frame: ${propNames.join(", ")}.` : "";

  const base = String(bp.purpose ?? "").trim();

  if (isConflictHeavyBeatPanel(bp)) {
    return `A visible character reacts to the threat or advances the conflict.${props} Original beat cue: ${base}`;
  }

  if (isDialogueHeavyBeat(bp)) {
    return `A visible speaker or listener expresses the dialogue subtext through gaze, posture and facial emotion.${props} Original beat cue: ${base}`;
  }

  return `A visible character advances the scene through action or emotion.${props} Original beat cue: ${base}`;
}

function mergeActorDrivenPurpose(bp: PanelBlueprintPremium): void {
  bp.purpose = rewritePurposeWithVisibleActor(bp);
}

export function convertCutawayToActorDrivenPanel(
  bp: PanelBlueprintPremium,
  entities: VisualEntity[],
  fallbackHeroId: string | null,
  _orderMap: Map<string, number>,
): void {
  const opponent = pickRequiredOpponentForBeat({ beatId: bp.beatId, visualEntities: entities });
  if (isConflictHeavyBeatPanel(bp) && opponent) {
    convertPanelToEntityDrivenPanel(bp, opponent, {
      reason: "cutaway_rebalanced_to_actor_driven_panel",
    });
    return;
  }

  const replacement = buildActorDrivenReplacement(bp, entities, fallbackHeroId);
  Object.assign(bp, replacement);
  bp.cutawayType = "none" as CutawayType;

  if (bp.shotType === "wide") bp.shotType = "medium";
  if (!bp.cameraAngle) bp.cameraAngle = "eye_level";

  mergeActorDrivenPurpose(bp);

  bp.notes = [...(bp.notes ?? []), "cutaway_rebalanced_to_actor_driven_panel"];
}

function rebalanceCutawaysToBudgetOnce(
  blueprints: PanelBlueprintPremium[],
  args: Pick<RebalancePremiumBlueprintsArgs, "maxCutawayRatio" | "minActorDrivenRatio" | "visualEntities" | "fallbackHeroId">,
  orderMap: Map<string, number>,
): number {
  const total = blueprints.length;
  if (total === 0) return 0;

  const maxCutaways = Math.floor(total * args.maxCutawayRatio);
  const minActorDriven = Math.ceil(total * args.minActorDrivenRatio);

  const cutaways = blueprints.filter(isPremiumMangaCutawayBlueprint);
  let currentCutaways = cutaways.length;
  let currentActorDriven = blueprints.filter(isPremiumMangaActorDrivenBlueprint).length;

  const hardCritical = cutaways.filter((bp) =>
    isHardCriticalCutawayBlueprint(bp, orderMap.get(bp.panelId) ?? 0),
  );
  const softCritical = cutaways.filter((bp) =>
    isSoftCriticalCutawayBlueprint(bp, orderMap.get(bp.panelId) ?? 0),
  );
  const normalCutaways = cutaways.filter(
    (bp) =>
      !isHardCriticalCutawayBlueprint(bp, orderMap.get(bp.panelId) ?? 0)
      && !isSoftCriticalCutawayBlueprint(bp, orderMap.get(bp.panelId) ?? 0),
  );

  const maxHardCritical = Math.min(Math.floor(total * 0.15), maxCutaways);
  const hardSorted = [...hardCritical].sort((a, b) => narrativeValueScore(b) - narrativeValueScore(a));
  const hardCriticalToKeep = new Set(hardSorted.slice(0, maxHardCritical).map((bp) => bp.panelId));

  const convertible = [
    ...normalCutaways,
    ...softCritical,
    ...hardCritical.filter((bp) => !hardCriticalToKeep.has(bp.panelId)),
  ].sort((a, b) => narrativeValueScore(a) - narrativeValueScore(b));

  let converted = 0;
  for (const bp of convertible) {
    if (currentCutaways <= maxCutaways && currentActorDriven >= minActorDriven) break;
    convertCutawayToActorDrivenPanel(bp, args.visualEntities, args.fallbackHeroId, orderMap);
    currentCutaways -= 1;
    currentActorDriven += 1;
    converted += 1;
  }

  return converted;
}

function beatAlreadyShowsOpponentEntity(
  beatPanels: PanelBlueprintPremium[],
  visualEntities: VisualEntity[],
): boolean {
  return beatPanels.some((bp) => {
    if (!isPremiumMangaActorDrivenBlueprint(bp)) return false;
    const ids = getRequiredVisualEntityIds(bp);
    return ids.some((id) => visualEntities.find((e) => e.id === id)?.isOpponent === true);
  });
}

function breakConsecutiveCutaways(
  blueprints: PanelBlueprintPremium[],
  maxConsecutive: number,
  orderMap: Map<string, number>,
  entities: VisualEntity[],
  fallbackHeroId: string | null,
): number {
  const sorted = [...blueprints].sort((a, b) => {
    if (a.panelNumber !== b.panelNumber) return a.panelNumber - b.panelNumber;
    return a.panelId.localeCompare(b.panelId);
  });
  let streak = 0;
  let converted = 0;
  for (const bp of sorted) {
    if (isPremiumMangaCutawayBlueprint(bp)) {
      streak += 1;
      const idx = orderMap.get(bp.panelId) ?? 0;
      if (streak > maxConsecutive && !isHardCriticalCutawayBlueprint(bp, idx)) {
        convertCutawayToActorDrivenPanel(bp, entities, fallbackHeroId, orderMap);
        streak = 0;
        converted += 1;
      }
    } else {
      streak = 0;
    }
  }
  return converted;
}

export interface EnsureConflictOpponentsArgs {
  blueprints: PanelBlueprintPremium[];
  visualEntities: VisualEntity[];
  fallbackHeroId: string | null;
  orderMap: Map<string, number>;
  projectId: string;
}

export interface EnsureConflictOpponentsResult {
  fixes: number;
  autoCreatedEntities: number;
  skippedSuspenseBeats: string[];
}

function ensureConflictBeatsHaveOpponents(args: EnsureConflictOpponentsArgs): EnsureConflictOpponentsResult {
  let fixes = 0;
  let autoCreatedEntities = 0;
  const skippedSuspenseBeats: string[] = [];

  const conflictBeatIds = new Set(
    args.blueprints.filter(isConflictHeavyBeatPanel).map((bp) => bp.beatId),
  );

  for (const beatId of conflictBeatIds) {
    const beatPanels = args.blueprints.filter((bp) => bp.beatId === beatId);

    if (!beatRequiresResolvedOpponent(beatPanels)) {
      console.info(
        `[pipeline:v3:opponent-coverage] beat=${beatId} skipped reason=suspense_without_visible_opponent`,
      );
      skippedSuspenseBeats.push(beatId);
      continue;
    }

    if (beatAlreadyShowsOpponentEntity(beatPanels, args.visualEntities)) {
      console.info(`[pipeline:v3:opponent-coverage] beat=${beatId} ok=true reason=already_covered`);
      continue;
    }

    const { entity: opponent, autoCreated } = ensureOpponentEntityForBeat({
      beatId,
      beatPanels,
      visualEntities: args.visualEntities,
      projectId: args.projectId,
    });

    if (!opponent) {
      throw new Error(`conflict_beat_without_resolved_opponent_entity beat=${beatId}`);
    }

    if (autoCreated) {
      autoCreatedEntities += 1;
    }

    const target =
      beatPanels.find(
        (bp) =>
          isPremiumMangaCutawayBlueprint(bp)
          && !isHardCriticalCutawayBlueprint(bp, args.orderMap.get(bp.panelId) ?? 0),
      )
      ?? beatPanels[0];

    if (!target) continue;

    convertPanelToEntityDrivenPanel(target, opponent, {
      reason: "forced_opponent_panel_for_conflict_beat",
    });

    console.info(
      `[pipeline:v3:opponent-coverage] beat=${beatId} opponent=${opponent.id} ok=true`,
    );
    fixes += 1;
  }

  return { fixes, autoCreatedEntities, skippedSuspenseBeats };
}

export interface RebalancePremiumBlueprintsArgs {
  blueprints: PanelBlueprintPremium[];
  visualEntities: VisualEntity[];
  projectFormat: "manga" | "webtoon";
  maxCutawayRatio: number;
  minActorDrivenRatio: number;
  fallbackHeroId: string | null;
  projectId: string;
}

export interface RebalancePremiumBlueprintsResult {
  blueprints: PanelBlueprintPremium[];
  beforeCutawayCount: number;
  afterCutawayCount: number;
  convertedCount: number;
  /** @deprecated utiliser keptHardCriticalCount + keptSoftCriticalCount */
  keptCriticalCount: number;
  keptHardCriticalCount: number;
  keptSoftCriticalCount: number;
  beforeActorDrivenCount: number;
  afterActorDrivenCount: number;
  structureIterations: number;
  autoCreatedOpponents: number;
  skippedSuspenseBeats: string[];
}

export function rebalancePremiumBlueprintsForManga(
  args: RebalancePremiumBlueprintsArgs,
): RebalancePremiumBlueprintsResult {
  if (args.projectFormat !== "manga") {
    const total = args.blueprints.length;
    const cut = args.blueprints.filter(isPremiumMangaCutawayBlueprint).length;
    const act = args.blueprints.filter(isPremiumMangaActorDrivenBlueprint).length;
    return {
      blueprints: args.blueprints,
      beforeCutawayCount: cut,
      afterCutawayCount: cut,
      convertedCount: 0,
      keptCriticalCount: 0,
      keptHardCriticalCount: 0,
      keptSoftCriticalCount: 0,
      beforeActorDrivenCount: act,
      afterActorDrivenCount: act,
      structureIterations: 0,
      autoCreatedOpponents: 0,
      skippedSuspenseBeats: [],
    };
  }

  const blueprints = args.blueprints.map((b) => structuredClone(b) as PanelBlueprintPremium);
  for (const bp of blueprints) {
    stripBannedPlaceholdersFromBlueprint(bp);
  }

  const total = blueprints.length;
  const beforeCutawayCount = blueprints.filter(isPremiumMangaCutawayBlueprint).length;
  const beforeActorDrivenCount = blueprints.filter(isPremiumMangaActorDrivenBlueprint).length;

  let orderMap = buildReadingOrderIndexMap(blueprints);
  let structureIterations = 0;
  let totalAutoCreatedOpponents = 0;
  let allSkippedSuspenseBeats: string[] = [];
  const maxStructureIterations = 6;

  for (; structureIterations < maxStructureIterations; structureIterations += 1) {
    rebalanceCutawaysToBudgetOnce(blueprints, args, orderMap);
    breakConsecutiveCutaways(blueprints, 2, orderMap, args.visualEntities, args.fallbackHeroId);
    const conflictResult = ensureConflictBeatsHaveOpponents({
      blueprints,
      visualEntities: args.visualEntities,
      fallbackHeroId: args.fallbackHeroId,
      orderMap,
      projectId: args.projectId,
    });
    totalAutoCreatedOpponents += conflictResult.autoCreatedEntities;
    allSkippedSuspenseBeats = [...new Set([...allSkippedSuspenseBeats, ...conflictResult.skippedSuspenseBeats])];
    rebalanceCutawaysToBudgetOnce(blueprints, args, orderMap);

    orderMap = buildReadingOrderIndexMap(blueprints);
    const qa = runMangaStructureQaOnBlueprints({
      blueprints,
      maxCutawayRatio: args.maxCutawayRatio,
      minActorDrivenRatio: args.minActorDrivenRatio,
      visualEntities: args.visualEntities,
    });
    if (qa.ok) break;
  }

  const afterCutawayCount = blueprints.filter(isPremiumMangaCutawayBlueprint).length;
  const afterActorDrivenCount = blueprints.filter(isPremiumMangaActorDrivenBlueprint).length;
  const finalCutaways = blueprints.filter(isPremiumMangaCutawayBlueprint);
  const keptHardCriticalCount = finalCutaways.filter((bp) =>
    isHardCriticalCutawayBlueprint(bp, orderMap.get(bp.panelId) ?? 0),
  ).length;
  const keptSoftCriticalCount = finalCutaways.filter((bp) =>
    isSoftCriticalCutawayBlueprint(bp, orderMap.get(bp.panelId) ?? 0),
  ).length;

  return {
    blueprints,
    beforeCutawayCount,
    afterCutawayCount,
    convertedCount: Math.max(0, beforeCutawayCount - afterCutawayCount),
    keptCriticalCount: keptHardCriticalCount + keptSoftCriticalCount,
    keptHardCriticalCount,
    keptSoftCriticalCount,
    beforeActorDrivenCount,
    afterActorDrivenCount,
    structureIterations,
    autoCreatedOpponents: totalAutoCreatedOpponents,
    skippedSuspenseBeats: allSkippedSuspenseBeats,
  };
}

export {
  blueprintTextBlob,
  containsBannedPlaceholder,
  isPremiumMangaActorDrivenBlueprint,
  isPremiumMangaCutawayBlueprint,
  maxConsecutiveCutawaysInOrder,
  stripBannedPlaceholdersFromBlueprint,
} from "./premium-manga-cutaway";
