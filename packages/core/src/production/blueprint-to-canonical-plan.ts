/**
 * Pont : blueprints premium persistés / estimés → plan canonique minimal pour QA structurelle.
 * Une seule voie de vérité pour les garde-fous (ratios, couverture beats) sur le plan réellement lancé.
 */

import type { PanelBlueprintPremium } from "../types/narrative-facts";
import type {
  CanonicalBeatPlan,
  CanonicalChapterProductionPlan,
  CanonicalPanelPlan,
  PanelRole,
  PanelTextPlan,
  ProductionQaResult,
} from "./canonical-production-plan";
import {
  assignPanelTextAnchors,
  computeCanonicalProductionMetrics,
  qaCanonicalProductionPlanWithAutoRepair,
} from "./build-canonical-production-plan";
import { normalizeOutline } from "./normalize-outline";
import { PRODUCTION_RULES, type ChapterFormat } from "./production-rules";
import { nonEmptyArray, nonEmptyEnvironmentDna } from "./dna-nonempty";

function subjectFocusToRole(bp: PanelBlueprintPremium, isCutaway: boolean): PanelRole {
  if (isCutaway) {
    const f = bp.subjectFocus;
    if (f === "environment" || f === "location") return "environment";
    if (f === "prop") return "prop";
    if (f === "aftermath") return "aftermath";
    return "cutaway";
  }
  const map: Partial<Record<PanelBlueprintPremium["subjectFocus"], PanelRole>> = {
    hero: "hero",
    duo: "duo",
    enemy: "enemy",
    reaction: "reaction",
    speaker: "speaker",
    group: "group",
    npc: "npc",
    ally: "duo",
    environment: "environment",
    prop: "prop",
    location: "environment",
    aftermath: "aftermath",
    visual_entity: "prop",
  };
  return map[bp.subjectFocus] ?? "action";
}

function inferTextPlanFromBlueprint(bp: PanelBlueprintPremium, panelId: string): PanelTextPlan {
  if (bp.cutawayType !== "none") {
    return { panelId, mode: "silent", reserveTextArea: false };
  }
  const hasDialogue =
    (Array.isArray(bp.dialogueLines) && bp.dialogueLines.length > 0) ||
    bp.dialogueCarrier === "speaker_visible";
  if (hasDialogue) {
    return {
      panelId,
      mode: "dialogue",
      anchor: {
        speakerId: bp.speakerAnchorCharacterId ?? undefined,
        reserveBubbleSpace: true,
      },
      reserveTextArea: true,
    };
  }
  if (bp.narrationText && String(bp.narrationText).trim().length > 0) {
    return { panelId, mode: "narration", text: String(bp.narrationText), reserveTextArea: true };
  }
  if (Array.isArray(bp.sfxCues) && bp.sfxCues.length > 0) {
    return { panelId, mode: "sfx", sfx: bp.sfxCues.map(String), reserveTextArea: true };
  }
  return { panelId, mode: "silent", reserveTextArea: false };
}

function blueprintToCanonicalPanel(bp: PanelBlueprintPremium, globalIndex: number): CanonicalPanelPlan {
  const isCutaway = bp.cutawayType !== "none";
  const role = subjectFocusToRole(bp, isCutaway);
  const isActorDriven =
    !isCutaway &&
    ["hero", "duo", "enemy", "reaction", "action", "speaker", "listener", "group"].includes(role);
  const textPlan = inferTextPlanFromBlueprint(bp, bp.panelId);

  return {
    panelId: bp.panelId,
    beatId: bp.beatId,
    panelIndex: globalIndex,
    pageNumber: bp.pageNumber ?? 1,
    panelNumberInPage: bp.panelNumber,
    role,
    isCutaway,
    isActorDriven,
    purpose: bp.purpose,
    shotType: bp.shotType,
    cameraAngle: bp.cameraAngle,
    subjectFocus: bp.subjectFocus,
    secondaryFocus: bp.secondaryFocus ?? undefined,
    requiredCharacterIds: bp.requiredCharacterIds ?? bp.requiredCharacters ?? [],
    mustShowCharacterIds: bp.mustShowCharacterIds ?? [],
    mayShowCharacterIds: bp.mayShowCharacterIds ?? [],
    requiredEntityIds: bp.requiredEntityIds ?? [],
    mustShowEnemy: bp.mustShowEnemy,
    requiredNpcCount: bp.requiredNpcCount,
    requiredProps: (bp.requiredProps ?? []).map((p) => ({
      id: p.id,
      canonicalName: p.canonicalName,
      mustBeVisible: p.mustBeVisible,
    })),
    requiredLocationSignals: bp.requiredLocationSignals ?? [],
    textPlan: { ...textPlan, panelId: bp.panelId },
    criticality: bp.criticality,
    notes: bp.notes ?? [],
    ...(nonEmptyArray(bp.characterVisualDna) ? { characterVisualDna: bp.characterVisualDna } : {}),
    ...(nonEmptyArray(bp.npcVisualDna) ? { npcVisualDna: bp.npcVisualDna } : {}),
    ...(nonEmptyArray(bp.creatureVisualDna) ? { creatureVisualDna: bp.creatureVisualDna } : {}),
    ...(nonEmptyArray(bp.vehicleVisualDna) ? { vehicleVisualDna: bp.vehicleVisualDna } : {}),
    ...(nonEmptyArray(bp.factionVisualDna) ? { factionVisualDna: bp.factionVisualDna } : {}),
    ...(nonEmptyEnvironmentDna(bp.environmentVisualDna)
      ? { environmentVisualDna: bp.environmentVisualDna }
      : {}),
    ...(nonEmptyArray(bp.propVisualDna) ? { propVisualDna: bp.propVisualDna } : {}),
    ...(nonEmptyArray(bp.continuityObjectIds) ? { continuityObjectIds: bp.continuityObjectIds } : {}),
  };
}

export function buildCanonicalProductionPlanFromPremiumBlueprints(input: {
  chapterId: string;
  projectId: string;
  chapterNumber: number;
  chapterTitle: string;
  format: ChapterFormat;
  productionOutline: unknown;
  blueprints: PanelBlueprintPremium[];
}): CanonicalChapterProductionPlan {
  const norm = normalizeOutline(input.productionOutline);
  const blueprints = [...input.blueprints].sort(
    (a, b) => (a.panelIndex ?? 0) - (b.panelIndex ?? 0),
  );

  const beats: CanonicalBeatPlan[] = norm.beats.map((b) => {
    const ids = blueprints.filter((p) => p.beatId === b.beatId).map((p) => p.panelId);
    return {
      beatId: b.beatId,
      beatIndex: b.beatIndex,
      summary: b.summary,
      narrativeFunction: b.narrativeFunction,
      dramaticChange: b.dramaticChange,
      involvedCharacters: b.involvedCharacters,
      environmentContext: b.environmentContext,
      targetPanelCount: b.estimatedPanels,
      actualPanelCount: ids.length,
      panelIds: ids,
      hasDialogue: b.hasDialogue,
      hasAction: b.hasAction,
      hasEmotion: b.hasEmotion,
      hasTension: b.hasTension,
      unresolvedCharacterRefs: b.unresolvedCharacterRefs ?? [],
    };
  });

  const panelsRaw = blueprints.map((bp, idx) => blueprintToCanonicalPanel(bp, idx));
  const pageCount = new Set(panelsRaw.map((p) => p.pageNumber)).size;

  const placeholderQa: ProductionQaResult = {
    valid: false,
    warnings: [],
    errors: [],
    details: {
      cutawayRatioOk: false,
      actorDrivenRatioOk: false,
      consecutiveCutawaysOk: false,
      beatCoverageOk: false,
      dialogueCoverageOk: false,
      panelCountOk: false,
    },
  };

  const partialBare: CanonicalChapterProductionPlan = {
    chapterId: input.chapterId,
    projectId: input.projectId,
    chapterNumber: input.chapterNumber,
    chapterTitle: input.chapterTitle,
    format: input.format,
    targetPanelCount: PRODUCTION_RULES.panelCount.target,
    minimumPanelCount: PRODUCTION_RULES.panelCount.minimum,
    maximumPanelCount: PRODUCTION_RULES.panelCount.maximum,
    idealPanelCount: PRODUCTION_RULES.panelCount.target,
    beatCount: beats.length,
    pageCount,
    beats,
    panels: panelsRaw,
    rhythm: {
      cutawayMaxRatio: PRODUCTION_RULES.cutaway.maxRatio,
      actorDrivenMinRatio: PRODUCTION_RULES.actorDriven.minRatio,
      maxConsecutiveCutaways: PRODUCTION_RULES.cutaway.maxConsecutive,
      pattern: [...PRODUCTION_RULES.rhythm.preferredNarrativePattern],
      cutawayInsertionPolicy: PRODUCTION_RULES.rhythm.cutawayInsertionPolicy,
    },
    metrics: computeCanonicalProductionMetrics(panelsRaw),
    qa: placeholderQa,
    createdAt: new Date().toISOString(),
    version: "1.0.0",
  };

  const anchored = assignPanelTextAnchors(partialBare);
  const { plan: finalPlan, qa } = qaCanonicalProductionPlanWithAutoRepair(anchored);
  return { ...finalPlan, qa };
}

export function runStructuralQaOnPremiumBlueprints(input: Parameters<typeof buildCanonicalProductionPlanFromPremiumBlueprints>[0]) {
  const plan = buildCanonicalProductionPlanFromPremiumBlueprints(input);
  return { plan, qa: plan.qa };
}
