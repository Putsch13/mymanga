/**
 * Mode approved_plan_driven : convertit `productionPlan.panelBlueprints`
 * (contrat premium persisté) en `StoryboardPlan` sans repasser par
 * story-pass / storyboard-pass — pas de dérive éditoriale.
 *
 * Les champs déjà au format storyboard sur le JSON (renderMode, panelPurpose,
 * subjectFocus storyboard, etc.) sont recopiés tels quels lorsqu'ils sont
 * valides ; les fallbacks réutilisent les helpers de `storyboard-from-premium-plan`.
 */

import { requiredPropsToWorldPropsVisualDna, type PanelBlueprintPremium, type SubjectFocus, legacyDialogueLinesFromBlueprintPremium, resolvePanelTextContractFromBlueprintPremium } from "@manga-ai-studio/core";
import type {
  PanelPurpose,
  StoryboardCameraAngle,
  StoryboardCutawayType,
  StoryboardLayoutTemplate,
  StoryboardPageV3 as StoryboardPage,
  StoryboardPanelV3 as StoryboardPanel,
  StoryboardPlan,
  StoryboardRenderMode,
  StoryboardShotType,
  StoryboardSubjectFocus,
  StoryboardPanelNpc,
} from "@manga-ai-studio/ai";
import {
  STORYBOARD_CUTAWAY_TYPES,
  STORYBOARD_LAYOUT_TEMPLATES,
  STORYBOARD_RENDER_MODES,
  STORYBOARD_SHOT_TYPES,
  STORYBOARD_SUBJECT_FOCUSES,
  inferStoryboardPanelLayoutMeta,
  isPanelPurpose,
} from "@manga-ai-studio/ai";
import {
  assignBlueprintsToPages,
  buildEditorialDiagnostics,
  derivePanelPurpose,
  deriveRenderMode,
  getMaxPanelsPerPage,
  pickLayoutTemplateForPage,
  resolveCharacters,
  resolveBlueprintLocationName,
  toCameraAngle,
  toCutawayType,
  toShotType,
  toSubjectFocus,
} from "./passes/storyboard-from-premium-plan";

const RENDER_MODE_SET = new Set<string>(STORYBOARD_RENDER_MODES);
const LAYOUT_SET = new Set<string>(STORYBOARD_LAYOUT_TEMPLATES);
const SUBJECT_FOCUS_SET = new Set<string>(STORYBOARD_SUBJECT_FOCUSES);
const SHOT_TYPE_SET = new Set<string>(STORYBOARD_SHOT_TYPES);
const CUTAWAY_SET = new Set<string>(STORYBOARD_CUTAWAY_TYPES);

export interface BuildStoryboardPlanFromApprovedProductionPlanInput {
  chapterId: string;
  projectId: string;
  chapterNumber: number;
  projectFormat: "manga" | "webtoon";
  productionPlan: Record<string, unknown>;
  chapterLocationName?: string | null;
  productionPlanPages?: Array<{ pageNumber: number; panelCount: number; beatIds?: string[] | null }>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function coerceBlueprint(raw: unknown): PanelBlueprintPremium | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.panelId !== "string" || typeof o.beatId !== "string" || typeof o.panelNumber !== "number") {
    return null;
  }
  return raw as PanelBlueprintPremium;
}

function storyboardSubjectFocusFromBlueprint(
  ex: Record<string, unknown>,
  bp: PanelBlueprintPremium,
): StoryboardSubjectFocus {
  if (typeof ex.subjectFocus === "string" && SUBJECT_FOCUS_SET.has(ex.subjectFocus)) {
    return ex.subjectFocus as StoryboardSubjectFocus;
  }
  const core = bp.subjectFocus as SubjectFocus;
  if (SUBJECT_FOCUS_SET.has(core)) return core as StoryboardSubjectFocus;
  const map: Partial<Record<SubjectFocus, StoryboardSubjectFocus>> = {
    hero: "hero",
    enemy: "enemy",
    group: "group",
    environment: "environment",
    prop: "prop",
    reaction: "reaction",
    npc: "important_npc",
    ally: "hero",
    duo: "group",
    speaker: "hero",
    location: "environment",
    aftermath: "reaction",
  };
  return map[core] ?? toSubjectFocus(String(core));
}

function storyboardCutawayFromBlueprint(ex: Record<string, unknown>, bp: PanelBlueprintPremium): StoryboardCutawayType {
  const raw = ex.cutawayType ?? bp.cutawayType;
  if (typeof raw === "string" && CUTAWAY_SET.has(raw)) return raw as StoryboardCutawayType;
  return toCutawayType(typeof raw === "string" ? raw : bp.cutawayType);
}

function storyboardRenderModeFromBlueprint(ex: Record<string, unknown>, bp: PanelBlueprintPremium): StoryboardRenderMode {
  if (typeof ex.renderMode === "string" && RENDER_MODE_SET.has(ex.renderMode)) {
    return ex.renderMode as StoryboardRenderMode;
  }
  return deriveRenderMode(bp);
}

function storyboardShotTypeFromBlueprint(ex: Record<string, unknown>, bp: PanelBlueprintPremium): StoryboardShotType {
  if (typeof ex.shotType === "string" && SHOT_TYPE_SET.has(ex.shotType)) {
    return ex.shotType as StoryboardShotType;
  }
  return toShotType(bp.shotType);
}

function storyboardCameraFromBlueprint(ex: Record<string, unknown>, bp: PanelBlueprintPremium): StoryboardCameraAngle {
  if (typeof ex.cameraAngle === "string") {
    return toCameraAngle(ex.cameraAngle);
  }
  return toCameraAngle(bp.cameraAngle);
}

function panelPurposeFromBlueprint(ex: Record<string, unknown>, bp: PanelBlueprintPremium): PanelPurpose {
  if (isPanelPurpose(ex.panelPurpose)) return ex.panelPurpose;
  return derivePanelPurpose(bp);
}

function parsePageLayoutFromBlueprint(firstBp: PanelBlueprintPremium | null): StoryboardLayoutTemplate | null {
  if (!firstBp) return null;
  const ex = asRecord(firstBp);
  const hint = ex.layoutTemplate ?? ex.layoutHint;
  if (typeof hint === "string" && LAYOUT_SET.has(hint)) return hint as StoryboardLayoutTemplate;
  return null;
}

function parseStoryboardTargetAspectFromEx(
  ex: Record<string, unknown>,
): StoryboardPanel["targetAspectRatio"] | undefined {
  const v = ex.targetAspectRatio;
  if (v === "portrait" || v === "landscape" || v === "square") return v;
  return undefined;
}

function mergeMustShow(bp: PanelBlueprintPremium, ex: Record<string, unknown>): string[] {
  const fromContract = [
    ...bp.requiredProps.map((prop) => prop.canonicalName),
    ...bp.requiredLocationSignals,
  ];
  const extra = Array.isArray(ex.mustShow)
    ? ex.mustShow.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];
  return [...new Set([...fromContract, ...extra])];
}

function approvedBlueprintToStoryboardPanel(
  bp: PanelBlueprintPremium,
  ctx: {
    pageNumber: number;
    idx: number;
    rawPanels: PanelBlueprintPremium[];
    chapterLocationName: string | null;
  },
): StoryboardPanel {
  const ex = asRecord(bp);
  const renderMode = storyboardRenderModeFromBlueprint(ex, bp);
  const subjectFocus = storyboardSubjectFocusFromBlueprint(ex, bp);
  const shotType = storyboardShotTypeFromBlueprint(ex, bp);
  const cameraAngle = storyboardCameraFromBlueprint(ex, bp);
  const cutawayType = storyboardCutawayFromBlueprint(ex, bp);
  const panelPurpose = panelPurposeFromBlueprint(ex, bp);

  // P0.7 — Utiliser resolveBlueprintLocationName pour éviter "unknown"
  const locationName =
    typeof ex.locationName === "string" && ex.locationName.length > 0
      ? ex.locationName
      : resolveBlueprintLocationName(bp, ctx.chapterLocationName);

  const emotionLine = typeof ex.emotionLine === "string" ? ex.emotionLine : "";

  const dialogue = Array.isArray(ex.dialogue)
    ? (ex.dialogue as StoryboardPanel["dialogue"])
    : legacyDialogueLinesFromBlueprintPremium(bp);

  const narration =
    typeof ex.narration === "string"
      ? ex.narration
      : bp.narrationText ?? null;

  const sfx = Array.isArray(ex.sfx) ? (ex.sfx as string[]) : (bp.sfxCues ?? []);

  const textContract =
    ex.textContract !== undefined && ex.textContract !== null
      ? (ex.textContract as StoryboardPanel["textContract"])
      : resolvePanelTextContractFromBlueprintPremium(bp);

  const mustNotShow = Array.isArray(ex.mustNotShow)
    ? ex.mustNotShow.filter((x): x is string => typeof x === "string")
    : [];

  const continuityNotes = Array.isArray(ex.continuityNotes)
    ? ex.continuityNotes.filter((x): x is string => typeof x === "string")
    : (bp.notes ?? []);

  const characters = resolveCharacters(bp);

  const visualAnchorsRaw = ex.visualAnchors;
  const visualAnchors =
    visualAnchorsRaw && typeof visualAnchorsRaw === "object" && !Array.isArray(visualAnchorsRaw)
      ? ({
          ...visualAnchorsRaw,
          characterIds: Array.isArray((visualAnchorsRaw as Record<string, unknown>).characterIds)
            ? (visualAnchorsRaw as Record<string, unknown>).characterIds as string[]
            : characters,
        } as StoryboardPanel["visualAnchors"])
      : {
          characterIds: characters,
          environmentAnchorId: null,
          previousPanelAnchorId: ctx.idx > 0 ? ctx.rawPanels[ctx.idx - 1]!.panelId : null,
        };

  const npcs = Array.isArray(ex.npcs) ? (ex.npcs as StoryboardPanelNpc[]) : undefined;

  const inferredLayout = inferStoryboardPanelLayoutMeta(renderMode);
  const rawLayoutHint = ex.layoutHint;
  const rawIsPageLayoutToken =
    typeof rawLayoutHint === "string" && rawLayoutHint.length > 0 && LAYOUT_SET.has(rawLayoutHint);
  const layoutHint =
    typeof ex.panelLayoutHint === "string" && ex.panelLayoutHint.length > 0
      ? ex.panelLayoutHint
      : rawIsPageLayoutToken || typeof rawLayoutHint !== "string" || rawLayoutHint.length === 0
        ? inferredLayout.layoutHint
        : rawLayoutHint;
  const targetAspectRatio = parseStoryboardTargetAspectFromEx(ex) ?? inferredLayout.targetAspectRatio;
  const slotType =
    typeof ex.slotType === "string" && ex.slotType.length > 0 ? ex.slotType : inferredLayout.slotType;

  return {
    panelId: bp.panelId,
    pageNumber: ctx.pageNumber,
    panelNumberInPage: ctx.idx + 1,
    globalPanelIndex: bp.panelNumber - 1,
    sourceBeatId: bp.beatId,
    panelPurpose,
    renderMode,
    shotType,
    cameraAngle,
    subjectFocus,
    cutawayType,
    characters,
    locationId: typeof ex.locationId === "string" ? ex.locationId : null,
    locationName,
    actionLine: typeof ex.actionLine === "string" ? ex.actionLine : bp.purpose,
    emotionLine,
    dialogue,
    narration,
    sfx,
    textContract,
    mustShow: mergeMustShow(bp, ex),
    mustNotShow,
    continuityNotes,
    visualAnchors,
    sceneContextLabel: (ex.sceneContextLabel as string | null | undefined) ?? bp.sceneContextLabel ?? null,
    readerTemplateId: (ex.readerTemplateId as typeof bp.readerTemplateId) ?? bp.readerTemplateId ?? null,
    textPlacementHint: (ex.textPlacementHint as typeof bp.textPlacementHint) ?? bp.textPlacementHint ?? null,
    sceneRoster: Array.isArray(ex.sceneRoster) ? (ex.sceneRoster as typeof bp.sceneRoster) : (bp.sceneRoster ?? []),
    continuityState:
      ex.continuityState && typeof ex.continuityState === "object"
        ? (ex.continuityState as typeof bp.continuityState)
        : (bp.continuityState ?? null),
    characterVisualDna: Array.isArray(ex.characterVisualDna)
      ? (ex.characterVisualDna as typeof bp.characterVisualDna)
      : (bp.characterVisualDna ?? []),
    npcVisualDna: Array.isArray(ex.npcVisualDna) ? (ex.npcVisualDna as typeof bp.npcVisualDna) : (bp.npcVisualDna ?? []),
    creatureVisualDna: Array.isArray(ex.creatureVisualDna)
      ? (ex.creatureVisualDna as typeof bp.creatureVisualDna)
      : (bp.creatureVisualDna ?? []),
    vehicleVisualDna: Array.isArray(ex.vehicleVisualDna)
      ? (ex.vehicleVisualDna as typeof bp.vehicleVisualDna)
      : (bp.vehicleVisualDna ?? []),
    factionVisualDna: Array.isArray(ex.factionVisualDna)
      ? (ex.factionVisualDna as typeof bp.factionVisualDna)
      : (bp.factionVisualDna ?? []),
    worldPropsVisualDna: Array.isArray(ex.worldPropsVisualDna)
      ? (ex.worldPropsVisualDna as NonNullable<StoryboardPanel["worldPropsVisualDna"]>)
      : requiredPropsToWorldPropsVisualDna(bp.requiredProps ?? [], bp.beatId),
    environmentVisualDna:
      ex.environmentVisualDna !== undefined
        ? (ex.environmentVisualDna as typeof bp.environmentVisualDna)
        : (bp.environmentVisualDna ?? null),
    npcs,
    layoutHint,
    targetAspectRatio,
    slotType,
  };
}

/**
 * Convertit `productionPlan.panelBlueprints` (plan approuvé) en {@link StoryboardPlan}.
 * Les valeurs storyboard déjà présentes sur les blueprints (ex. `renderMode`) sont
 * conservées ; sinon on retombe sur les mêmes dérivations que le builder premium.
 */
export function buildStoryboardPlanFromApprovedProductionPlan(
  input: BuildStoryboardPlanFromApprovedProductionPlanInput,
): StoryboardPlan {
  const rawBlueprints = input.productionPlan.panelBlueprints;
  if (!Array.isArray(rawBlueprints) || rawBlueprints.length === 0) {
    throw new Error(
      `approved_production_plan_missing_blueprints chapterId=${input.chapterId} projectId=${input.projectId}`,
    );
  }

  const blueprints: PanelBlueprintPremium[] = [];
  for (const raw of rawBlueprints) {
    const bp = coerceBlueprint(raw);
    if (bp) blueprints.push(bp);
  }
  if (blueprints.length === 0) {
    throw new Error(
      `approved_production_plan_invalid_blueprints chapterId=${input.chapterId} projectId=${input.projectId}`,
    );
  }

  const pageSize = input.projectFormat === "webtoon" ? 3 : 5;
  const explicitPages = input.productionPlanPages ?? [];
  const pagesFromPlan = input.productionPlan.pages;
  const explicitPagesMerged =
    Array.isArray(pagesFromPlan) && pagesFromPlan.length > 0
      ? pagesFromPlan as Array<{ pageNumber: number; panelCount: number; beatIds?: string[] | null }>
      : explicitPages;

  // P0.3 — Utiliser assignBlueprintsToPages pour redistribuer correctement
  // même si tous les blueprints ont pageNumber=1
  // P0.2 — Ne jamais créer de page avec plus de panels que le layout max
  const maxPanelsPerPage = getMaxPanelsPerPage(input.projectFormat);
  const panelsByPage = assignBlueprintsToPages({
    panelBlueprints: blueprints,
    pages: explicitPagesMerged,
    fallbackPageSize: pageSize,
    maxPanelsPerPage,
  });

  // Ne pas réinjecter les pages explicites vides
  const pageNumbers = Array.from(panelsByPage.keys()).sort((a, b) => a - b);

  const explicitPagesByNumber = new Map(explicitPagesMerged.map((page) => [page.pageNumber, page]));
  const chapterLocationName = input.chapterLocationName ?? null;

  const pages: StoryboardPage[] = pageNumbers.map((pageNumber) => {
    const rawPanels = (panelsByPage.get(pageNumber) ?? []).sort((a, b) => a.panelNumber - b.panelNumber);
    const explicitPage = explicitPagesByNumber.get(pageNumber);
    const layoutFromBlueprint = parsePageLayoutFromBlueprint(rawPanels[0] ?? null);
    const panels: StoryboardPanel[] = rawPanels.map((bp, idx) =>
      approvedBlueprintToStoryboardPanel(bp, {
        pageNumber,
        idx,
        rawPanels,
        chapterLocationName,
      }),
    );

    return {
      pageNumber,
      layoutTemplate:
        layoutFromBlueprint ?? pickLayoutTemplateForPage(panels.length, input.projectFormat),
      dramaticRole: pageNumber <= 2 ? "setup" : "development",
      beatIds: explicitPage?.beatIds?.length
        ? explicitPage.beatIds
        : Array.from(new Set(rawPanels.map((b) => b.beatId))),
      panels,
    };
  });

  console.info(
    `[pipeline:v3:approved-plan-driven] chapterId=${input.chapterId} projectId=${input.projectId} ` +
      `chapterNumber=${input.chapterNumber} blueprints=${blueprints.length} projectFormat=${input.projectFormat}`,
  );

  return {
    chapterId: input.chapterId,
    totalTargetPanels: blueprints.length,
    pages,
    editorialDiagnostics: buildEditorialDiagnostics(pages),
  };
}
