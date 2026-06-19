/**
 * manga-prompt-composer-core.ts
 *
 * Cœur du composer manga legacy : `composeMangaPanelPrompt` et
 * `composeChapterCoverPrompt`. Aucune logique premium ici (le chemin
 * v3 passe par `minimal-panel-prompt-builder`).
 *
 * Extrait de `manga-prompt-composer.ts` (audit-v9, < 500 lignes/fichier).
 */

import {
  buildLookProfileNegativeBlock,
  buildLookProfilePromptBlock,
  compileHardTraitsNegativeBlock,
  compileHardTraitsPromptBlock,
} from "@manga-ai-studio/core";
import {
  buildPanelIntentNegativeBlock,
  buildPanelIntentPromptBlock,
} from "../services/panel-intent-card";
import { buildSceneAnchorPromptBlock } from "../services/scene-anchor";
import { stylePresetExtraTerms } from "../style-presets";
import type { PanelMood } from "../chapter/shared-types";
import {
  BASE_NEGATIVE,
  BEAT_TYPE_ADDONS,
  CAMERA_DESCRIPTORS,
  INTENSITY_CONSTRAINTS,
  MANGA_FRAMING_MAP,
  MANGA_UNIVERSAL_NEGATIVE,
  MOOD_DESCRIPTORS,
} from "./manga-prompt-dictionaries";
import {
  buildDarkGenreBlock,
  buildEnvironmentLock,
  buildRequiredPropsBlock,
  describeCharacter,
  inferPromptPreset,
  resolveVisualStyle,
  sanitizeSectionText,
} from "./manga-prompt-builders";
import {
  warnLegacyComposer,
  type CharacterRef,
  type ComposedPrompt,
  type PanelPromptInput,
  type StylePackRef,
} from "./manga-prompt-types";

/**
 * Compose un prompt image structuré pour un panel manga.
 *
 * @deprecated LEGACY. **Ne pas utiliser depuis le render-pass v3.**
 *
 * Pour la pipeline v3 (PIPELINE_V3_STORYBOARD), le builder autorisé est
 * `buildMinimalPanelPrompt` (`packages/ai/src/services/minimal-panel-prompt-builder.ts`)
 * qui travaille directement sur un `PanelRenderSpec` validé, en anglais,
 * court, non contradictoire, sans couche de traduction.
 */
export function composeMangaPanelPrompt(input: PanelPromptInput): ComposedPrompt {
  warnLegacyComposer("composeMangaPanelPrompt");
  const layer = input.contentIntensityLayer ?? "TEEN";

  if (layer === "RESTRICTED_BLOCKED_VISUAL") {
    throw new Error("Content blocked: RESTRICTED_BLOCKED_VISUAL layer");
  }

  const visualStyle = resolveVisualStyle(input.stylePack, input.stylePresetSlug);
  const moodDesc = MOOD_DESCRIPTORS[input.mood] ?? "dramatic manga panel";
  const cameraDesc = CAMERA_DESCRIPTORS[input.camera] ?? `${input.camera}, manga composition`;
  const intensityNote = INTENSITY_CONSTRAINTS[layer] ?? "";

  // Réordonner le cast selon subjectFocus pour que le Subject Lock reflète la hiérarchie.
  const focusForLock = input.subjectFocus;
  const reorderedCharacters = (() => {
    const list = input.characters ? [...input.characters] : [];
    if (!focusForLock || list.length <= 1) return list;
    const isHero = (c: CharacterRef) => c.importanceTier === "MAIN_HERO";
    const isAntagonist = (c: CharacterRef) => c.importanceTier === "SECONDARY_CORE";
    const isImportantNpc = (c: CharacterRef) =>
      c.importanceTier === "IMPORTANT_SUPPORTING_CHARACTER" ||
      c.importanceTier === "RECURRING_NPC";
    if (focusForLock === "important_npc" || focusForLock === "npc") {
      return list.sort((a, b) => {
        if (isImportantNpc(a) && !isImportantNpc(b)) return -1;
        if (!isImportantNpc(a) && isImportantNpc(b)) return 1;
        if (isHero(a) && !isHero(b)) return 1;
        if (!isHero(a) && isHero(b)) return -1;
        return 0;
      });
    }
    if (focusForLock === "enemy" || focusForLock === "antagonist") {
      return list.sort((a, b) => {
        if (isAntagonist(a) && !isAntagonist(b)) return -1;
        if (!isAntagonist(a) && isAntagonist(b)) return 1;
        return 0;
      });
    }
    return list;
  })();

  const cutawayFocus =
    focusForLock === "environment" ||
    focusForLock === "aftermath" ||
    focusForLock === "prop" ||
    focusForLock === "reaction" ||
    focusForLock === "group";
  const explicitCutawayNonHero =
    input.cutawayType === "environment" ||
    input.cutawayType === "environment_establishing" ||
    input.cutawayType === "location_transition" ||
    input.cutawayType === "prop_insert" ||
    input.cutawayType === "object_insert" ||
    input.cutawayType === "aftermath" ||
    input.cutawayType === "movement_trace" ||
    input.cutawayType === "reaction" ||
    input.cutawayType === "reaction_insert" ||
    input.cutawayType === "crowd" ||
    input.cutawayType === "npc_group" ||
    input.cutawayType === "surveillance" ||
    input.cutawayType === "threat_insert";
  const isCutawayPanel = cutawayFocus || explicitCutawayNonHero;
  const focusCharacterIndex = cutawayFocus ? -1 : 0;

  const charDescs =
    reorderedCharacters.length > 0
      ? reorderedCharacters
          .map((c, i) => describeCharacter(c, i === focusCharacterIndex ? "full" : "supporting"))
          .join(" | ")
      : "";

  const blueprint = input.sceneBlueprint;
  const preset = inferPromptPreset(input);
  const environmentLock = buildEnvironmentLock(input);
  const promptWarnings: string[] = [];

  type SectionPriority = 1 | 2 | 3 | 4;
  const promptSections: Array<{ key: string; label: string; content: string; priority: SectionPriority }> = [];
  const addSection = (key: string, label: string, content: string, priority: SectionPriority = 3) => {
    if (!content.trim()) return;
    promptSections.push({ key, label, content: sanitizeSectionText(content), priority });
  };

  if (input.chapterLookProfile) {
    addSection("chapterLookProfile", "Chapter Look Profile", buildLookProfilePromptBlock(input.chapterLookProfile), 2);
  }

  const shouldInjectSubjectLock = !isCutawayPanel && charDescs.length > 0;
  addSection(
    "characterCanonLock",
    "Character Canon Lock",
    shouldInjectSubjectLock ? `Subject lock: ${charDescs}.` : "",
    1,
  );

  if (input.characters && input.characters.length > 0) {
    const hardTraitBlocks = input.characters
      .filter((c) => c.fingerprint?.hardTraits && c.fingerprint.hardTraits.length > 0)
      .map((c) => compileHardTraitsPromptBlock(c.fingerprint!))
      .filter(Boolean);
    if (hardTraitBlocks.length > 0) {
      addSection("hardTraitsLock", "Hard Traits Lock", hardTraitBlocks.join(" | "), 1);
    }
  }

  if (input.intentCard) {
    addSection("panelIntent", "Panel Intent / Beat", buildPanelIntentPromptBlock(input.intentCard), 1);
  }

  if (input.sceneAnchor) {
    addSection("sceneAnchor", "Scene Spatial Anchor", buildSceneAnchorPromptBlock(input.sceneAnchor), 2);
  }

  addSection(
    "narrativeObjective",
    "Narrative Objective",
    input.narrativeObjective
      ? `Narrative objective: ${input.narrativeObjective}.`
      : input.sceneContext
        ? `Continuity: ${input.sceneContext.slice(0, 220)}.`
        : "",
    3,
  );
  addSection(
    "actionPoseEmotion",
    "Exact Action / Pose / Emotion",
    `Action: ${input.action}. Mood and lighting: ${moodDesc}.`,
    1,
  );
  addSection("cameraComposition", "Camera / Composition / Framing", `Camera and composition: ${cameraDesc}.`, 1);
  addSection(
    "environmentContext",
    "Environment / Context",
    `Environment: ${input.location} clearly visible. ${input.environmentHint?.slice(0, 220) ?? ""}${
      environmentLock ? ` Strict environment readability: ${environmentLock}.` : ""
    }`,
    2,
  );
  addSection(
    "renderingMood",
    "Rendering / Inking / Mood",
    `Style: ${visualStyle}. ${
      intensityNote && layer !== "GENERAL_SAFE" ? `Content boundaries: ${intensityNote}.` : ""
    }`,
    2,
  );

  const stylePresetExtras = stylePresetExtraTerms(input.stylePresetSlug);
  if (stylePresetExtras.positive.length > 0) {
    addSection("stylePresetExtras", "Style Preset Reinforcement", stylePresetExtras.positive.join(", "), 3);
  }

  if (input.environmentHint && input.environmentHint.length > 50) {
    addSection("universeContext", "Universe Context", input.environmentHint.slice(0, 300), 4);
  }

  // IMG-1 : Manga framing directive selon le type de plan
  const normalizedFocus =
    input.subjectFocus === "important_npc"
      ? "npc"
      : input.subjectFocus === "antagonist"
        ? "enemy"
        : input.subjectFocus ?? null;
  const shotKey =
    input.shotType && normalizedFocus
      ? `${input.shotType}_${normalizedFocus}`
      : input.shotType && input.cutawayType
        ? `${input.shotType}_${input.cutawayType}`
        : input.shotType ?? null;
  const nonHeroFocus = normalizedFocus && normalizedFocus !== "hero";
  const resolvedFraming =
    nonHeroFocus || isCutawayPanel
      ? (shotKey && MANGA_FRAMING_MAP[shotKey]) ||
        MANGA_FRAMING_MAP[`wide_${normalizedFocus}`] ||
        MANGA_FRAMING_MAP[`medium_${normalizedFocus}`] ||
        MANGA_FRAMING_MAP[`closeup_${normalizedFocus}`] ||
        (isCutawayPanel ? MANGA_FRAMING_MAP["wide_environment"] : null) ||
        null
      : (shotKey && MANGA_FRAMING_MAP[shotKey]) ||
        (input.shotType && MANGA_FRAMING_MAP[`${input.shotType}_hero`]) ||
        null;
  if (resolvedFraming) {
    addSection("mangaFraming", "Manga Panel Framing", resolvedFraming, 1);
  }

  if (input.beatType && BEAT_TYPE_ADDONS[input.beatType]) {
    addSection("beatEffects", "Beat FX / Manga Effects", BEAT_TYPE_ADDONS[input.beatType], 3);
  }

  if (input.chapterStyleAnchor) {
    const styleEnforcement = [
      input.chapterStyleAnchor,
      "IMPORTANT: maintain consistent art style throughout all panels",
      "same line weight, same shading technique, same character proportions as established",
    ]
      .filter(Boolean)
      .join(", ");
    addSection("chapterStyleAnchor", "Chapter Style Enforcement", styleEnforcement, 2);
  }

  if (input.stylePack?.styleRefImageUrl && !input.referenceImageUrls?.length) {
    input.referenceImageUrls = [input.stylePack.styleRefImageUrl];
    input.referencePolicy = "LIGHT";
  }

  if (input.requiredProps && input.requiredProps.length > 0) {
    const propsBlock = buildRequiredPropsBlock(input.requiredProps);
    if (propsBlock) {
      addSection("requiredProps", "Required Props / Key Objects", `KEY OBJECTS: ${propsBlock}`, 2);
    }
  }

  const darkGenreBlock = buildDarkGenreBlock(
    input.stylePack?.description ?? input.stylePack?.name ?? null,
    layer,
  );
  if (darkGenreBlock) {
    addSection("darkGenre", "Dark Genre Style", darkGenreBlock, 3);
  }

  if (input.npcPresence && input.npcPresence.length > 0) {
    const npcBlock = input.npcPresence.slice(0, 3).join("; ");
    addSection("npcPresence", "Background NPC Characters", `BACKGROUND CHARACTERS: ${npcBlock}`, 3);
  }

  if (!charDescs && input.characters && input.characters.length > 0) {
    promptWarnings.push("character_lock_missing");
  }
  if (!input.narrativeObjective && !input.sceneContext) {
    promptWarnings.push("narrative_objective_missing");
  }

  // Assemblage priorisé du prompt final.
  const prioritizedParts: Array<{ priority: SectionPriority; text: string }> = [];
  for (const section of promptSections) {
    prioritizedParts.push({ priority: section.priority, text: section.content });
  }

  if (blueprint) {
    prioritizedParts.push({
      priority: 2,
      text: sanitizeSectionText(`Spatial relation: ${blueprint.composition.framingRules.join(", ")}.`),
    });
    const heroInForeground = blueprint.environment.foregroundElements.some((el) =>
      reorderedCharacters.some(
        (c) => c.importanceTier === "MAIN_HERO" && el.toLowerCase().includes(c.name.toLowerCase()),
      ),
    );
    if (cutawayFocus && heroInForeground) {
      const cutawayStagingMap: Record<string, string> = {
        environment:
          "foreground: architectural / environmental elements; midground: ambient layered background; background: distant setting cues. Characters, if any, appear only as silhouettes in midground or background, never centered.",
        aftermath:
          "foreground: debris / consequence markers; midground: altered environment; background: residual atmosphere. No character in foreground.",
        prop: "foreground: the key object/prop, fully legible and centered; midground: minimal context; background: subdued environment. No character centered in foreground.",
        reaction:
          "foreground: expressive NPC / non-protagonist face or body; midground: contextual environment; background: atmospheric cues. Hero not in foreground.",
      };
      prioritizedParts.push({
        priority: 1,
        text: sanitizeSectionText(
          `Spatial staging (cutaway): ${
            cutawayStagingMap[focusForLock ?? "environment"] ?? cutawayStagingMap.environment
          }`,
        ),
      });
    } else {
      prioritizedParts.push({
        priority: 2,
        text: sanitizeSectionText(
          `Spatial staging: foreground ${blueprint.environment.foregroundElements.join(", ")}; midground ${blueprint.environment.midgroundElements.join(", ")}; background ${blueprint.environment.backgroundElements.join(", ")}.`,
        ),
      });
    }
    const pb = blueprint.promptBridge;
    if (pb.focusLine) prioritizedParts.push({ priority: 1, text: sanitizeSectionText(pb.focusLine) });
    if (pb.requiredPropLine) prioritizedParts.push({ priority: 1, text: sanitizeSectionText(pb.requiredPropLine) });
    if (pb.requiredEnemyLine) prioritizedParts.push({ priority: 1, text: sanitizeSectionText(pb.requiredEnemyLine) });
    if (pb.speakerAnchorLine) prioritizedParts.push({ priority: 2, text: sanitizeSectionText(pb.speakerAnchorLine) });
    if (pb.cutawayLine) prioritizedParts.push({ priority: 1, text: sanitizeSectionText(pb.cutawayLine) });
  }
  if (input.dialogueHint) {
    prioritizedParts.push({
      priority: 4,
      text: sanitizeSectionText(`Subtext: ${input.dialogueHint.slice(0, 120)}.`),
    });
  }

  // Tri stable par priorité croissante : P1 → P2 → P3 → P4.
  const positive = prioritizedParts
    .map((part, index) => ({ ...part, index }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .map((p) => p.text)
    .filter(Boolean)
    .join(" ");

  // Negative prompt enrichi selon le layer + verrous de dérive visuelle
  let negative = `${MANGA_UNIVERSAL_NEGATIVE}, ${BASE_NEGATIVE}`;
  if (cutawayFocus || isCutawayPanel) {
    negative +=
      ", hero panel, hero portrait, manga hero panel, protagonist centered, main character foreground, hero close-up, face filling frame, tight hero framing, hero lock, hero showcase";
  }
  if (input.characters && input.characters.length > 0) {
    const driftGuards = input.characters
      .flatMap((c) => {
        const guards: string[] = [];
        if (c.hairColor) guards.push(`wrong hair color for ${c.name}`);
        if (c.eyeColor) guards.push(`wrong eye color for ${c.name}`);
        if (c.outfitDefault) guards.push(`wrong outfit for ${c.name}`);
        if (c.forbiddenDrift && c.forbiddenDrift.length > 0) {
          guards.push(...c.forbiddenDrift.slice(0, 6));
        }
        return guards;
      })
      .filter(Boolean)
      .join(", ");
    if (driftGuards) negative += `, ${driftGuards}`;
  }
  if (
    /(lycée|lycee|école|ecole|school|campus)/i.test(
      `${input.location} ${input.action} ${input.environmentHint ?? ""}`,
    )
  ) {
    negative +=
      ", generic campus background, empty school courtyard, missing students, blank outdoor backdrop";
  }
  if (input.stylePack?.negativeConstraints?.length) {
    negative += `, ${input.stylePack.negativeConstraints.join(", ")}`;
  }
  if (input.characters && input.characters.length > 0) {
    const maleChars = input.characters.filter((c) => c.gender?.trim().toLowerCase() === "male");
    const femaleChars = input.characters.filter((c) => c.gender?.trim().toLowerCase() === "female");
    if (maleChars.length > 0 && femaleChars.length === 0) {
      negative += ", woman, female, feminine, girl, long feminine hair";
    } else if (femaleChars.length > 0 && maleChars.length === 0) {
      negative += ", man, male, masculine, boy, beard, facial hair";
    }
  }
  if (layer === "GENERAL_SAFE" || layer === "TEEN") {
    negative += ", nudity, violence, blood, gore, suggestive poses";
  }

  if (blueprint?.promptBridge.antiCollapseLine) {
    negative += `, ${blueprint.promptBridge.antiCollapseLine}`;
  }

  if (input.chapterLookProfile) {
    const lookNeg = buildLookProfileNegativeBlock(input.chapterLookProfile);
    if (lookNeg) negative += `, ${lookNeg}`;
  }

  if (input.characters && input.characters.length > 0) {
    const hardNegBlocks = input.characters
      .filter((c) => c.fingerprint)
      .map((c) => compileHardTraitsNegativeBlock(c.fingerprint!))
      .filter(Boolean);
    if (hardNegBlocks.length > 0) {
      negative += `, ${hardNegBlocks.join(", ")}`;
    }
  }

  if (input.intentCard) {
    const intentNeg = buildPanelIntentNegativeBlock(input.intentCard);
    if (intentNeg) negative += `, ${intentNeg}`;
  }

  if (stylePresetExtras.negative.length > 0) {
    negative += `, ${stylePresetExtras.negative.join(", ")}`;
  }

  return {
    positive,
    negative,
    seed: input.seed,
    debug: {
      finalPrompt: positive,
      promptSections,
      sectionSources: {
        characterCanonLock: input.characters?.map((character) => character.name) ?? [],
        narrativeObjective: [input.narrativeObjective ?? input.sceneContext ?? ""].filter(Boolean),
        actionPoseEmotion: [input.action, input.mood],
        cameraComposition: [input.camera],
        environmentContext: [input.location, input.environmentHint ?? "", environmentLock],
        renderingMood: [visualStyle, intensityNote],
      },
      resolvedPolicy: {
        hasCharacterLock: Boolean(charDescs),
        hasNarrativeObjective: Boolean(input.narrativeObjective || input.sceneContext),
        hasEnvironmentLock: Boolean(environmentLock),
        hasLookProfile: Boolean(input.chapterLookProfile),
        hasSceneAnchor: Boolean(input.sceneAnchor),
        hasIntentCard: Boolean(input.intentCard),
      },
      promptWarnings,
    },
    fal: {
      positivePrompt: positive,
      negativePrompt: negative,
      safetyProfile: layer === "GENERAL_SAFE" ? "safe" : layer === "TEEN" ? "teen" : "mature_non_explicit",
      intensityProfile: intensityNote,
      preset,
    },
  };
}

/**
 * @deprecated LEGACY fallback. Le chemin canonical n'a pas encore de recette
 * cover dediee — cette fonction reste donc active en prod le temps que la
 * couverture rejoigne le canonical packet.
 */
export function composeChapterCoverPrompt(input: {
  stylePack?: StylePackRef | null;
  characters?: CharacterRef[];
  chapterTitle: string;
  tone: string;
  mood: PanelMood;
  contentIntensityLayer?: string;
}): ComposedPrompt {
  warnLegacyComposer("composeChapterCoverPrompt");
  const visualStyle = resolveVisualStyle(input.stylePack);
  const moodDesc = MOOD_DESCRIPTORS[input.mood] ?? "dramatic";
  const charDescs =
    input.characters && input.characters.length > 0
      ? input.characters.map((c) => describeCharacter(c)).join(" | ")
      : "";

  const positive = [
    visualStyle,
    "manga chapter cover, full page illustration",
    charDescs,
    `tone: ${input.tone}`,
    moodDesc,
    "epic composition, detailed background, professional manga cover art",
  ]
    .filter(Boolean)
    .join(", ");

  return { positive, negative: BASE_NEGATIVE };
}
