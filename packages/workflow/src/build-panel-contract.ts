/**
 * Construit un PanelContract strict avant la génération d'image.
 * Le panel n'est plus un prompt libre, c'est une spécification visuelle contrôlée.
 *
 * Façade — la logique est répartie dans `_panel-contract/`.
 */

import type {
  PanelContract,
  PanelBlueprintPremium,
  BeatNarrativeContract,
} from "@manga-ai-studio/core";
import { legacyDialogueLinesFromStoryboardPanelLike, blueprintPrimaryDialogueLineCount } from "@manga-ai-studio/core";
import type { StoryboardPanel } from "@manga-ai-studio/ai";

import { deducePurpose, deduceShotType, deduceCameraAngle } from "./_panel-contract/deduce-panel-signals";
import {
  inferTimeOfDay,
  inferWeather,
  inferEnvironmentPrimary,
  inferEnvironmentState,
  buildEnvironmentSecondary,
  buildPersistentSceneAnchors,
  buildLocationSignals,
  buildBackgroundExtras,
  buildMustNotShow,
  buildEnvironmentStoryHooks,
} from "./_panel-contract/infer-environment";
import {
  extractMustShow,
  determineReservedZones,
  determineAspectRatio,
  extractInteractionBeat,
} from "./_panel-contract/extract-props-layout";
import { uniq } from "./_panel-contract/utils";

/** PR9 — même agrégation que narrative-pass / pipeline-scene-builder (legacy bundle). */
function legacyStoryboardPanelDialogueLines(panel: StoryboardPanel, panelId: string) {
  const p = panel as StoryboardPanel & {
    dialogues?: Array<{ speaker: string; text: string }>;
    dialogue?: { speaker: string; text: string } | Array<{ speaker: string; text: string }>;
    textContract?: unknown;
  };
  const dialogueArray =
    Array.isArray(p.dialogues) && p.dialogues.length > 0
      ? p.dialogues
      : Array.isArray(p.dialogue) && p.dialogue.length > 0
        ? p.dialogue
        : p.dialogue && typeof p.dialogue === "object" && "text" in p.dialogue
          ? [p.dialogue as { speaker: string; text: string }]
          : null;
  return legacyDialogueLinesFromStoryboardPanelLike({
    panelId,
    textContract: p.textContract,
    dialogue: dialogueArray,
    narration: typeof p.narration === "string" ? p.narration : null,
    sfx: Array.isArray(p.sfx)
      ? p.sfx.map((s) => String(s).trim()).filter(Boolean)
      : typeof p.sfx === "string" && p.sfx.trim()
        ? [p.sfx.trim()]
        : null,
    panelTextBundle: null,
  });
}

export interface PanelContractInput {
  panelId: string;
  pageNumber: number;
  panelNumber: number;
  panel: StoryboardPanel;
  sceneContext: {
    location: string;
    timeOfDay?: string;
    atmosphere?: string;
    presentCharacters: string[];
  };
  previousPanelId?: string;
  visualAnchorIds: string[];
  panelBlueprint?: PanelBlueprintPremium;
  beatNarrativeContract?: BeatNarrativeContract;
}

export async function buildPanelContract(input: PanelContractInput): Promise<PanelContract> {
  const panel = input.panel;
  const sceneText = [
    input.sceneContext.location,
    input.sceneContext.timeOfDay,
    input.sceneContext.atmosphere,
    panel.caption,
    panel.camera,
    panel.prompt,
    panel.narration,
  ]
    .filter(Boolean)
    .join(" ");

  const purpose = deducePurpose(panel, {
    panelBlueprint: input.panelBlueprint,
    beatNarrativeContract: input.beatNarrativeContract,
    panelId: input.panelId,
    legacyDialogueLines: legacyStoryboardPanelDialogueLines,
  });
  const shotType = deduceShotType(panel);
  const cameraAngle = deduceCameraAngle(panel);
  const requiredCharacters = panel.characters ?? [];
  const focusCharacters =
    shotType === "wide" ? requiredCharacters.slice(0, 1) : requiredCharacters.slice(0, 2);
  const mustShow = extractMustShow(panel, input.sceneContext);
  const timeOfDay = inferTimeOfDay(sceneText);
  const weather = inferWeather(sceneText);
  const environmentPrimary = inferEnvironmentPrimary(input.sceneContext.location);
  const environmentSecondary = buildEnvironmentSecondary(input.sceneContext.location, sceneText, shotType);
  const persistentSceneAnchors = buildPersistentSceneAnchors(input.sceneContext.location, sceneText);
  const mustShowLocationSignals = buildLocationSignals(input.sceneContext.location, sceneText);
  const mustShowProps = mustShow.filter((item) => !mustShowLocationSignals.includes(item));
  const backgroundExtras = buildBackgroundExtras({
    shotType,
    location: input.sceneContext.location,
    atmosphere: input.sceneContext.atmosphere,
    sceneText,
  });
  const mustNotShow = buildMustNotShow(shotType, input.sceneContext.location, sceneText);

  const bp = input.panelBlueprint;
  const fromPanelCount = legacyStoryboardPanelDialogueLines(panel, input.panelId).length;
  const fromBpCount = bp ? blueprintPrimaryDialogueLineCount(bp) : 0;
  const dialogueCount = Math.max(fromPanelCount, fromBpCount);
  const textBoxPlan: PanelContract["textBoxPlan"] = {
    narration: Boolean(panel.narration),
    dialogueCount,
    sfx: panel.sfx ? [panel.sfx] : [],
    reservedZones: determineReservedZones(shotType, dialogueCount),
  };
  const renderHints: PanelContract["renderHints"] = {
    targetAspectRatio: determineAspectRatio(shotType),
    cropMode: shotType === "closeup" || shotType === "extreme_closeup" ? "contain" : "cover",
    focalPoint: shotType === "closeup" ? { x: 0.5, y: 0.4 } : undefined,
  };

  const premiumFields: Partial<PanelContract> = bp
    ? {
        subjectFocus: bp.subjectFocus,
        secondaryFocus: bp.secondaryFocus,
        mustShowEnemy: bp.mustShowEnemy,
        requiredNpcCount: bp.requiredNpcCount,
        speakerAnchorCharacterId: bp.speakerAnchorCharacterId,
        dialogueCarrier: bp.dialogueCarrier,
        cutawayType: bp.cutawayType,
        heroCenterAllowed: bp.heroCenterAllowed,
        panelCriticalityLevel: bp.criticality,
        requiredPropsTyped: bp.requiredProps,
        optionalPropsTyped: bp.optionalProps,
        mustShowProps: uniq([
          ...mustShowProps,
          ...bp.requiredProps.map((p) => p.canonicalName),
        ]),
        requiredCharacters: uniq([
          ...requiredCharacters,
          ...(bp.mustShowCharacterIds ?? bp.requiredCharacters ?? []),
        ]),
      }
    : {};

  return {
    panelId: input.panelId,
    pageNumber: input.pageNumber,
    panelNumber: input.panelNumber,
    purpose,
    shotType,
    cameraAngle,
    focusCharacters,
    requiredCharacters,
    backgroundExtras,
    environmentPrimary,
    environmentSecondary,
    environmentState: inferEnvironmentState(sceneText),
    weather,
    timeOfDay,
    foregroundSubjects: focusCharacters,
    midgroundElements:
      shotType === "wide"
        ? [...requiredCharacters.slice(1, 3), ...environmentSecondary.slice(0, 2)]
        : environmentSecondary.slice(0, 3),
    backgroundElements: [...persistentSceneAnchors, ...backgroundExtras].slice(0, 6),
    npcPresence: backgroundExtras.filter((item) => /(crowd|guard|merchant|client|passant|patron)/i.test(item)),
    creaturePresence: backgroundExtras.filter((item) => /(creature|animal|drone|spirit|monster|bird|cat|dog)/i.test(item)),
    interactionBeat: extractInteractionBeat(sceneText, purpose),
    environmentStoryHooks: buildEnvironmentStoryHooks(sceneText, input.sceneContext.location),
    persistentSceneAnchors,
    mustShowProps,
    mustShowLocationSignals,
    mustShow,
    mustNotShow,
    continuityFromPanelId: input.previousPanelId,
    visualAnchorIds: input.visualAnchorIds,
    textBoxPlan,
    renderHints,
    ...premiumFields,
  };
}
