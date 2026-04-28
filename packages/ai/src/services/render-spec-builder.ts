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

import {
  isHeroRole,
  isAntagonistRole,
  isSupportingRole,
} from "@manga-ai-studio/core";
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
import { inferStoryboardPanelLayoutMeta } from "./storyboard-panel-layout-meta";

export interface CharacterInfo {
  id: string;
  name: string;
  roleType?: string | null;
  hairColor?: string | null;
  eyeColor?: string | null;
  hairStyle?: string | null;
  skinTone?: string | null;
  outfitSignature?: string | null;
  canonSignatureText?: string | null;
  forbiddenVisualDrift?: string[] | null;
}

export interface BuildPanelRenderSpecInput {
  panel: StoryboardPanel;
  styleBible: ChapterStyleBible;
  visualMemory: ChapterVisualMemory;
  characters: CharacterInfo[];
  mainCharacterIds: string[];
}

const DIALOGUE_FORWARD_RENDER_MODES = new Set<StoryboardPanel["renderMode"]>([
  "dialogue_two_shot",
  "dialogue_over_shoulder",
  "character_focus",
  "aftermath_dialogue",
]);

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
      hairColor: match.hairColor ?? null,
      eyeColor: match.eyeColor ?? null,
      canonSignatureText: match.canonSignatureText ?? null,
      forbiddenDrift: Array.isArray(match.forbiddenVisualDrift)
        ? match.forbiddenVisualDrift.filter((x): x is string => typeof x === "string")
        : [],
      visualDNA: {
        hairColor: match.hairColor ?? null,
        eyeColor: match.eyeColor ?? null,
        hairStyle: match.hairStyle ?? null,
        skinTone: match.skinTone ?? null,
        outfitSignature: match.outfitSignature ?? null,
      },
    });
  }

  const resolvedRefs = resolvePanelReferences(visualMemory, {
    characterIds: visibleCharacters.map((c) => c.characterId),
    mainCharacterIds,
    environmentAnchorId: panel.visualAnchors.environmentAnchorId ?? null,
    previousPanelAnchorId: panel.visualAnchors.previousPanelAnchorId ?? null,
  });

  const inferredLayout = inferStoryboardPanelLayoutMeta(panel.renderMode);
  const layoutMeta = {
    layoutHint: panel.layoutHint ?? inferredLayout.layoutHint,
    targetAspectRatio: panel.targetAspectRatio ?? inferredLayout.targetAspectRatio,
    slotType: panel.slotType ?? inferredLayout.slotType,
  };

  return {
    panelId: panel.panelId,
    pageNumber: panel.pageNumber,
    panelNumberInPage: panel.panelNumberInPage,
    // COMMIT C — propager panelPurpose depuis le storyboard. Source de
    // vérité éditoriale pour la QA / audit. Le validator refuse un spec
    // sans panelPurpose ou avec des sentinelles du type "unknown"/"none".
    panelPurpose: panel.panelPurpose,
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
        : DIALOGUE_FORWARD_RENDER_MODES.has(panel.renderMode) || panel.panelPurpose === "dialogue_anchor"
          ? panel.actionLine.trim() || null
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
      forbiddenDrift: Array.from(new Set([
        ...styleBible.forbiddenStyleKeywords,
        ...visibleCharacters.flatMap((c) => c.forbiddenDrift ?? []),
      ])),
      noTextInsideImage: styleBible.noTextInsideImage,
    },
    layoutMeta,
  };
}

/**
 * P0.2 — Utilise le normaliseur centralisé pour les rôles personnages.
 */
function deriveRole(
  roleType: string | null | undefined,
  isMain: boolean,
): PanelRenderCharacterRole {
  if (isMain) return "hero";
  if (isHeroRole(roleType)) return "hero";
  if (isSupportingRole(roleType)) return "support";
  if (isAntagonistRole(roleType)) return "enemy";
  return "npc";
}
