import {
  parseIntentEntities,
  type StoryboardPanel,
  type RoutingContext,
} from "@manga-ai-studio/ai";
import {
  type PanelCharacterPlan,
  type VisualWorldContract,
  type VisualWorldNpcGroup,
  legacyDialogueLinesFromStoryboardPanelLike,
} from "@manga-ai-studio/core";
import type { SceneBlueprint } from "@manga-ai-studio/world";
import { buildRoutingContextV2 } from "./routing-context";

export function buildPanelCharacterPlan(input: {
  panelId: string;
  panel: StoryboardPanel;
  sceneCharacters: string[];
  shotType?: string;
  purpose?: string;
  subjectFocus?: string | null;
  cutawayType?: string | null;
}): PanelCharacterPlan {
  const characters = input.panel.characters ?? [];

  // Un panel "interaction" / "group" / two-shot doit garder 2 persos au premier plan,
  // même en closeup/extreme_closeup, sinon le PNJ disparaît systématiquement.
  const isInteraction =
    input.subjectFocus === "group"
    || input.cutawayType === "crowd_reaction"
    || /interaction|dialogue|confrontation/i.test(input.purpose ?? "")
    || (input.shotType === "medium" && characters.length >= 2);

  const foregroundCharacters =
    input.shotType === "wide"
      ? characters.slice(0, isInteraction ? 2 : 1)
      : input.shotType === "closeup" || input.shotType === "extreme_closeup"
        ? characters.slice(0, isInteraction ? 2 : 1)
        : characters.slice(0, 2);
  const midgroundCharacters =
    input.shotType === "wide"
      ? characters.slice(foregroundCharacters.length, foregroundCharacters.length + 2)
      : input.shotType === "over_shoulder"
        ? characters.slice(0, 2)
        : characters.slice(foregroundCharacters.length, foregroundCharacters.length + 2);
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
    speakingPriority: (() => {
      const p = input.panel;
      const dialogueArray =
        Array.isArray(p.dialogues) && p.dialogues.length > 0
          ? p.dialogues
          : p.dialogue && typeof p.dialogue === "object" && "text" in p.dialogue
            ? [p.dialogue]
            : null;
      const sfxArr = typeof p.sfx === "string" && p.sfx.trim() ? [p.sfx.trim()] : null;
      const lines = legacyDialogueLinesFromStoryboardPanelLike({
        panelId: input.panelId,
        dialogue: dialogueArray,
        narration: typeof p.narration === "string" ? p.narration : null,
        sfx: sfxArr,
        panelTextBundle: null,
      });
      return lines
        .map((d) => d.speaker)
        .filter((speaker, index, all) => Boolean(speaker) && all.indexOf(speaker) === index);
    })(),
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
  persistentSceneExtras: Array<{ archetypeId: string; archetypeLabel: string; anchorSlot: string }>;
}) {
  const styleLine = [
    input.stylePack?.renderFamily,
    input.stylePack?.lineWeight,
    input.stylePack?.shadingMode,
    input.stylePack?.contrastProfile,
  ].filter(Boolean).join(", ");
  const extrasLine = input.persistentSceneExtras
    .map((extra) => `${extra.archetypeLabel}:${extra.anchorSlot}`)
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

/**
 * Wrapper legacy — délègue à `buildRoutingContextV2` dans `routing-context.ts`.
 * Conservé pour ne pas casser la signature positionnelle des appelants
 * existants (image-generation-pass, tests, etc.).
 */
export function buildRoutingContext(
  intensityLayer: string,
  panel: StoryboardPanel,
  panelContract:
    | {
        purpose?: string;
        shotType?: "wide" | "medium" | "closeup" | "extreme_closeup" | "over_shoulder";
        cameraAngle?: string;
        npcPresence?: string[];
        npcGroupPresence?: string[];
        creaturePresence?: string[];
        mustShowLocationSignals?: string[];
        cutawayType?: string | null;
      }
    | undefined,
  stylePack: { backgroundDensity?: string | null } | null | undefined,
  hasCanonRef: boolean,
  adultEngine?: "realistic" | "fantasy",
  panelCharacterRoles: string[] = [],
  panelCharacterImportanceTiers: Array<
    "MAIN_HERO" | "SECONDARY_CORE" | "IMPORTANT_SUPPORTING_CHARACTER" | "RECURRING_NPC" | "BACKGROUND_EXTRA"
  > = [],
  chapterLookProfileMode?: string | null,
  beatEventType?: string | null,
  subjectFocus?: RoutingContext["subjectFocus"],
): RoutingContext {
  return buildRoutingContextV2({
    intensityLayer,
    panel,
    panelContract,
    stylePack: stylePack ?? null,
    hasCanonRef,
    adultEngine,
    panelCharacterRoles,
    panelCharacterImportanceTiers,
    chapterLookProfileMode,
    beatEventType,
    subjectFocus,
  });
}

export type SceneExtraRequirement = {
  archetypeId: string;
  archetypeLabel: string;
  source: "legacy" | "ai_generated";
  anchorSlot: string;
};

function anchorSlotForNpcGroup(g: VisualWorldNpcGroup, index: number): string {
  const raw = (g.relationToLocation ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  if (raw.length > 0) return raw;
  return `vw-npc-${index}-${g.id.replace(/[^a-z0-9]+/gi, "").slice(0, 12)}`;
}

/**
 * Extras requis pour une scène : groupes PNJ du `VisualWorldContract` liés au beat,
 * sinon inférence regex legacy (`inferRequiredSceneExtras`).
 */
export function inferRequiredSceneExtrasWithVisualWorld(
  vw: VisualWorldContract | null | undefined,
  scene: { summary: string; location: string; characters: string[] },
  beatId: string | null | undefined,
): SceneExtraRequirement[] {
  if (vw && beatId) {
    const groups = vw.npcGroups.filter((g) => g.requiredBeatIds.includes(beatId));
    if (groups.length > 0) {
      return groups.slice(0, 4).map((g, i) => ({
        archetypeId: g.id,
        archetypeLabel: g.label,
        source: "ai_generated" as const,
        anchorSlot: anchorSlotForNpcGroup(g, i),
      }));
    }
  }
  return inferRequiredSceneExtras(scene);
}

export function inferRequiredSceneExtras(scene: {
  summary: string;
  location: string;
  characters: string[];
}): SceneExtraRequirement[] {
  const text = `${scene.summary} ${scene.location}`.toLowerCase();
  const extras: SceneExtraRequirement[] = [];
  const push = (slug: string, label: string, anchorSlot: string) => {
    extras.push({
      archetypeId: `inferred:${slug}`,
      archetypeLabel: label,
      source: "legacy",
      anchorSlot,
    });
  };
  if (/(taverne|bar|auberge|café|cafe)/.test(text)) {
    push("bartender", "Barman", "service-counter");
    push("client", "Client", "ambient-left");
  }
  if (/(marché|market|bazaar|boutique)/.test(text)) {
    push("merchant", "Marchand", "stall-front");
    push("passerby", "Passant", "lane-depth");
  }
  if (/(prison|surveillance|checkpoint|guard|garde|palais|banque)/.test(text)) {
    push("guard", "Garde", "security-edge");
  }
  if (/(arène|arena|foule|crowd|festival)/.test(text)) push("crowd", "Foule", "backdrop-crowd");
  if (/(lycée|lycee|école|ecole|school|campus|cour de récré|cour du lycée|classe)/.test(text)) {
    push("crowd", "Foule (cour)", "student-yard");
    push("passerby", "Passant", "corridor-depth");
  }
  if (/(moque|ridicul|humili|entouré de ses amis|autour de ses amis|raillerie)/.test(text)) {
    push("crowd", "Foule (moqueurs)", "mocking-ring");
  }
  if (extras.length === 0 && scene.characters.length <= 2) {
    push("passerby", "Passant", "ambient-depth");
  }
  return extras.slice(0, 3);
}
