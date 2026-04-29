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
  type CharacterVisualDna,
  buildPanelTextContractFromFragments,
  textContractToLegacyDialogue,
  type PanelTextBundle,
} from "@manga-ai-studio/core";
import type { ChapterStyleBible } from "../contracts/chapter-style-bible";
import type {
  PanelRenderCharacterRole,
  PanelRenderCharacterVisualDna,
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
  /** ADN studio complet quand disponible (prioritaire sur les champs plats). */
  characterVisualDna?: CharacterVisualDna | null;
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

function buildVisibleCharacterVisualDna(match: CharacterInfo): PanelRenderCharacterVisualDna {
  const c = match.characterVisualDna;
  return {
    displayName: c?.displayName ?? null,
    hairColor: c?.hairColor ?? match.hairColor ?? null,
    eyeColor: c?.eyeColor ?? match.eyeColor ?? null,
    hairStyle: match.hairStyle ?? null,
    skinTone: match.skinTone ?? null,
    outfitSignature: c?.outfitSignature ?? match.outfitSignature ?? null,
  };
}

function resolvedStoryboardDialogueLines(panel: StoryboardPanel): Array<{ speaker: string; text: string }> {
  const bundle = (panel as StoryboardPanel & { panelTextBundle?: PanelTextBundle | null }).panelTextBundle ?? null;
  const contract = buildPanelTextContractFromFragments({
    panelId: panel.panelId,
    dialogueLines: panel.dialogue?.length ? panel.dialogue : null,
    narration: panel.narration ?? null,
    sfx: panel.sfx ?? null,
    panelTextBundle: bundle,
  });
  return textContractToLegacyDialogue(contract);
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
      hairColor: match.hairColor ?? null,
      eyeColor: match.eyeColor ?? null,
      canonSignatureText: match.characterVisualDna?.canonSignatureText ?? match.canonSignatureText ?? null,
      forbiddenDrift: (() => {
        const fromCanon = match.characterVisualDna?.forbiddenDrift;
        if (Array.isArray(fromCanon) && fromCanon.length > 0) {
          return fromCanon.filter((x): x is string => typeof x === "string");
        }
        return Array.isArray(match.forbiddenVisualDrift)
          ? match.forbiddenVisualDrift.filter((x): x is string => typeof x === "string")
          : [];
      })(),
      visualDNA: buildVisibleCharacterVisualDna(match),
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

  const dialogueLines = resolvedStoryboardDialogueLines(panel);

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
      dialogueLines.length > 0
        ? dialogueLines.map((d) => `${d.speaker}: ${d.text}`).join(" | ")
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
