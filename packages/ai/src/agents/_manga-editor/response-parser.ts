import type {
  StoryboardLayoutTemplate,
  StoryboardPage,
  StoryboardPanel,
  StoryboardPlan,
  StoryboardRenderMode,
  StoryboardShotType,
  StoryboardSubjectFocus,
  StoryboardCutawayType,
  StoryboardCameraAngle,
} from "../../contracts/storyboard-plan";
import {
  STORYBOARD_LAYOUT_TEMPLATES,
  STORYBOARD_RENDER_MODES,
  STORYBOARD_SHOT_TYPES,
  STORYBOARD_SUBJECT_FOCUSES,
  STORYBOARD_CUTAWAY_TYPES,
  isPanelPurpose,
  type PanelPurpose,
} from "../../contracts/storyboard-plan";

function defaultPurposeForRenderMode(mode: StoryboardRenderMode): PanelPurpose {
  switch (mode) {
    case "hero_closeup":
      return "hero_focus";
    case "npc_closeup":
      return "npc_focus";
    case "enemy_closeup":
    case "enemy_reveal":
      return "enemy_focus";
    case "reaction_closeup":
      return "reaction_closeup";
    case "dialogue_two_shot":
      return "dialogue_anchor";
    case "dialogue_over_shoulder":
      return "dialogue_over_shoulder";
    case "insert_object":
      return "prop_insert";
    case "surveillance_reveal":
      return "surveillance_insert";
    case "group_tension":
      return "group_tension";
    case "establishing_environment":
      return "location_establishing";
    case "silent_transition":
      return "transition";
    case "threat_silhouette":
      return "threat_silhouette";
    case "creature_reveal":
      return "creature_reveal";
    case "vehicle_reveal":
      return "vehicle_reveal";
    case "faction_reveal":
      return "faction_reveal";
    case "aftermath_dialogue":
      return "combat_aftermath";
    case "combat_exchange":
      return "combat_impact";
    case "combat_aftermath":
      return "combat_aftermath";
    default:
      return "dialogue_anchor";
  }
}

function sanitizePanelPurpose(
  raw: unknown,
  renderMode: StoryboardRenderMode,
): PanelPurpose {
  if (isPanelPurpose(raw)) return raw;
  return defaultPurposeForRenderMode(renderMode);
}

function sanitizeEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  return fallback;
}

function pickFallbackBeatId(globalIndex: number, orderedBeatIds: string[]): string {
  if (orderedBeatIds.length === 0) return "";
  return orderedBeatIds[globalIndex % orderedBeatIds.length] ?? orderedBeatIds[0]!;
}

export function sanitizePanel(
  raw: Record<string, unknown>,
  globalIndex: number,
  pageNumber: number,
  panelNumberInPage: number,
  validBeatIds: Set<string>,
  orderedBeatIds: string[],
  onBeatFallback?: (args: { raw: unknown; resolved: string }) => void,
): StoryboardPanel | null {
  let sourceBeatId = typeof raw.sourceBeatId === "string" ? raw.sourceBeatId : "";
  if (!validBeatIds.has(sourceBeatId)) {
    const fallback = pickFallbackBeatId(globalIndex, orderedBeatIds);
    if (!fallback) return null;
    onBeatFallback?.({ raw: raw.sourceBeatId, resolved: fallback });
    sourceBeatId = fallback;
  }

  const renderMode = sanitizeEnum<StoryboardRenderMode>(
    raw.renderMode,
    STORYBOARD_RENDER_MODES,
    "dialogue_two_shot",
  );
  const shotType = sanitizeEnum<StoryboardShotType>(
    raw.shotType,
    STORYBOARD_SHOT_TYPES,
    "medium",
  );
  const subjectFocus = sanitizeEnum<StoryboardSubjectFocus>(
    raw.subjectFocus,
    STORYBOARD_SUBJECT_FOCUSES,
    "group",
  );
  const cutawayType = sanitizeEnum<StoryboardCutawayType>(
    raw.cutawayType,
    STORYBOARD_CUTAWAY_TYPES,
    "none",
  );
  const cameraAngle = sanitizeEnum<StoryboardCameraAngle>(
    raw.cameraAngle,
    ["eye_level", "low", "high", "dutch", "birds_eye", "worm"] as const,
    "eye_level",
  );

  const characters = Array.isArray(raw.characters)
    ? raw.characters.filter((c): c is string => typeof c === "string")
    : [];
  const mustShow = Array.isArray(raw.mustShow)
    ? raw.mustShow.filter((c): c is string => typeof c === "string")
    : [];
  const mustNotShow = Array.isArray(raw.mustNotShow)
    ? raw.mustNotShow.filter((c): c is string => typeof c === "string")
    : [];
  const continuityNotes = Array.isArray(raw.continuityNotes)
    ? raw.continuityNotes.filter((c): c is string => typeof c === "string")
    : [];
  const sfx = Array.isArray(raw.sfx)
    ? raw.sfx.filter((c): c is string => typeof c === "string")
    : [];

  const dialogueRaw = Array.isArray(raw.dialogue) ? raw.dialogue : [];
  const dialogue = dialogueRaw
    .filter((d): d is { speaker: unknown; text: unknown } => typeof d === "object" && d !== null)
    .map((d) => ({
      speaker: typeof d.speaker === "string" ? d.speaker : "",
      text: typeof d.text === "string" ? d.text : "",
    }))
    .filter((d) => d.text.length > 0);

  const anchorsRaw = raw.visualAnchors as Record<string, unknown> | undefined;
  const anchorCharacterIds = Array.isArray(anchorsRaw?.characterIds)
    ? (anchorsRaw?.characterIds as unknown[]).filter((c): c is string => typeof c === "string")
    : characters;

  return {
    panelId:
      typeof raw.panelId === "string" && raw.panelId.length > 0
        ? raw.panelId
        : `${sourceBeatId}-p${globalIndex + 1}`,
    pageNumber,
    panelNumberInPage,
    globalPanelIndex: globalIndex,
    sourceBeatId,
    panelPurpose: sanitizePanelPurpose(raw.panelPurpose, renderMode),
    renderMode,
    shotType,
    cameraAngle,
    subjectFocus,
    cutawayType,
    characters,
    locationId: typeof raw.locationId === "string" ? raw.locationId : null,
    locationName: typeof raw.locationName === "string" ? raw.locationName : "",
    actionLine: typeof raw.actionLine === "string" ? raw.actionLine : "",
    emotionLine: typeof raw.emotionLine === "string" ? raw.emotionLine : "",
    dialogue,
    narration: typeof raw.narration === "string" ? raw.narration : null,
    sfx,
    mustShow,
    mustNotShow,
    continuityNotes,
    visualAnchors: {
      characterIds: anchorCharacterIds,
      environmentAnchorId:
        typeof anchorsRaw?.environmentAnchorId === "string"
          ? (anchorsRaw.environmentAnchorId as string)
          : null,
      previousPanelAnchorId:
        typeof anchorsRaw?.previousPanelAnchorId === "string"
          ? (anchorsRaw.previousPanelAnchorId as string)
          : null,
    },
  };
}

export function sanitizePage(
  raw: Record<string, unknown>,
  pageNumber: number,
  globalStart: number,
  validBeatIds: Set<string>,
  orderedBeatIds: string[],
  onBeatFallback?: (args: { raw: unknown; resolved: string }) => void,
): { page: StoryboardPage; nextGlobalIndex: number } | null {
  const layoutTemplate = sanitizeEnum<StoryboardLayoutTemplate>(
    raw.layoutTemplate,
    STORYBOARD_LAYOUT_TEMPLATES,
    "grid_2x2",
  );
  const panelsRaw = Array.isArray(raw.panels) ? raw.panels : [];
  const panels: StoryboardPanel[] = [];
  let globalIndex = globalStart;
  for (let i = 0; i < panelsRaw.length; i++) {
    const rawPanel = panelsRaw[i];
    if (!rawPanel || typeof rawPanel !== "object") continue;
    const panel = sanitizePanel(
      rawPanel as Record<string, unknown>,
      globalIndex,
      pageNumber,
      i + 1,
      validBeatIds,
      orderedBeatIds,
      onBeatFallback,
    );
    if (!panel) continue;
    panels.push(panel);
    globalIndex += 1;
  }
  if (panels.length === 0) return null;

  const beatIdsRaw = Array.isArray(raw.beatIds) ? raw.beatIds : [];
  const beatIds = beatIdsRaw.filter((b): b is string => typeof b === "string" && validBeatIds.has(b));

  return {
    page: {
      pageNumber,
      layoutTemplate,
      dramaticRole: typeof raw.dramaticRole === "string" ? raw.dramaticRole : "setup",
      beatIds: beatIds.length > 0 ? beatIds : panels.map((p) => p.sourceBeatId),
      panels,
    },
    nextGlobalIndex: globalIndex,
  };
}

export function computeDiagnostics(pages: StoryboardPage[]): StoryboardPlan["editorialDiagnostics"] {
  const allPanels = pages.flatMap((p) => p.panels);
  const total = allPanels.length || 1;
  const heroFocus = allPanels.filter((p) => p.subjectFocus === "hero").length;
  const environment = allPanels.filter((p) => p.subjectFocus === "environment").length;
  const insert = allPanels.filter((p) => p.renderMode === "insert_object").length;
  const reaction = allPanels.filter((p) => p.renderMode === "reaction_closeup").length;
  const distinctModes = new Set(allPanels.map((p) => p.renderMode)).size;
  const heroRatio = heroFocus / total;
  const envRatio = environment / total;
  const warnings: string[] = [];
  if (heroRatio > 0.6) warnings.push(`hero_focus_ratio_high=${heroRatio.toFixed(2)}`);
  if (envRatio < 0.05) warnings.push("environment_ratio_low");
  return {
    varietyScore: distinctModes / 13,
    heroFocusRatio: heroRatio,
    environmentRatio: envRatio,
    insertRatio: insert / total,
    reactionRatio: reaction / total,
    warnings,
    blockers: [],
  };
}
