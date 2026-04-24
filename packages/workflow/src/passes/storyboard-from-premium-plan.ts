import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import { inferStoryboardPanelLayoutMeta } from "@manga-ai-studio/ai";
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
} from "@manga-ai-studio/ai";

export function toShotType(raw: string): StoryboardShotType {
  const v = raw.toLowerCase();
  if (v === "wide" || v === "establishing") return "wide";
  if (v === "close_up" || v === "closeup") return "closeup";
  if (v === "extreme_closeup" || v === "extreme_close-up") return "extreme_closeup";
  if (v === "over_shoulder" || v === "over-the-shoulder") return "over_shoulder";
  return "medium";
}

export function toCameraAngle(raw: string): StoryboardCameraAngle {
  const v = raw.toLowerCase();
  if (v === "low" || v === "low_angle") return "low";
  if (v === "high" || v === "high_angle") return "high";
  if (v === "dutch") return "dutch";
  if (v === "birds_eye" || v === "bird_eye") return "birds_eye";
  if (v === "worm" || v === "worm_eye") return "worm";
  return "eye_level";
}

export function toSubjectFocus(raw: string): StoryboardSubjectFocus {
  const v = raw.toLowerCase();
  if (v.includes("environment")) return "environment";
  if (v.includes("prop")) return "prop";
  if (v.includes("enemy") || v.includes("antagon")) return "enemy";
  if (v.includes("creature") || v.includes("monster") || v.includes("beast")) return "threat";
  if (v.includes("npc")) return "important_npc";
  if (v.includes("group")) return "group";
  if (v.includes("reaction")) return "reaction";
  if (v.includes("threat")) return "threat";
  return "hero";
}

export function toCutawayType(raw: string | null | undefined): StoryboardCutawayType {
  const v = (raw ?? "none").toLowerCase();
  if (v.includes("environment")) return "environment";
  if (v.includes("prop") || v.includes("object")) return "prop_insert";
  if (v.includes("reaction")) return "reaction";
  if (v.includes("crowd") || v.includes("npc_group")) return "crowd";
  if (v.includes("aftermath")) return "aftermath";
  if (v.includes("surveillance")) return "surveillance";
  return "none";
}

export function deriveRenderMode(bp: PanelBlueprintPremium): StoryboardRenderMode {
  const cutaway = toCutawayType(bp.cutawayType);
  const focus = toSubjectFocus(bp.subjectFocus);
  const shot = toShotType(bp.shotType);

  const requiredSubjects = ((bp.requiredSubjects as string[] | undefined) ?? []).join(" ").toLowerCase();
  const purpose = (bp.purpose ?? "").toLowerCase();
  const isCreaturePanel =
    requiredSubjects.includes("creature") ||
    requiredSubjects.includes("monster") ||
    requiredSubjects.includes("beast") ||
    purpose.includes("creature") ||
    purpose.includes("monstre") ||
    purpose.includes("créature");

  if (isCreaturePanel) return "creature_reveal";
  if (cutaway === "environment") return "establishing_environment";
  if (cutaway === "prop_insert") return "insert_object";
  if (cutaway === "reaction") return "reaction_closeup";
  if (cutaway === "surveillance") return "surveillance_reveal";
  if (cutaway === "crowd") return "group_tension";
  if (cutaway === "aftermath") return "combat_aftermath";
  if (focus === "threat") return "creature_reveal";
  if (focus === "enemy") return shot === "closeup" || shot === "extreme_closeup" ? "enemy_closeup" : "enemy_reveal";
  if (focus === "important_npc") return "npc_closeup";
  if (focus === "reaction") return "reaction_closeup";
  if (focus === "group") return shot === "over_shoulder" ? "dialogue_over_shoulder" : "group_tension";
  return shot === "closeup" || shot === "extreme_closeup" ? "hero_closeup" : "dialogue_two_shot";
}

export function derivePanelPurpose(bp: PanelBlueprintPremium): PanelPurpose {
  const cutaway = toCutawayType(bp.cutawayType);
  const focus = toSubjectFocus(bp.subjectFocus);
  if (cutaway === "environment") return "location_establishing";
  if (cutaway === "prop_insert") return "prop_insert";
  if (cutaway === "surveillance") return "surveillance_insert";
  if (cutaway === "reaction") return "reaction_closeup";
  if (cutaway === "aftermath") return "combat_aftermath";
  if (focus === "enemy") return "enemy_focus";
  if (focus === "important_npc") return "npc_focus";
  if (focus === "group") return "group_tension";
  return "hero_focus";
}

export function pickLayoutTemplateForPage(panelCount: number, projectFormat: "manga" | "webtoon"): StoryboardLayoutTemplate {
  if (projectFormat === "webtoon") {
    if (panelCount <= 1) return "splash";
    if (panelCount <= 3) return "vertical_strip";
    return "vertical_hero_4";
  }
  if (panelCount <= 1) return "splash";
  if (panelCount === 2) return "cinematic_bar";
  if (panelCount === 3) return "action_strip";
  if (panelCount === 4) return "grid_2x2";
  if (panelCount === 5) return "staggered_5";
  return "grid_2x3";
}

function uniqStrings(values: unknown[]): string[] {
  return Array.from(new Set(
    values.filter((v): v is string => typeof v === "string" && v.trim().length > 0),
  ));
}

export function resolveCharacters(bp: PanelBlueprintPremium): string[] {
  return uniqStrings([
    ...(bp.mustShowCharacterIds ?? []),
    ...(bp.requiredCharacterIds ?? []),
    ...(bp.requiredCharacters ?? []),
    bp.speakerAnchorCharacterId ?? null,
    ...((bp.characterVisualDna as Array<{ characterId?: string }> | undefined) ?? []).map((dna) => dna.characterId),
    ...((bp.sceneRoster as Array<{ entityType?: string; entityId?: string }> | undefined) ?? [])
      .filter((entry) => entry.entityType === "character")
      .map((entry) => entry.entityId),
  ]);
}

export function resolveBlueprintLocationName(
  bp: PanelBlueprintPremium,
  fallback: string | null | undefined,
): string {
  const envDna = bp.environmentVisualDna as { locationName?: string } | null | undefined;
  const envName = envDna?.locationName;
  if (typeof envName === "string" && envName.trim()) return envName.trim();

  const sceneLabel = bp.sceneContextLabel;
  if (typeof sceneLabel === "string" && sceneLabel.trim()) return sceneLabel.trim();

  const firstLocationSignal = bp.requiredLocationSignals?.find(
    (signal) => typeof signal === "string" && signal.trim().length > 0,
  );
  if (firstLocationSignal) return firstLocationSignal.trim();

  const cleanFallback = fallback?.trim();
  if (cleanFallback && cleanFallback.toLowerCase() !== "unknown") {
    return cleanFallback;
  }

  return "story-consistent setting";
}

function extractNonLocationMustShow(bp: PanelBlueprintPremium, usedAsLocation: string): string[] {
  const signals = bp.requiredLocationSignals ?? [];
  return signals.filter(
    (v) => typeof v === "string" && v.trim().length > 0 && v.trim() !== usedAsLocation,
  );
}

export function assignBlueprintsToPages(args: {
  panelBlueprints: PanelBlueprintPremium[];
  pages?: Array<{ pageNumber: number; panelCount: number; beatIds?: string[] | null }>;
  fallbackPageSize: number;
}): Map<number, PanelBlueprintPremium[]> {
  const panelsByPage = new Map<number, PanelBlueprintPremium[]>();
  const sorted = [...args.panelBlueprints].sort((a, b) => a.panelNumber - b.panelNumber);

  const explicitPages = Array.isArray(args.pages)
    ? args.pages.filter((p) => Number.isFinite(p.pageNumber) && Number.isFinite(p.panelCount) && p.panelCount > 0)
    : [];

  const allBlueprintPages = new Set(
    sorted
      .map((bp) => bp.pageNumber)
      .filter((n): n is number => typeof n === "number" && n > 0),
  );

  const pageNumbersLookBroken =
    allBlueprintPages.size <= 1 && explicitPages.length > 1;

  if (explicitPages.length > 0 && pageNumbersLookBroken) {
    console.warn(
      `[storyboard-from-premium-plan] pageNumber_broken blueprints=${sorted.length} ` +
        `distinctPages=${allBlueprintPages.size} explicitPages=${explicitPages.length} — ` +
        `redistributing via panelCount`,
    );
    let cursor = 0;
    for (const page of explicitPages.sort((a, b) => a.pageNumber - b.pageNumber)) {
      const slice = sorted.slice(cursor, cursor + page.panelCount);
      if (slice.length > 0) panelsByPage.set(page.pageNumber, slice);
      cursor += page.panelCount;
    }

    if (cursor < sorted.length) {
      let pageNumber = explicitPages[explicitPages.length - 1]!.pageNumber + 1;
      for (let i = cursor; i < sorted.length; i += args.fallbackPageSize) {
        panelsByPage.set(pageNumber++, sorted.slice(i, i + args.fallbackPageSize));
      }
    }

    return panelsByPage;
  }

  for (const bp of sorted) {
    const pageNumber =
      typeof bp.pageNumber === "number" && bp.pageNumber > 0
        ? bp.pageNumber
        : Math.floor((bp.panelNumber - 1) / args.fallbackPageSize) + 1;

    const arr = panelsByPage.get(pageNumber) ?? [];
    arr.push(bp);
    panelsByPage.set(pageNumber, arr);
  }

  return panelsByPage;
}

export function buildEditorialDiagnostics(pages: StoryboardPage[]): StoryboardPlan["editorialDiagnostics"] {
  const panels = pages.flatMap((page) => page.panels);
  const total = panels.length || 1;
  return {
    varietyScore: 1,
    heroFocusRatio: panels.filter((panel) => panel.subjectFocus === "hero").length / total,
    environmentRatio: panels.filter((panel) => panel.subjectFocus === "environment").length / total,
    insertRatio: panels.filter((panel) => panel.renderMode === "insert_object").length / total,
    reactionRatio: panels.filter((panel) => panel.renderMode === "reaction_closeup").length / total,
    warnings: [],
    blockers: [],
  };
}

export function buildStoryboardPlanFromPremiumBlueprints(args: {
  chapterId: string;
  projectFormat: "manga" | "webtoon";
  panelBlueprints: PanelBlueprintPremium[];
  pages?: Array<{ pageNumber: number; panelCount: number; beatIds?: string[] | null }>;
  chapterLocationName?: string | null;
}): StoryboardPlan {
  const pageSize = args.projectFormat === "webtoon" ? 3 : 5;
  const explicitPages = args.pages ?? [];

  const panelsByPage = assignBlueprintsToPages({
    panelBlueprints: args.panelBlueprints,
    pages: explicitPages,
    fallbackPageSize: pageSize,
  });

  const emptyExplicitPages = explicitPages
    .filter((page) => !panelsByPage.has(page.pageNumber))
    .map((page) => page.pageNumber);

  if (emptyExplicitPages.length > 0) {
    console.warn(
      `[storyboard-from-premium-plan] ignored_empty_explicit_pages=${emptyExplicitPages.join(",")}`,
    );
  }

  const pageNumbers = Array.from(panelsByPage.keys()).sort((a, b) => a - b);

  const explicitPagesByNumber = new Map(explicitPages.map((page) => [page.pageNumber, page]));
  const pages: StoryboardPage[] = pageNumbers.map((pageNumber) => {
    const rawPanels = (panelsByPage.get(pageNumber) ?? []).sort((a, b) => a.panelNumber - b.panelNumber);
    const explicitPage = explicitPagesByNumber.get(pageNumber);
    const panels: StoryboardPanel[] = rawPanels.map((bp, idx) => {
      const renderMode = deriveRenderMode(bp);
      const layout = inferStoryboardPanelLayoutMeta(renderMode);
      return {
        panelId: bp.panelId,
        pageNumber,
        panelNumberInPage: idx + 1,
        globalPanelIndex: bp.panelNumber - 1,
        sourceBeatId: bp.beatId,
        panelPurpose: derivePanelPurpose(bp),
        renderMode,
        layoutHint: layout.layoutHint,
        targetAspectRatio: layout.targetAspectRatio,
        slotType: layout.slotType,
        shotType: toShotType(bp.shotType),
        cameraAngle: toCameraAngle(bp.cameraAngle),
        subjectFocus: toSubjectFocus(bp.subjectFocus),
        cutawayType: toCutawayType(bp.cutawayType),
        characters: resolveCharacters(bp),
        locationId: null,
        locationName: resolveBlueprintLocationName(bp, args.chapterLocationName),
        actionLine: bp.purpose,
        emotionLine: "",
        dialogue: bp.dialogueLines ?? [],
        narration: bp.narrationText ?? null,
        sfx: bp.sfxCues ?? [],
        mustShow: [
          ...bp.requiredProps.map((prop) => prop.canonicalName),
          ...extractNonLocationMustShow(bp, resolveBlueprintLocationName(bp, args.chapterLocationName)),
        ],
        mustNotShow: [],
        continuityNotes: bp.notes ?? [],
        visualAnchors: {
          characterIds: resolveCharacters(bp),
          environmentAnchorId: null,
          previousPanelAnchorId: idx > 0 ? rawPanels[idx - 1]!.panelId : null,
        },
        sceneContextLabel: bp.sceneContextLabel ?? null,
        readerTemplateId: bp.readerTemplateId ?? null,
        textPlacementHint: bp.textPlacementHint ?? null,
        sceneRoster: bp.sceneRoster ?? [],
        continuityState: bp.continuityState ?? null,
        characterVisualDna: bp.characterVisualDna ?? [],
        npcVisualDna: bp.npcVisualDna ?? [],
        environmentVisualDna: bp.environmentVisualDna ?? null,
      };
    });

    return {
      pageNumber,
      layoutTemplate: pickLayoutTemplateForPage(panels.length, args.projectFormat),
      dramaticRole: pageNumber <= 2 ? "setup" : "development",
      beatIds: explicitPage?.beatIds?.length
        ? explicitPage.beatIds
        : Array.from(new Set(rawPanels.map((bp) => bp.beatId))),
      panels,
    };
  });

  return {
    chapterId: args.chapterId,
    totalTargetPanels: args.panelBlueprints.length,
    pages,
    editorialDiagnostics: buildEditorialDiagnostics(pages),
  };
}
