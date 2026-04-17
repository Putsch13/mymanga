/**
 * ShotPlan Director — plan de coupe chapitre complet.
 *
 * Génère un plan de coupe manga cohérent depuis l'outline du chapitre,
 * avec diversité de shots, angles, transitions et emphases narratives.
 */

import type {
  ChapterShotPlan,
  PageShotPlan,
  PanelShotPlan,
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
  pageRole?: string;
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

const ROLE_TO_PAGE: Record<string, { pageTemplate: PageTemplate; emphasisDevice: string | null }> = {
  establishing: { pageTemplate: "grid_4", emphasisDevice: null },
  escalation: { pageTemplate: "grid_6", emphasisDevice: null },
  confrontation: { pageTemplate: "asymmetric", emphasisDevice: null },
  revelation: { pageTemplate: "splash", emphasisDevice: "splash" },
  aftermath: { pageTemplate: "grid_4", emphasisDevice: "silence_beat" },
  cliffhanger: { pageTemplate: "asymmetric", emphasisDevice: "extreme_closeup" },
  dialogue: { pageTemplate: "grid_4", emphasisDevice: null },
  action: { pageTemplate: "asymmetric", emphasisDevice: null },
  transition: { pageTemplate: "vertical_strip", emphasisDevice: "cutaway_insert" },
};

const ACTION_PATTERN: ShotType[] = ["wide", "medium", "closeup", "medium"];
const DIALOGUE_PATTERN: ShotType[] = ["medium", "over_shoulder", "closeup", "medium"];
const CONTEMPLATIVE_PATTERN: ShotType[] = ["wide", "medium", "closeup", "wide"];
const KINETIC_PATTERN: ShotType[] = ["wide", "medium", "closeup", "extreme_closeup"];

function getPatternForRole(pageRole: string): ShotType[] {
  if (pageRole === "action" || pageRole === "confrontation") return ACTION_PATTERN;
  if (pageRole === "dialogue") return DIALOGUE_PATTERN;
  if (pageRole === "aftermath" || pageRole === "establishing") return CONTEMPLATIVE_PATTERN;
  return KINETIC_PATTERN;
}

function pickCameraAngle(shotType: ShotType, pageRole: string, panelIdx: number): CameraAngle {
  if (shotType === "extreme_closeup") return "eye_level";
  if (pageRole === "confrontation" && panelIdx === 0) return "low";
  if (pageRole === "revelation") return panelIdx === 0 ? "dutch" : "eye_level";
  if (pageRole === "establishing") return "birds_eye";
  if (shotType === "wide") return panelIdx % 3 === 0 ? "high" : "eye_level";
  return "eye_level";
}

function pickSubjectFocus(
  beat: BeatInput,
  panelIdx: number,
  totalPanels: number,
  antagonistNames: Set<string>,
): SubjectFocus {
  const chars = beat.characters ?? [];
  if (panelIdx === totalPanels - 1 && totalPanels > 2) return "reaction";
  if (panelIdx === 0 && (beat.pageRole === "establishing" || beat.pageRole === "transition")) return "environment";
  if (chars.some((c) => antagonistNames.has(c.toLowerCase()))) {
    if (panelIdx === 1 || (panelIdx === 0 && beat.pageRole === "confrontation")) return "antagonist";
  }
  if (chars.length > 2 && panelIdx === 0) return "group";
  if (chars.length === 1) return "hero";
  return panelIdx % 2 === 0 ? "hero" : "important_npc";
}

function pickCutaway(panelIdx: number, totalPanels: number, pageRole: string): CutawayType {
  if (pageRole === "transition") return "landscape";
  if (panelIdx === totalPanels - 1 && totalPanels >= 3) return "crowd_reaction";
  return "none";
}

function pickTransition(panelIdx: number, pageRole: string, prevPageRole: string | null): Transition {
  if (panelIdx === 0 && prevPageRole && prevPageRole !== pageRole) return "scene_to_scene";
  if (panelIdx === 0) return "action_to_action";
  if (pageRole === "transition" || pageRole === "aftermath") return "aspect_to_aspect";
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
  let prevPageRole: string | null = null;

  for (let beatIdx = 0; beatIdx < input.beats.length; beatIdx++) {
    const beat = input.beats[beatIdx];
    const pageRole = beat.pageRole ?? "escalation";
    const roleConfig = ROLE_TO_PAGE[pageRole] ?? ROLE_TO_PAGE.escalation;
    const shotPattern = getPatternForRole(pageRole);
    const pageNumber = beatIdx + 1;

    const panels: PanelShotPlan[] = [];
    const numPanels = pageRole === "revelation" || pageRole === "cliffhanger" ? Math.min(panelsPerBeat, 3) : panelsPerBeat;

    for (let pi = 0; pi < numPanels; pi++) {
      const shotType = shotPattern[pi % shotPattern.length];
      const cameraAngle = pickCameraAngle(shotType, pageRole, pi);
      const subjectFocus = pickSubjectFocus(beat, pi, numPanels, antagonistNames);
      const cutawayType = pickCutaway(pi, numPanels, pageRole);
      const transitionFromPrevious = pickTransition(pi, pageRole, prevPageRole);

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
    if (numPanels >= 3 && pageRole !== "action" && pageRole !== "confrontation") {
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
        reason: `${pageRole} emphasis`,
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
          // Force 2nd panel as NPC closeup
          const targetPanel = panels[1]!;
          targetPanel.shotType = "closeup";
          targetPanel.subjectFocus = "important_npc";
          targetPanel.emphasisReason = `introduction ${char.name}`;
        }
      }
    }

    // Antagonist emphasis
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

    prevPageRole = pageRole;
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
