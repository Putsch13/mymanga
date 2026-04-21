/**
 * ShotPlan Director — plan de coupe chapitre complet.
 *
 * Génère un plan de coupe manga cohérent depuis l'outline du chapitre,
 * avec diversité de shots, angles, transitions et emphases narratives.
 *
 * Phase 1 refactor — the director is now driven by `storyFunction` and
 * `actionEnvelope` rather than the legacy `pageRole`. The legacy pageRole
 * is still accepted (back-compat) but is passed through
 * `beatContractFromLegacyRole` so that a `confrontation` beat no longer
 * silently promotes to combat patterns.
 *
 * Key invariant: `ACTION_PATTERN` is only emitted when the beat's action
 * envelope is `combat_light` or `combat_full`. A dialogue_tension beat
 * with envelope `none` can NEVER produce an action pattern.
 */

import type {
  ChapterShotPlan,
  PageShotPlan,
  PanelShotPlan,
  StoryFunction,
  ActionEnvelope,
} from "@manga-ai-studio/core";
import {
  mapLegacyPageRoleToStoryFunction,
  DEFAULT_ACTION_ENVELOPE_FOR_FUNCTION,
} from "@manga-ai-studio/core";

type ShotType = PanelShotPlan["shotType"];
type CameraAngle = PanelShotPlan["cameraAngle"];
type SubjectFocus = PanelShotPlan["subjectFocus"];
type CutawayType = PanelShotPlan["cutawayType"];
type Transition = PanelShotPlan["transitionFromPrevious"];
type Rhythm = ChapterShotPlan["rhythm"];
type PageTemplate = PageShotPlan["template"];

interface ImportantCharacterHint {
  characterId: string;
  name: string;
  role: "hero" | "antagonist" | "important_npc";
  firstAppearanceSceneIndex?: number;
}

interface BeatInput {
  id: string;
  /** Legacy field — kept for back-compat. Prefer storyFunction + actionEnvelope. */
  pageRole?: string;
  /** Phase 1 — authoritative narrative intent. */
  storyFunction?: StoryFunction;
  /** Phase 1 — authoritative action envelope. Defaults to the envelope
   *  recommended for the storyFunction, NEVER to a combat level. */
  actionEnvelope?: ActionEnvelope;
  characters?: string[];
  location?: string;
  summary?: string;
}

interface ShotPlanInput {
  beats: BeatInput[];
  genreMode: string;
  importantCharacters: ImportantCharacterHint[];
  panelsPerBeat?: number;
}

const GENRE_TARGETS: Record<string, { wide: number; medium: number; closeup: number; cutaway: number; rhythm: Rhythm }> = {
  shonen: { wide: 0.20, medium: 0.35, closeup: 0.30, cutaway: 0.15, rhythm: "kinetic" },
  seinen: { wide: 0.25, medium: 0.35, closeup: 0.25, cutaway: 0.15, rhythm: "standard" },
  shojo: { wide: 0.15, medium: 0.30, closeup: 0.40, cutaway: 0.15, rhythm: "contemplative" },
  josei: { wide: 0.15, medium: 0.35, closeup: 0.35, cutaway: 0.15, rhythm: "contemplative" },
  dark_fantasy: { wide: 0.25, medium: 0.30, closeup: 0.25, cutaway: 0.20, rhythm: "mixed" },
  action: { wide: 0.15, medium: 0.30, closeup: 0.35, cutaway: 0.20, rhythm: "kinetic" },
  romance: { wide: 0.15, medium: 0.30, closeup: 0.40, cutaway: 0.15, rhythm: "contemplative" },
  horror: { wide: 0.20, medium: 0.25, closeup: 0.30, cutaway: 0.25, rhythm: "mixed" },
};
const DEFAULT_TARGETS = { wide: 0.20, medium: 0.35, closeup: 0.30, cutaway: 0.15, rhythm: "standard" as Rhythm };

// Shot patterns. ACTION_PATTERN is only selected when the beat explicitly
// allows combat — never inferred from a page role alone.
const ACTION_PATTERN: ShotType[] = ["wide", "medium", "closeup", "medium"];
const DIALOGUE_PATTERN: ShotType[] = ["medium", "over_shoulder", "closeup", "medium"];
const CONTEMPLATIVE_PATTERN: ShotType[] = ["wide", "medium", "closeup", "wide"];
const KINETIC_PATTERN: ShotType[] = ["wide", "medium", "closeup", "extreme_closeup"];

interface ResolvedIntent {
  storyFunction: StoryFunction;
  actionEnvelope: ActionEnvelope;
  legacyPageRole: string;
  explicitCombat: boolean;
}

function resolveBeatIntent(beat: BeatInput): ResolvedIntent {
  if (beat.storyFunction) {
    const envelope =
      beat.actionEnvelope ?? DEFAULT_ACTION_ENVELOPE_FOR_FUNCTION[beat.storyFunction];
    const isCombat =
      envelope === "combat_light" || envelope === "combat_full";
    return {
      storyFunction: beat.storyFunction,
      actionEnvelope: envelope,
      legacyPageRole: beat.pageRole ?? "",
      explicitCombat: isCombat,
    };
  }
  const legacy = beat.pageRole ?? "escalation";
  const storyFunction = mapLegacyPageRoleToStoryFunction(legacy);
  // Legacy rollout rule: only the literal page role "action" with no
  // structured override is treated as combat. `confrontation` maps to
  // dialogue_tension, which removes the silent combat promotion.
  const explicitCombat = legacy === "action";
  const envelope: ActionEnvelope = explicitCombat
    ? "combat_full"
    : (beat.actionEnvelope ?? DEFAULT_ACTION_ENVELOPE_FOR_FUNCTION[storyFunction]);
  return { storyFunction, actionEnvelope: envelope, legacyPageRole: legacy, explicitCombat };
}

function getPatternForIntent(intent: ResolvedIntent): ShotType[] {
  if (
    intent.actionEnvelope === "combat_full" ||
    intent.actionEnvelope === "combat_light"
  ) {
    return ACTION_PATTERN;
  }
  switch (intent.storyFunction) {
    case "dialogue_tension":
    case "decision":
    case "investigation":
      return DIALOGUE_PATTERN;
    case "setup":
    case "aftermath":
      return CONTEMPLATIVE_PATTERN;
    case "revelation":
    case "discovery":
      return KINETIC_PATTERN;
    case "movement":
      // Movement without combat still reads as kinetic but stays non-violent.
      return KINETIC_PATTERN;
    case "transition":
      return CONTEMPLATIVE_PATTERN;
    default:
      return DIALOGUE_PATTERN;
  }
}

function getTemplateForIntent(intent: ResolvedIntent): {
  pageTemplate: PageTemplate;
  emphasisDevice: string | null;
} {
  // Legacy pageRole hard overrides — these produce reader-template-visible
  // pages that the rest of the pipeline depends on.
  if (intent.legacyPageRole === "cliffhanger") {
    return { pageTemplate: "double_spread", emphasisDevice: "extreme_closeup" };
  }
  if (intent.legacyPageRole === "revelation" || intent.storyFunction === "revelation") {
    return { pageTemplate: "splash", emphasisDevice: "splash" };
  }
  if (intent.explicitCombat) {
    return { pageTemplate: "asymmetric_hero", emphasisDevice: null };
  }
  switch (intent.storyFunction) {
    case "aftermath":
      return { pageTemplate: "grid_2x2", emphasisDevice: "silence_beat" };
    case "transition":
      return { pageTemplate: "vertical_strip", emphasisDevice: "cutaway_insert" };
    case "setup":
      return { pageTemplate: "grid_2x2", emphasisDevice: null };
    case "discovery":
    case "investigation":
      return { pageTemplate: "grid_2x3", emphasisDevice: null };
    default:
      return { pageTemplate: "grid_2x2", emphasisDevice: null };
  }
}

function pickAngleForIntent(
  shotType: ShotType,
  intent: ResolvedIntent,
  panelIdx: number,
): CameraAngle {
  if (shotType === "extreme_closeup") return "eye_level";
  // Only promote to `low` (aggressive framing) when the beat explicitly
  // allows combat. A dialogue_tension beat can still be heated without an
  // aggressive angle forced by default.
  if (intent.explicitCombat && panelIdx === 0) return "low";
  if (intent.storyFunction === "revelation") return panelIdx === 0 ? "dutch" : "eye_level";
  if (intent.storyFunction === "setup") return "birds_eye";
  if (shotType === "wide") return panelIdx % 3 === 0 ? "high" : "eye_level";
  return "eye_level";
}

function pickSubjectFocus(
  beat: BeatInput,
  intent: ResolvedIntent,
  panelIdx: number,
  totalPanels: number,
  antagonistNames: Set<string>,
): SubjectFocus {
  const chars = beat.characters ?? [];
  if (panelIdx === totalPanels - 1 && totalPanels > 2) return "reaction";
  if (
    panelIdx === 0 &&
    (intent.storyFunction === "setup" || intent.storyFunction === "transition")
  ) {
    return "environment";
  }
  if (chars.some((c) => antagonistNames.has(c.toLowerCase()))) {
    // Promote antagonist focus only on combat beats or on their clear
    // dialogue showdown (panel 1+ keeps the antag visible).
    if (panelIdx === 1 || (panelIdx === 0 && intent.explicitCombat)) {
      return "antagonist";
    }
    // Outside combat the antag still anchors panel 1 so downstream rules
    // (low-angle emphasis, antag close-up) can still apply.
    if (panelIdx === 1) return "antagonist";
  }
  if (chars.length > 2 && panelIdx === 0) return "group";
  if (chars.length === 1) return "hero";
  return panelIdx % 2 === 0 ? "hero" : "important_npc";
}

function pickCutaway(
  panelIdx: number,
  totalPanels: number,
  intent: ResolvedIntent,
): CutawayType {
  if (intent.storyFunction === "transition") return "landscape";
  if (panelIdx === totalPanels - 1 && totalPanels >= 3) return "crowd_reaction";
  return "none";
}

function pickTransition(
  panelIdx: number,
  intent: ResolvedIntent,
  prevIntent: ResolvedIntent | null,
): Transition {
  if (
    panelIdx === 0 &&
    prevIntent &&
    prevIntent.storyFunction !== intent.storyFunction
  ) {
    return "scene_to_scene";
  }
  if (panelIdx === 0) return "action_to_action";
  if (
    intent.storyFunction === "transition" ||
    intent.storyFunction === "aftermath"
  ) {
    return "aspect_to_aspect";
  }
  return panelIdx % 3 === 0 ? "subject_to_subject" : "action_to_action";
}

export function directShotPlan(input: ShotPlanInput): ChapterShotPlan {
  const genreKey = input.genreMode.toLowerCase().replace(/[^a-z_]/g, "");
  const targets = GENRE_TARGETS[genreKey] ?? DEFAULT_TARGETS;
  const rhythm = targets.rhythm;
  const panelsPerBeat = input.panelsPerBeat ?? 4;
  const antagonistNames = new Set(
    input.importantCharacters
      .filter((c) => c.role === "antagonist")
      .map((c) => c.name.toLowerCase()),
  );

  const pages: PageShotPlan[] = [];
  const emphasis: ChapterShotPlan["emphasis"] = [];
  let prevIntent: ResolvedIntent | null = null;

  for (let beatIdx = 0; beatIdx < input.beats.length; beatIdx++) {
    const beat = input.beats[beatIdx];
    const intent = resolveBeatIntent(beat);
    const roleConfig = getTemplateForIntent(intent);
    const shotPattern = getPatternForIntent(intent);
    const pageNumber = beatIdx + 1;

    const panels: PanelShotPlan[] = [];
    const shrinkForHighImpact =
      intent.storyFunction === "revelation" ||
      intent.legacyPageRole === "cliffhanger";
    const numPanels = shrinkForHighImpact
      ? Math.min(panelsPerBeat, 3)
      : panelsPerBeat;

    for (let pi = 0; pi < numPanels; pi++) {
      const shotType = shotPattern[pi % shotPattern.length];
      const cameraAngle = pickAngleForIntent(shotType, intent, pi);
      const subjectFocus = pickSubjectFocus(
        beat,
        intent,
        pi,
        numPanels,
        antagonistNames,
      );
      const cutawayType = pickCutaway(pi, numPanels, intent);
      const transitionFromPrevious = pickTransition(pi, intent, prevIntent);

      panels.push({
        panelNumber: pi + 1,
        shotType,
        cameraAngle,
        subjectFocus,
        cutawayType,
        heroCenterAllowed: subjectFocus === "hero",
        transitionFromPrevious,
        emphasisReason: null,
      });
    }

    let respirationPanel: number | null = null;
    if (numPanels >= 3 && !intent.explicitCombat) {
      const respIdx = numPanels - 1;
      panels[respIdx] = {
        ...panels[respIdx],
        shotType: "wide",
        subjectFocus: "environment",
        cutawayType: "landscape",
        transitionFromPrevious: "aspect_to_aspect",
        heroCenterAllowed: false,
      };
      respirationPanel = respIdx + 1;
    }

    if (roleConfig.emphasisDevice) {
      emphasis.push({
        pageNumber,
        panelNumber: roleConfig.emphasisDevice === "extreme_closeup" ? numPanels : 1,
        reason: `${intent.storyFunction} emphasis`,
        device: roleConfig.emphasisDevice as ChapterShotPlan["emphasis"][number]["device"],
      });
    }

    // A02: guarantee at least 1 aspect_to_aspect transition per scene
    const hasAspectToAspect = panels.some((p) => p.transitionFromPrevious === "aspect_to_aspect");
    if (!hasAspectToAspect && panels.length >= 2) {
      const lastPanel = panels[panels.length - 1];
      if (lastPanel) {
        lastPanel.transitionFromPrevious = "aspect_to_aspect";
        if (lastPanel.subjectFocus !== "environment") {
          lastPanel.cutawayType = lastPanel.cutawayType === "none" ? "landscape" : lastPanel.cutawayType;
        }
      }
    }

    // A03: NPC close-ups for introduced characters — force if none found
    for (const char of input.importantCharacters) {
      if (char.role === "important_npc" && char.firstAppearanceSceneIndex === beatIdx) {
        const npcPanel = panels.find((p) => p.subjectFocus === "important_npc");
        if (npcPanel) {
          npcPanel.shotType = "closeup";
          npcPanel.emphasisReason = `introduction ${char.name}`;
        } else if (panels.length >= 2) {
          const targetPanel = panels[1]!;
          targetPanel.shotType = "closeup";
          targetPanel.subjectFocus = "important_npc";
          targetPanel.emphasisReason = `introduction ${char.name}`;
        }
      }
    }

    // Antagonist emphasis — independent of action envelope: the antagonist's
    // *presence* deserves a low angle whether the beat is verbal or combat.
    const hasAntag = (beat.characters ?? []).some((c) => antagonistNames.has(c.toLowerCase()));
    if (hasAntag) {
      const antagPanel = panels.find((p) => p.subjectFocus === "antagonist");
      if (antagPanel) {
        antagPanel.cameraAngle = "low";
        antagPanel.emphasisReason = antagPanel.emphasisReason ?? "antagonist menacing presence";
      }
    }

    pages.push({
      pageNumber,
      template: roleConfig.pageTemplate,
      panels,
      respirationPanel,
    });

    prevIntent = intent;
  }

  return {
    pages,
    rhythm,
    diversityTargets: {
      wide: targets.wide,
      medium: targets.medium,
      closeup: targets.closeup,
      cutaway: targets.cutaway,
    },
    emphasis,
  };
}

// Exposed for tests + downstream callers migrating to the new intent API.
export { resolveBeatIntent, getPatternForIntent, getTemplateForIntent };
export type { BeatInput, ResolvedIntent };
