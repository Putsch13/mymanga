import {
  parseIntentEntities,
  type StoryboardPanel,
  type RoutingContext,
} from "@manga-ai-studio/ai";
import { type PanelCharacterPlan } from "@manga-ai-studio/core";
import type { SceneBlueprint } from "@manga-ai-studio/world";

export function buildPanelCharacterPlan(input: {
  panelId: string;
  panel: StoryboardPanel;
  sceneCharacters: string[];
  shotType?: string;
  purpose?: string;
}): PanelCharacterPlan {
  const characters = input.panel.characters ?? [];
  const foregroundCharacters =
    input.shotType === "wide"
      ? characters.slice(0, 1)
      : input.shotType === "closeup" || input.shotType === "extreme_closeup"
        ? characters.slice(0, 1)
        : characters.slice(0, 2);
  const midgroundCharacters =
    input.shotType === "wide"
      ? characters.slice(1, 3)
      : input.shotType === "over_shoulder"
        ? characters.slice(0, 2)
        : characters.slice(1, 3);
  const backgroundCharacters = input.sceneCharacters.filter((name) => !foregroundCharacters.includes(name) && !midgroundCharacters.includes(name));
  return {
    panelId: input.panelId,
    foregroundCharacters,
    midgroundCharacters,
    backgroundCharacters,
    faceVisibilityExpected:
      input.shotType === "closeup" || input.shotType === "extreme_closeup"
        ? "priority"
        : input.shotType === "medium"
          ? "clear"
          : input.shotType === "over_shoulder"
            ? "partial"
            : "none",
    actionIntensity:
      input.purpose === "action"
        ? "high"
        : input.purpose === "reaction" || input.purpose === "dialogue"
          ? "low"
          : "medium",
    speakingPriority: (input.panel.dialogues ?? [])
      .map((dialogue) => dialogue.speaker)
      .concat(input.panel.dialogue?.speaker ? [input.panel.dialogue.speaker] : [])
      .filter((speaker, index, all) => Boolean(speaker) && all.indexOf(speaker) === index),
  };
}

export function buildSceneKeyframeDraft(input: {
  sceneId: string;
  scene: { summary: string; location: string; characters: string[]; purpose?: string | null };
  sceneBlueprint: SceneBlueprint;
  stylePack?: {
    renderFamily?: string | null;
    lineWeight?: string | null;
    shadingMode?: string | null;
    contrastProfile?: string | null;
    backgroundDensity?: string | null;
    cameraLanguage?: string | null;
  } | null;
  persistentSceneExtras: Array<{ archetype: string; anchorSlot: string }>;
}) {
  const styleLine = [
    input.stylePack?.renderFamily,
    input.stylePack?.lineWeight,
    input.stylePack?.shadingMode,
    input.stylePack?.contrastProfile,
  ].filter(Boolean).join(", ");
  const extrasLine = input.persistentSceneExtras
    .map((extra) => `${extra.archetype}:${extra.anchorSlot}`)
    .slice(0, 5)
    .join(", ");
  const positivePrompt = [
    styleLine || "premium manga scene keyframe",
    "establishing scene keyframe",
    `location: ${input.scene.location}`,
    input.sceneBlueprint.promptBridge.sceneContextLine,
    input.sceneBlueprint.promptBridge.environmentLine,
    `characters present: ${input.scene.characters.join(", ")}`,
    input.scene.purpose ? `scene purpose: ${input.scene.purpose}` : "",
    input.scene.summary,
    extrasLine ? `persistent extras: ${extrasLine}` : "",
    "clear environment, readable architecture, balanced foreground midground background",
  ].filter(Boolean).join(", ");
  const negativePrompt = [
    "empty background",
    "studio backdrop",
    "isolated portrait",
    "blurred environment",
  ].join(", ");
  return {
    positivePrompt,
    negativePrompt,
    environmentLock: {
      location: input.scene.location,
      summary: input.scene.summary,
      extras: input.persistentSceneExtras,
      requiredSignals: parseIntentEntities(`${input.scene.location} ${input.scene.summary}`, []).map((entity) => entity.name).slice(0, 6),
    },
    compositionArchetype: input.scene.purpose?.toLowerCase().includes("fight") ? "combat_establishing" : "story_scene",
    involvedCharacterNames: input.scene.characters,
  };
}

export function buildRoutingContext(
  intensityLayer: string,
  panel: StoryboardPanel,
  panelContract: {
    purpose?: string;
    shotType?: "wide" | "medium" | "closeup" | "extreme_closeup" | "over_shoulder";
    cameraAngle?: string;
    npcPresence?: string[];
    npcGroupPresence?: string[];
    creaturePresence?: string[];
    mustShowLocationSignals?: string[];
  } | undefined,
  stylePack: { backgroundDensity?: string | null } | null | undefined,
  hasCanonRef: boolean,
  adultEngine?: "realistic" | "fantasy",
  panelCharacterRoles: string[] = [],
  panelCharacterImportanceTiers: Array<"MAIN_HERO" | "SECONDARY_CORE" | "IMPORTANT_SUPPORTING_CHARACTER" | "RECURRING_NPC" | "BACKGROUND_EXTRA"> = [],
  chapterLookProfileMode?: string | null,
  beatEventType?: string | null,
): RoutingContext {
  const text = `${panel.camera} ${panel.caption} ${panel.prompt}`.toLowerCase();
  const heroPresent = panelCharacterRoles.some((role) => /hero|protagon|main_hero|héros|heros/i.test(role));
  const shotType = panelContract?.shotType ?? (/(wide|establishing|panorama|vue d'ensemble)/.test(text)
    ? "wide"
    : /(over shoulder|over-shoulder|par-dessus l'épaule)/.test(text)
      ? "over_shoulder"
      : /(extreme close)/.test(text)
        ? "extreme_closeup"
        : /(close-up|closeup|gros plan)/.test(text)
          ? "closeup"
          : "medium");
  return {
    mode: "PANEL_DRAFT",
    contentIntensityLayer: intensityLayer,
    adultEngine,
    isNewCharacter: false,
    hasCanonReferences: hasCanonRef,
    characterCountInScene: panel.characters.length,
    panelCharacterRoles,
    panelCharacterImportanceTiers,
    heroPresent,
    heroFocus: heroPresent && (shotType === "closeup" || shotType === "extreme_closeup"),
    purpose: panelContract?.purpose,
    npcCount: (panelContract?.npcPresence?.length ?? 0) > 0 || /(crowd|guard|merchant|passant|client|audience|foule|garde)/.test(text) ? 1 : 0,
    creatureCount: (panelContract?.creaturePresence?.length ?? 0) > 0 || /(creature|monster|spirit|dragon|familiar|beast|mutant)/.test(text) ? 1 : 0,
    hasNpcGroup: (panelContract?.npcGroupPresence?.length ?? 0) > 0,
    hasCreatureGroup: (panelContract?.creaturePresence?.length ?? 0) > 1,
    shotType,
    cameraAngle: panelContract?.cameraAngle,
    environmentPriority:
      (panelContract?.mustShowLocationSignals?.length ?? 0) >= 2
      || /(environment|decor|décor|background|ruins|city|forest|garden|lab|arena|crowd|school|campus|courtyard)/.test(text)
        ? "high"
        : panel.characters.length >= 2
          ? "medium"
          : "low",
    locationComplexity: Math.min(30, (panelContract?.mustShowLocationSignals?.length ?? 0) * 6),
    environmentDensityRequired:
      stylePack?.backgroundDensity === "high" || (panelContract?.shotType === "wide")
        ? "high"
        : stylePack?.backgroundDensity === "low"
          ? "low"
          : "medium",
    continuityWeight: hasCanonRef ? 70 : 35,
    scenePurpose: panel.caption,
    styleBackgroundDensity: stylePack?.backgroundDensity ?? null,
    styleReferenceRequired: hasCanonRef || /(style|render family|ink|shading)/.test(text),
    needsInpaint: false,
    needsPoseVariation: false,
    preferPhotorealCover: false,
    explicitBlocked: intensityLayer === "RESTRICTED_BLOCKED_VISUAL",
    goreStylizedMature:
      intensityLayer === "MATURE_DRAMA" ||
      intensityLayer === "MATURE_VISUAL" ||
      intensityLayer === "ADULT_EXPLICIT",
    chapterLookProfileMode: chapterLookProfileMode ?? null,
    beatEventType: beatEventType ?? null,
  };
}

export function inferRequiredSceneExtras(scene: {
  summary: string;
  location: string;
  characters: string[];
}) {
  const text = `${scene.summary} ${scene.location}`.toLowerCase();
  const extras: Array<{ archetype: "bartender" | "client" | "guard" | "server" | "crowd" | "merchant" | "passerby" | "other"; anchorSlot: string }> = [];
  if (/(taverne|bar|auberge|café|cafe)/.test(text)) {
    extras.push({ archetype: "bartender", anchorSlot: "service-counter" });
    extras.push({ archetype: "client", anchorSlot: "ambient-left" });
  }
  if (/(marché|market|bazaar|boutique)/.test(text)) {
    extras.push({ archetype: "merchant", anchorSlot: "stall-front" });
    extras.push({ archetype: "passerby", anchorSlot: "lane-depth" });
  }
  if (/(prison|surveillance|checkpoint|guard|garde|palais|banque)/.test(text)) {
    extras.push({ archetype: "guard", anchorSlot: "security-edge" });
  }
  if (/(arène|arena|foule|crowd|festival)/.test(text)) {
    extras.push({ archetype: "crowd", anchorSlot: "backdrop-crowd" });
  }
  if (/(lycée|lycee|école|ecole|school|campus|cour de récré|cour du lycée|classe)/.test(text)) {
    extras.push({ archetype: "crowd", anchorSlot: "student-yard" });
    extras.push({ archetype: "passerby", anchorSlot: "corridor-depth" });
  }
  if (/(moque|ridicul|humili|entouré de ses amis|autour de ses amis|raillerie)/.test(text)) {
    extras.push({ archetype: "crowd", anchorSlot: "mocking-ring" });
  }
  if (extras.length === 0 && scene.characters.length <= 2) {
    extras.push({ archetype: "passerby", anchorSlot: "ambient-depth" });
  }
  return extras.slice(0, 3);
}
