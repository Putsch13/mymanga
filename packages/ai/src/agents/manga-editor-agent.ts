/**
 * Manga Editor / Storyboard Director (IA 2).
 *
 * Mission : transformer un StoryArc en StoryboardPlan (pages, layouts,
 * panels, renderMode, shotType, subjectFocus, cutawayType, ...).
 *
 * Règles strictes (cf. prompt système, Sprint 3) :
 *   - ne PAS écrire de prompts image
 *   - ne PAS inventer de lore
 *   - ne PAS inventer de combat non présent dans les beats
 *   - répartir 70–75 panels par défaut
 *   - éviter 20 pages de closeups héros
 *
 * Sprint 1 : implémentation déterministe (pas de LLM) qui produit un
 * storyboard simple mais valide à partir des beats. Le prompt LLM sera
 * branché dans Sprint 3.
 */

import type { StoryArc, StoryBeat } from "../contracts/story-arc";
import type {
  PanelPurpose,
  StoryboardLayoutTemplate,
  StoryboardPage,
  StoryboardPanel,
  StoryboardPlan,
  StoryboardRenderMode,
  StoryboardShotType,
  StoryboardSubjectFocus,
  StoryboardCutawayType,
} from "../contracts/storyboard-plan";
import { isPanelPurpose } from "../contracts/storyboard-plan";

/**
 * P5 — Le format éditorial du projet (manga paginé vs webtoon vertical)
 * est une contrainte DÉCISIVE pour le storyboard, pas une simple
 * préférence de lecture. On doit paginer différemment :
 *   - manga : 5 panels / page, layouts mangas classiques (splash,
 *     grid, asymétrique, cinematic bar...)
 *   - webtoon : 3 panels / page (flow vertical à respirations
 *     dramatiques), layouts verticaux dominants
 */
export type ProjectFormat = "manga" | "webtoon";

export interface MangaEditorInput {
  storyArc: StoryArc;
  targetPanelCount?: number;
  heroCharacterIds?: string[];
  projectFormat?: ProjectFormat;
}

export interface MangaEditorOutput {
  storyboardPlan: StoryboardPlan;
  warnings: string[];
}

const DEFAULT_TARGET_PANELS = 72;

export async function runMangaEditorAgent(input: MangaEditorInput): Promise<MangaEditorOutput> {
  const warnings: string[] = [];
  const targetPanels = Math.max(
    Math.min(input.targetPanelCount ?? DEFAULT_TARGET_PANELS, 90),
    20,
  );
  const beats = input.storyArc.beats ?? [];
  if (beats.length === 0) {
    warnings.push("manga_editor.no_beats_in_story_arc");
  }

  const panelsPerBeat = Math.max(1, Math.round(targetPanels / Math.max(beats.length, 1)));
  const heroSet = new Set(input.heroCharacterIds ?? []);

  let globalPanelIndex = 0;
  let pageNumber = 0;
  const pages: StoryboardPage[] = [];
  // P5 — densité par "page" dépendante du format. En webtoon on
  // raisonne en sections verticales plus courtes (3 panels) pour
  // permettre les respirations et les full-width inserts.
  const projectFormat: ProjectFormat = input.projectFormat ?? "manga";
  const PANELS_PER_PAGE = projectFormat === "webtoon" ? 3 : 5;
  let currentPagePanels: StoryboardPanel[] = [];
  let currentPageBeatIds: string[] = [];
  let currentDramaticRole = "setup";

  const flushPage = () => {
    if (currentPagePanels.length === 0) return;
    pageNumber += 1;
    const layoutTemplate = pickLayoutForPage(currentPagePanels, projectFormat);
    const reindexedPanels = currentPagePanels.map((p, idx) => ({
      ...p,
      pageNumber,
      panelNumberInPage: idx + 1,
    }));
    pages.push({
      pageNumber,
      layoutTemplate,
      dramaticRole: currentDramaticRole,
      beatIds: Array.from(new Set(currentPageBeatIds)),
      panels: reindexedPanels,
    });
    currentPagePanels = [];
    currentPageBeatIds = [];
  };

  for (const beat of beats) {
    currentDramaticRole = beat.type;
    for (let i = 0; i < panelsPerBeat; i++) {
      const panel = buildPanelForBeat({
        beat,
        indexInBeat: i,
        globalIndex: globalPanelIndex,
        heroSet,
      });
      currentPagePanels.push(panel);
      currentPageBeatIds.push(beat.beatId);
      globalPanelIndex += 1;
      if (currentPagePanels.length >= PANELS_PER_PAGE) flushPage();
    }
  }
  flushPage();

  const storyboardPlan: StoryboardPlan = {
    chapterId: input.storyArc.chapterId,
    totalTargetPanels: globalPanelIndex,
    pages,
    editorialDiagnostics: computeDiagnostics(pages),
  };

  return { storyboardPlan, warnings };
}

function buildPanelForBeat(args: {
  beat: StoryBeat;
  indexInBeat: number;
  globalIndex: number;
  heroSet: Set<string>;
}): StoryboardPanel {
  const { beat, indexInBeat, globalIndex } = args;
  const renderMode = pickRenderMode(beat, indexInBeat);
  const subjectFocus = pickSubjectFocus(renderMode);
  const shotType = pickShotType(renderMode);
  const cutawayType = pickCutawayType(renderMode);

  return {
    panelId: `${beat.beatId}-p${indexInBeat + 1}`,
    pageNumber: 0,
    panelNumberInPage: 0,
    globalPanelIndex: globalIndex,
    sourceBeatId: beat.beatId,
    // COMMIT P3.B — le purpose doit appartenir à l'enum fermé. Le stub
    // déterministe dérive du renderMode (le beat.purpose est du texte libre
    // utilisé par l'IA1, pas un contrat technique).
    panelPurpose: derivePanelPurpose(beat.purpose, renderMode),
    renderMode,
    shotType,
    cameraAngle: "eye_level",
    subjectFocus,
    cutawayType,
    characters: beat.charactersPresent,
    locationId: beat.locationId,
    locationName: beat.locationName,
    actionLine: beat.storyEvent,
    emotionLine: beat.emotionalTurn,
    dialogue: [],
    narration: null,
    sfx: [],
    mustShow: beat.mustReveal.slice(0, 2),
    mustNotShow: beat.mustNotInvent.slice(0, 2),
    continuityNotes: beat.mustPreserve.slice(0, 2),
    visualAnchors: {
      characterIds: beat.charactersPresent,
      environmentAnchorId: null,
      previousPanelAnchorId: null,
    },
  };
}

function derivePanelPurpose(
  hint: string | undefined,
  renderMode: StoryboardRenderMode,
): PanelPurpose {
  if (hint && isPanelPurpose(hint)) return hint;
  switch (renderMode) {
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
    case "aftermath_dialogue":
    case "combat_aftermath":
      return "combat_aftermath";
    case "combat_exchange":
      return "combat_impact";
    default:
      return "dialogue_anchor";
  }
}

function pickRenderMode(beat: StoryBeat, indexInBeat: number): StoryboardRenderMode {
  switch (beat.type) {
    case "setup":
      return indexInBeat === 0 ? "establishing_environment" : "dialogue_two_shot";
    case "infiltration":
      return indexInBeat === 0 ? "establishing_environment" : "silent_transition";
    case "dialogue_tension":
      return indexInBeat % 2 === 0 ? "dialogue_two_shot" : "reaction_closeup";
    case "surveillance":
      return "surveillance_reveal";
    case "reveal":
      return indexInBeat === 0 ? "insert_object" : "reaction_closeup";
    case "combat":
      return indexInBeat % 2 === 0 ? "combat_exchange" : "reaction_closeup";
    case "aftermath":
      return indexInBeat === 0 ? "combat_aftermath" : "reaction_closeup";
    case "transition":
      return "silent_transition";
    case "cliffhanger":
      return "hero_closeup";
    default:
      return "dialogue_two_shot";
  }
}

function pickSubjectFocus(mode: StoryboardRenderMode): StoryboardSubjectFocus {
  switch (mode) {
    case "establishing_environment":
    case "silent_transition":
      return "environment";
    case "insert_object":
      return "prop";
    case "reaction_closeup":
      return "reaction";
    case "hero_closeup":
      return "hero";
    case "npc_closeup":
      return "important_npc";
    case "enemy_closeup":
      return "enemy";
    case "group_tension":
      return "group";
    case "surveillance_reveal":
      return "environment";
    case "dialogue_two_shot":
    case "dialogue_over_shoulder":
      return "group";
    case "combat_exchange":
    case "combat_aftermath":
      return "hero";
    case "enemy_reveal":
      return "enemy";
    case "creature_reveal":
      return "creature";
    case "threat_silhouette":
      return "threat";
    case "aftermath_dialogue":
      return "group";
    default:
      return "environment";
  }
}

function pickShotType(mode: StoryboardRenderMode): StoryboardShotType {
  switch (mode) {
    case "establishing_environment":
    case "silent_transition":
    case "surveillance_reveal":
      return "wide";
    case "dialogue_two_shot":
    case "group_tension":
    case "combat_exchange":
    case "combat_aftermath":
      return "medium";
    case "dialogue_over_shoulder":
      return "over_shoulder";
    case "reaction_closeup":
    case "hero_closeup":
    case "npc_closeup":
    case "enemy_closeup":
      return "closeup";
    case "insert_object":
      return "extreme_closeup";
    case "enemy_reveal":
    case "creature_reveal":
    case "threat_silhouette":
      return "wide";
    case "aftermath_dialogue":
      return "medium";
    default:
      return "medium";
  }
}

function pickCutawayType(mode: StoryboardRenderMode): StoryboardCutawayType {
  switch (mode) {
    case "establishing_environment":
      return "environment";
    case "insert_object":
      return "prop_insert";
    case "reaction_closeup":
      return "reaction";
    case "surveillance_reveal":
      return "surveillance";
    case "combat_aftermath":
      return "aftermath";
    default:
      return "none";
  }
}

function pickLayoutForPage(
  panels: StoryboardPanel[],
  projectFormat: ProjectFormat = "manga",
): StoryboardLayoutTemplate {
  if (projectFormat === "webtoon") {
    // P5 — grammaire webtoon : flow vertical, splash fréquent pour
    // reveals, strip vertical pour transitions/respirations. Un "écran"
    // webtoon n'est pas une vraie page mais un segment du scroll.
    if (panels.length === 1) return "splash";
    if (panels.length === 2) return "vertical_strip";
    if (panels.length === 3) return "vertical_strip";
    return "vertical_hero_4";
  }
  if (panels.length === 1) return "splash";
  if (panels.length === 2) return "cinematic_bar";
  if (panels.length === 3) return "action_strip";
  if (panels.length === 4) return "grid_2x2";
  if (panels.length === 5) return "staggered_5";
  return "grid_2x3";
}

function computeDiagnostics(pages: StoryboardPage[]): StoryboardPlan["editorialDiagnostics"] {
  const allPanels = pages.flatMap((p) => p.panels);
  const total = allPanels.length || 1;
  const heroFocus = allPanels.filter((p) => p.subjectFocus === "hero").length;
  const environment = allPanels.filter((p) => p.subjectFocus === "environment").length;
  const insert = allPanels.filter((p) => p.renderMode === "insert_object").length;
  const reaction = allPanels.filter((p) => p.renderMode === "reaction_closeup").length;
  const distinctModes = new Set(allPanels.map((p) => p.renderMode)).size;
  const warnings: string[] = [];
  const blockers: string[] = [];
  const heroRatio = heroFocus / total;
  if (heroRatio > 0.6) warnings.push(`hero_focus_ratio_high=${heroRatio.toFixed(2)}`);
  if (environment / total < 0.05) warnings.push("environment_ratio_low");

  return {
    varietyScore: distinctModes / 13,
    heroFocusRatio: heroRatio,
    environmentRatio: environment / total,
    insertRatio: insert / total,
    reactionRatio: reaction / total,
    warnings,
    blockers,
  };
}
