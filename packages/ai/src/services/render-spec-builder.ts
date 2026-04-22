/**
 * render-spec-builder — construit un PanelRenderSpec à partir :
 *   - d'un StoryboardPanel (décision éditoriale déjà prise par l'IA 2)
 *   - de la ChapterVisualMemory (refs)
 *   - de la ChapterStyleBible (style strict)
 *
 * Ce service est la charnière entre l'éditorial et le rendu : il ne doit
 * JAMAIS inventer de narration, JAMAIS re-décider un shotType ou un
 * renderMode.
 */

import type { ChapterStyleBible } from "../contracts/chapter-style-bible";
import type {
  PanelRenderCharacterRole,
  PanelRenderSpec,
  PanelRenderVisibleCharacter,
} from "../contracts/panel-render-spec";
import type { StoryboardPanel } from "../contracts/storyboard-plan";
import {
  resolvePanelReferences,
  type ChapterVisualMemory,
} from "./chapter-visual-memory";

export interface CharacterInfo {
  id: string;
  name: string;
  roleType?: string | null;
}

export interface BuildPanelRenderSpecInput {
  panel: StoryboardPanel;
  styleBible: ChapterStyleBible;
  visualMemory: ChapterVisualMemory;
  characters: CharacterInfo[];
  mainCharacterIds: string[];
}

export function buildPanelRenderSpec(
  input: BuildPanelRenderSpecInput,
): PanelRenderSpec {
  const { panel, styleBible, visualMemory, characters, mainCharacterIds } = input;
  const mainSet = new Set(mainCharacterIds);

  const visibleCharacters: PanelRenderVisibleCharacter[] = [];
  for (const idOrName of panel.characters) {
    const match = characters.find((c) => c.id === idOrName || c.name === idOrName);
    if (!match) continue;
    const role = deriveRole(match.roleType, mainSet.has(match.id));
    visibleCharacters.push({
      characterId: match.id,
      name: match.name,
      role,
      poseIntent: null,
      expressionIntent: null,
    });
  }

  const resolvedRefs = resolvePanelReferences(visualMemory, {
    characterIds: visibleCharacters.map((c) => c.characterId),
    mainCharacterIds,
    environmentAnchorId: panel.visualAnchors.environmentAnchorId ?? null,
    previousPanelAnchorId: panel.visualAnchors.previousPanelAnchorId ?? null,
  });

  return {
    panelId: panel.panelId,
    pageNumber: panel.pageNumber,
    panelNumberInPage: panel.panelNumberInPage,
    renderMode: panel.renderMode,
    shotType: panel.shotType,
    cameraAngle: panel.cameraAngle,
    subjectFocus: panel.subjectFocus,
    cutawayType: panel.cutawayType,
    locationName: panel.locationName,
    actionLine: panel.actionLine,
    emotionLine: panel.emotionLine,
    dialogueIntent:
      panel.dialogue.length > 0
        ? panel.dialogue.map((d) => `${d.speaker}: ${d.text}`).join(" | ")
        : null,
    visibleCharacters,
    styleBible,
    continuityLocks: {
      outfitLocks: [],
      bodyStateLocks: [],
      propLocks: [],
      environmentLocks: panel.continuityNotes.slice(0, 4),
    },
    imageReferences: {
      characterRefs: resolvedRefs.characterRefs,
      environmentRefs: resolvedRefs.environmentRefs,
      panelRefs: resolvedRefs.panelRefs,
      styleRefs: resolvedRefs.styleRefs,
    },
    constraints: {
      mustShow: panel.mustShow,
      mustNotShow: panel.mustNotShow,
      forbiddenDrift: styleBible.forbiddenStyleKeywords,
      noTextInsideImage: styleBible.noTextInsideImage,
    },
  };
}

function deriveRole(
  roleType: string | null | undefined,
  isMain: boolean,
): PanelRenderCharacterRole {
  if (isMain) return "hero";
  const normalized = (roleType ?? "").toLowerCase();
  if (normalized.includes("main") || normalized.includes("protagon")) return "hero";
  if (normalized.includes("support") || normalized.includes("ally")) return "support";
  if (normalized.includes("antagon") || normalized.includes("enemy") || normalized.includes("villain")) return "enemy";
  return "npc";
}
