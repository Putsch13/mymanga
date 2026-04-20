/**
 * CanonicalPacketBridge — adapter pour construire un
 * `CanonicalImagePromptPacket` à partir des données déjà disponibles dans
 * le pipeline (narrative-pass output + image-generation-pass runtime).
 *
 * Objectif : s'intégrer de façon additive dans `image-generation-pass` —
 * on construit le packet alongside l'existant, on le persiste sur
 * `SceneImage.metadata.canonicalPacket`, et on l'expose pour rerolls
 * packet-aware.
 */

import {
  buildCanonicalPromptRecipe,
  buildFalPromptPayload,
  type CanonicalPromptRecipeInput,
  type FalPromptPayloadInput,
  type FalPromptPayloadResult,
} from "@manga-ai-studio/ai";
import type {
  CanonicalImagePromptPacket,
  CharacterContextEntry,
  NpcContextEntry,
  PropContextEntry,
  GroupContextEntry,
  EnvironmentContext,
  DialogueContext,
  HeroPresenceMode,
  ContentRating,
  MangaStyleProfileRef,
  UniverseProfileRef,
  VisualClassification,
  StoryContext,
  SceneContext,
  ContinuityContext,
  SubjectBalance,
} from "@manga-ai-studio/core";
import { CANONICAL_PACKET_VERSION } from "@manga-ai-studio/core";
import type { ChapterImagePlanItem } from "./chapter-image-plan-builder";

export interface CanonicalPacketBridgeInput {
  projectId: string;
  chapterId: string;
  sceneImageId: string;
  planItem: ChapterImagePlanItem;
  baseMetadata: Record<string, unknown>;
  rawCharacters: Array<{ id: string; name: string; roleType?: string | null; description?: string | null; visualDescription?: string | null }>;
  universe: UniverseProfileRef;
  mangaStyle: MangaStyleProfileRef;
  environment: EnvironmentContext;
  chapterContext: { title: string; summary: string };
  beatContext: { id: string; title: string; function: string; previousId: string | null; nextId: string | null };
  sceneContext: SceneContext;
  continuityContext: ContinuityContext;
  contentRating: ContentRating;
  visualClassification: VisualClassification;
  characterRefAssets: FalPromptPayloadInput["characterRefAssets"];
  styleRefAssets: FalPromptPayloadInput["styleRefAssets"];
  sceneRefAssets: FalPromptPayloadInput["sceneRefAssets"];
}

export interface CanonicalPacketBridgeResult {
  packet: CanonicalImagePromptPacket;
  payload: FalPromptPayloadResult;
}

// ────────────────────────────────────────────────────────────────────────────
// Character context mapping
// ────────────────────────────────────────────────────────────────────────────

function mapCharacterToContext(
  name: string,
  rawCharacters: CanonicalPacketBridgeInput["rawCharacters"],
  planItem: ChapterImagePlanItem,
): CharacterContextEntry | null {
  const raw = rawCharacters.find((c) => c.name === name);
  if (!raw) return null;

  const isHero = /hero|protagon|main_hero/i.test(raw.roleType ?? "");
  const presenceMode: HeroPresenceMode = isHero
    ? planItem.heroPresenceMode
    : planItem.dominantSubject === "duo" || planItem.dominantSubject === "npc"
      ? "primary"
      : "secondary";

  const visualWeight = isHero
    ? planItem.heroVisualWeight
    : presenceMode === "primary"
      ? 0.8
      : 0.4;

  return {
    characterId: raw.id,
    characterName: raw.name,
    role: raw.roleType ?? "supporting",
    isHero,
    importanceTier: isHero
      ? "MAIN_HERO"
      : /important|supporting/i.test(raw.roleType ?? "")
        ? "IMPORTANT_SUPPORTING_CHARACTER"
        : "RECURRING_NPC",
    canonDescription:
      raw.visualDescription?.trim() ||
      raw.description?.trim() ||
      `${raw.name}, canonical appearance per chapter bible`,
    currentOutfit: null,
    presenceMode,
    visualWeight,
    requiredFacialReadability: presenceMode === "primary",
    canonRefAssetIds: [],
  };
}

function mapGroupContext(planItem: ChapterImagePlanItem): GroupContextEntry | null {
  const intent = planItem.imageIntentType;
  if (intent === "guard_group_focus" || intent === "soldier_patrol") {
    return {
      groupKind: intent === "soldier_patrol" ? "soldiers" : "guards",
      count: Math.max(3, planItem.requiredNpcs.length),
      postureDescription: "standing in formation, alert",
      threatLevel: "latent",
      groupProps: planItem.requiredProps,
    };
  }
  if (intent === "crowd_presence") {
    return {
      groupKind: "crowd",
      count: 8,
      postureDescription: "gathered, reacting to the scene",
      threatLevel: "none",
      groupProps: [],
    };
  }
  if (intent === "group_conflict" || intent === "threat_group_focus") {
    return {
      groupKind: "enemies",
      count: Math.max(3, planItem.requiredNpcs.length),
      postureDescription: "engaged in conflict, weapons drawn",
      threatLevel: "active",
      groupProps: planItem.requiredProps,
    };
  }
  if (intent === "group_presence") {
    return {
      groupKind: "bystanders",
      count: 5,
      postureDescription: "present in the scene",
      threatLevel: "none",
      groupProps: [],
    };
  }
  return null;
}

function mapPropsContext(planItem: ChapterImagePlanItem): PropContextEntry[] {
  return planItem.requiredProps.map((name) => ({
    propId: `prop_${name.replace(/\s+/g, "_").toLowerCase()}`,
    propName: name,
    ownerCategory: "hero",
    canonDescription: `canonical ${name} per project bible`,
    visualSignificance:
      planItem.imageIntentType === "prop_insert" || planItem.imageIntentType === "symbolic_insert"
        ? "critical"
        : "medium",
  }));
}

function mapNpcContext(planItem: ChapterImagePlanItem): NpcContextEntry[] {
  return planItem.requiredNpcs.map((name) => ({
    npcId: `npc_${name.replace(/\s+/g, "_").toLowerCase()}`,
    npcName: name,
    role: "supporting",
    canonDescription: `canonical ${name} per chapter canon`,
    presenceMode: "secondary",
    visualWeight: 0.5,
  }));
}

function mapDialogueContext(
  baseMetadata: Record<string, unknown>,
): DialogueContext | null {
  const dialogues = baseMetadata.dialogues as Array<Record<string, unknown>> | undefined;
  const lines: DialogueContext["lines"] = [];
  if (Array.isArray(dialogues)) {
    for (const d of dialogues) {
      const speakerName = (d.speakerName as string | undefined) ?? (d.speaker as string | undefined) ?? "Unknown";
      const text = (d.text as string | undefined) ?? "";
      if (!text) continue;
      lines.push({
        speakerId: (d.speakerId as string | null | undefined) ?? null,
        speakerName,
        text,
        emotion: (d.emotion as string | null | undefined) ?? null,
      });
    }
  } else if (typeof baseMetadata.dialogue === "string" && baseMetadata.dialogue.trim()) {
    lines.push({
      speakerId: null,
      speakerName: "Unknown",
      text: baseMetadata.dialogue as string,
      emotion: null,
    });
  }
  if (lines.length === 0) return null;
  return { primarySpeakerId: lines[0].speakerId, lines, dialogueBeat: null };
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

export function buildCanonicalPacketForPlannedImage(
  input: CanonicalPacketBridgeInput,
): CanonicalPacketBridgeResult {
  const { planItem, baseMetadata, rawCharacters } = input;

  const characterContext: CharacterContextEntry[] = [];
  for (const name of planItem.requiredCharacters) {
    const entry = mapCharacterToContext(name, rawCharacters, planItem);
    if (entry) characterContext.push(entry);
  }

  const npcContext = mapNpcContext(planItem);
  const propContext = mapPropsContext(planItem);
  const groupContext = mapGroupContext(planItem);
  const dialogueContext = mapDialogueContext(baseMetadata);

  const subjectBalance: SubjectBalance = (() => {
    const intent = planItem.imageIntentType;
    const isDuo =
      intent === "hero_duo" ||
      intent === "hero_secondary_character" ||
      intent === "dialogue_two_shot";
    const primarySubjects = isDuo
      ? characterContext.filter((c) => c.presenceMode !== "absent").map((c) => c.characterName).slice(0, 2)
      : characterContext.filter((c) => c.presenceMode === "primary").map((c) => c.characterName);
    return {
      primarySubjects,
      weightByEntityId: Object.fromEntries(
        characterContext.map((c) => [c.characterId, c.visualWeight]),
      ),
      requiredReadableFaces: primarySubjects.slice(0, isDuo ? 2 : 1),
      requiredRelativePosition: isDuo ? "facing each other, both readable" : null,
      forbiddenSoloFraming: isDuo,
    };
  })();

  const storyContext: StoryContext = {
    chapterTitle: input.chapterContext.title,
    chapterSummary: input.chapterContext.summary,
    beatTitle: input.beatContext.title,
    beatNarrativeFunction: input.beatContext.function,
    previousBeatId: input.beatContext.previousId,
    nextBeatId: input.beatContext.nextId,
  };

  const recipeInput: CanonicalPromptRecipeInput = {
    imageIntentType: planItem.imageIntentType,
    contentRating: input.contentRating,
    visualClassification: input.visualClassification,
    mangaStyle: input.mangaStyle,
    storyContext,
    sceneActionSummary:
      (baseMetadata.caption as string | undefined) ??
      (baseMetadata.narration as string | undefined) ??
      `Panel ${planItem.panelIndex} of scene ${planItem.beatIndex}`,
    environment: input.environment,
    characters: characterContext,
    npcs: npcContext,
    props: propContext,
    group: groupContext,
    dialogue: dialogueContext,
    continuity: input.continuityContext,
    subjectBalance,
    heroPresenceMode: planItem.heroPresenceMode,
    forbiddenPromptClauses: planItem.forbiddenPromptClauses,
    forbiddenTokens: planItem.forbiddenFocus,
  };

  const recipe = buildCanonicalPromptRecipe(recipeInput);

  // P1.2 — on tente d'extraire un `panelBlueprintId` depuis le planItem ou
  // le baseMetadata pour relier le packet au contrat narratif.
  const rawBlueprintId =
    (planItem as { panelBlueprintId?: string | null }).panelBlueprintId
    ?? (baseMetadata.panelBlueprintId as string | undefined)
    ?? (baseMetadata.blueprintId as string | undefined)
    ?? null;
  const panelBlueprintId: string | null =
    typeof rawBlueprintId === "string" && rawBlueprintId.trim().length > 0
      ? rawBlueprintId
      : null;

  const packet: CanonicalImagePromptPacket = {
    packetVersion: CANONICAL_PACKET_VERSION,
    projectId: input.projectId,
    chapterId: input.chapterId,
    imageId: planItem.imageId,
    // P1.2 — identifiant DB direct + panel blueprint pour audit/reroll stable.
    sceneImageId: input.sceneImageId,
    panelBlueprintId,
    sourceBeatId: input.beatContext.id,
    pageIndex: planItem.pageIndex,
    panelIndex: planItem.panelIndex,
    beatIndex: planItem.beatIndex,

    imageIntentType: planItem.imageIntentType,
    contentRating: input.contentRating,
    universeProfile: input.universe,
    mangaStyleProfile: input.mangaStyle,
    visualClassification: input.visualClassification,

    storyContext,
    sceneContext: input.sceneContext,
    dialogueContext,
    environmentContext: input.environment,
    continuityContext: input.continuityContext,

    characterContext,
    npcContext,
    propContext,
    groupContext,

    dominantSubjectKind: planItem.dominantSubject,
    heroPresenceMode: planItem.heroPresenceMode,
    heroVisualWeight: planItem.heroVisualWeight,
    subjectBalance,

    loraBindings: [],
    canonBindings: [],

    promptSections: recipe.sections,
    finalFrenchStructuredPrompt: recipe.finalFrenchStructuredPrompt,
    finalEnglishStructuredPrompt: recipe.finalEnglishStructuredPrompt,
    negativePromptEnglish: recipe.negativePromptEnglish,

    provider: "fal",
    modelRoutingDecision: {
      modelId: "",
      referencePolicy: "NONE",
      usedRefAssetIds: [],
      usedIpAdapterRefAssetIds: [],
      reason: "deferred",
    },
    providerPayload: {
      prompt: recipe.finalEnglishStructuredPrompt,
      negativePrompt: recipe.negativePromptEnglish,
      width: 0,
      height: 0,
      refs: [],
      ipAdapterRefs: [],
      guidanceScale: null,
      seed: null,
      extra: {},
    },

    buildWarnings: recipe.warnings,
    buildTimestamp: Date.now(),
  };

  const payloadResult = buildFalPromptPayload({
    packet,
    characterRefAssets: input.characterRefAssets,
    styleRefAssets: input.styleRefAssets,
    sceneRefAssets: input.sceneRefAssets,
  });

  const packetWithPayload: CanonicalImagePromptPacket = {
    ...packet,
    modelRoutingDecision: payloadResult.modelRoutingDecision,
    providerPayload: payloadResult.payload,
  };

  return { packet: packetWithPayload, payload: payloadResult };
}
