/**
 * P1.1 — Generation Intent Planner
 *
 * Avant de générer les 70 images d'un chapitre, ce module produit un plan
 * d'intention explicite pour chaque panel. Chaque `PanelGenerationIntent`
 * contient tout ce que le routing et le prompting doivent savoir pour
 * produire une image cohérente avec le type de panel.
 *
 * Entrées :
 *   - approved outline
 *   - chapter runtime (cast, continuity state)
 *   - shot plan (planned panels avec subjectFocus, cutawayType, etc.)
 *   - narrative facts (props, obligations)
 *   - cast canon (characters with tiers)
 *   - location canon (lieux avec signaux visuels)
 *
 * Sortie :
 *   - `PanelGenerationIntent[]` : une intention par panel, consommée par
 *     le routing, le prompt composer, et le reroll policy.
 */

import type { PropOwnerCategory } from "@manga-ai-studio/core";

// ────────────────────────────────────────────────────────────────────────────
// P1.2 — Taxonomie des panel intents
// ────────────────────────────────────────────────────────────────────────────

export type PanelIntentType =
  | "hero_portrait"
  | "hero_action"
  | "hero_duo"
  | "hero_reaction"
  | "npc_focus"
  | "enemy_focus"
  | "enemy_reveal"
  | "ally_focus"
  | "group_conflict"
  | "group_presence"
  | "guard_presence"
  | "crowd_cutaway"
  | "reaction_cutaway"
  | "prop_insert"
  | "environment_establishing"
  | "environment_transition"
  | "aftermath"
  | "symbolic_insert"
  | "magic_manifestation"
  | "dialogue_anchor";

export type DominantSubjectType =
  | "hero"
  | "enemy"
  | "ally"
  | "npc"
  | "group"
  | "guard_group"
  | "crowd"
  | "environment"
  | "prop"
  | "aftermath"
  | "duo";

export type FramingCategory =
  | "portrait"
  | "closeup"
  | "medium"
  | "wide"
  | "establishing"
  | "insert"
  | "over_shoulder"
  | "splash";

export type ReferencePolicyIntent = "STRONG" | "LIGHT" | "NONE";

// ────────────────────────────────────────────────────────────────────────────
// PanelGenerationIntent — Le contrat complet pour un panel
// ────────────────────────────────────────────────────────────────────────────

export interface PanelGenerationIntent {
  panelId: string;
  panelNumber: number;
  pageNumber: number;
  beatId: string;

  // Classification
  intentType: PanelIntentType;
  beatType: string;
  panelFunction: string;

  // Sujets
  dominantSubject: DominantSubjectType;
  secondarySubjects: DominantSubjectType[];
  cutawayType: string | null;

  // Cadrage
  cameraIntent: FramingCategory;
  compositionIntent: string;
  shotType: string;
  cameraAngle: string | null;

  // Priorités (0-100)
  environmentPriority: number;
  characterPriority: number;
  propPriority: number;
  crowdPriority: number;

  // Entités requises
  requiredVisibleEntities: RequiredEntity[];
  requiredVisibleProps: IntentRequiredProp[];
  requiredLocationSignals: string[];

  // Entités supprimées/en retrait
  suppressedEntities: SuppressedEntity[];
  suppressedPromptClauses: string[];

  // Policy de références
  allowedReferencePolicy: ReferencePolicyIntent;
  requiredReferenceSet: RequiredReferenceSet;

  // Interdictions
  forbiddenFraming: FramingCategory[];
  forbiddenPromptTokens: string[];

  // Hiérarchie visuelle explicite
  visualHierarchy: VisualHierarchyLayer;

  // Debug / traçabilité
  reason: string;
}

export interface RequiredEntity {
  entityType: "character" | "npc_group" | "crowd" | "creature";
  entityId?: string | null;
  label: string;
  role: "primary" | "secondary" | "background";
  mustBeReadable: boolean;
}

export interface IntentRequiredProp {
  canonicalName: string;
  ownerCategory: PropOwnerCategory;
  visibilityMode: string;
  mustBeVisible: boolean;
}

export interface SuppressedEntity {
  entityType: "character" | "framing" | "clause";
  label: string;
  reason: string;
}

export interface RequiredReferenceSet {
  characterRefs: boolean;
  sceneRefs: boolean;
  styleRefs: boolean;
  environmentRefs: boolean;
}

export interface VisualHierarchyLayer {
  foreground: string[];
  midground: string[];
  background: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// Input types
// ────────────────────────────────────────────────────────────────────────────

export interface GenerationIntentPlannerInput {
  chapterId: string;
  panels: PanelPlanInput[];
  castByCharacterId: Map<string, CharacterCastInfo>;
  heroCharacterId: string | null;
  locationCanon: Map<string, LocationCanonInfo>;
  narrativeFacts: NarrativeFactInput[];
}

export interface PanelPlanInput {
  panelId: string;
  panelNumber: number;
  pageNumber: number;
  beatId: string;
  beatType: string;
  subjectFocus: string | null;
  cutawayType: string | null;
  shotType: string;
  cameraAngle: string | null;
  purpose: string | null;
  caption: string;
  characterIds: string[];
  requiredProps: Array<{
    canonicalName: string;
    ownerCategory?: PropOwnerCategory;
    visibilityMode?: string;
    mustBeVisible?: boolean;
  }>;
  mustShowLocationSignals: string[];
  heroCenterAllowed: boolean;
  speakerAnchorCharacterId: string | null;
  npcGroupPresence: string[];
  creaturePresence: string[];
}

export interface CharacterCastInfo {
  characterId: string;
  name: string;
  role: string;
  importanceTier: string;
  isHero: boolean;
}

export interface LocationCanonInfo {
  locationName: string;
  mustShowSignals: string[];
  visualDescriptor: string | null;
}

export interface NarrativeFactInput {
  type: string;
  beatId: string;
  propCandidates?: string[];
  characterIds?: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// Planner implementation
// ────────────────────────────────────────────────────────────────────────────

const CUTAWAY_NON_HERO_TYPES = new Set([
  "environment",
  "environment_establishing",
  "location_transition",
  "prop_insert",
  "object_insert",
  "aftermath",
  "movement_trace",
  "reaction",
  "reaction_insert",
  "crowd",
  "npc_group",
  "surveillance",
  "threat_insert",
]);

const HERO_FORBIDDEN_FRAMING: FramingCategory[] = ["portrait", "closeup"];
const HERO_FORBIDDEN_TOKENS = [
  "hero panel",
  "manga hero panel",
  "protagonist centered",
  "main character foreground",
  "hero close-up",
  "face filling frame",
  "tight hero framing",
  "hero lock",
  "hero showcase",
];

function resolveIntentType(
  panel: PanelPlanInput,
  heroCharacterId: string | null,
  castMap: Map<string, CharacterCastInfo>,
): PanelIntentType {
  const { subjectFocus, cutawayType, characterIds, shotType, npcGroupPresence, creaturePresence } = panel;

  // Cutaways explicites
  if (cutawayType === "environment" || cutawayType === "environment_establishing") {
    return "environment_establishing";
  }
  if (cutawayType === "location_transition") return "environment_transition";
  if (cutawayType === "prop_insert" || cutawayType === "object_insert") return "prop_insert";
  if (cutawayType === "aftermath" || cutawayType === "movement_trace") return "aftermath";
  if (cutawayType === "reaction" || cutawayType === "reaction_insert") return "reaction_cutaway";
  if (cutawayType === "crowd") return "crowd_cutaway";
  if (cutawayType === "npc_group" || cutawayType === "surveillance") return "guard_presence";
  if (cutawayType === "enemy" || cutawayType === "enemy_reveal") return "enemy_reveal";

  // subjectFocus explicite
  if (subjectFocus === "environment" || subjectFocus === "aftermath") return "environment_establishing";
  if (subjectFocus === "prop") return "prop_insert";
  if (subjectFocus === "reaction") return "reaction_cutaway";
  if (subjectFocus === "enemy" || subjectFocus === "antagonist") {
    return shotType === "closeup" || shotType === "extreme_closeup" ? "enemy_focus" : "enemy_reveal";
  }
  if (subjectFocus === "npc" || subjectFocus === "important_npc") return "npc_focus";
  if (subjectFocus === "group") {
    if (npcGroupPresence.length > 0 || /guard|soldier|patrol/i.test(panel.caption)) {
      return "guard_presence";
    }
    return "group_presence";
  }

  // Déduction depuis le cast
  const heroInCast = heroCharacterId && characterIds.includes(heroCharacterId);
  const nonHeroCount = characterIds.filter((id) => id !== heroCharacterId).length;

  if (subjectFocus === "hero" || (heroInCast && characterIds.length === 1)) {
    if (shotType === "closeup" || shotType === "extreme_closeup") return "hero_portrait";
    if (/action|combat|fight/i.test(panel.beatType)) return "hero_action";
    return "hero_portrait";
  }

  if (heroInCast && nonHeroCount === 1) {
    const otherId = characterIds.find((id) => id !== heroCharacterId);
    const otherChar = otherId ? castMap.get(otherId) : null;
    if (otherChar?.role === "antagonist") return "hero_duo"; // vs enemy
    if (otherChar?.role === "ally" || otherChar?.role === "deuteragonist") return "hero_duo";
    return "hero_duo";
  }

  if (heroInCast && nonHeroCount > 1) return "group_conflict";

  // Pas de héros
  if (characterIds.length === 1) {
    const char = castMap.get(characterIds[0]!);
    if (char?.role === "antagonist") return "enemy_focus";
    return "npc_focus";
  }

  if (characterIds.length > 1) return "group_presence";

  // Aucun personnage
  if (npcGroupPresence.length > 0) return "guard_presence";
  if (creaturePresence.length > 0) return "crowd_cutaway";

  return "environment_establishing";
}

function resolveDominantSubject(
  intentType: PanelIntentType,
  panel: PanelPlanInput,
): DominantSubjectType {
  switch (intentType) {
    case "hero_portrait":
    case "hero_action":
    case "hero_reaction":
      return "hero";
    case "hero_duo":
      return "duo";
    case "enemy_focus":
    case "enemy_reveal":
      return "enemy";
    case "ally_focus":
      return "ally";
    case "npc_focus":
    case "dialogue_anchor":
      return "npc";
    case "group_conflict":
    case "group_presence":
      return "group";
    case "guard_presence":
      return "guard_group";
    case "crowd_cutaway":
      return "crowd";
    case "prop_insert":
    case "symbolic_insert":
    case "magic_manifestation":
      return "prop";
    case "aftermath":
      return "aftermath";
    case "environment_establishing":
    case "environment_transition":
      return "environment";
    case "reaction_cutaway":
      return panel.heroCenterAllowed ? "hero" : "npc";
    default:
      return "environment";
  }
}

function resolveFramingCategory(
  intentType: PanelIntentType,
  shotType: string,
): FramingCategory {
  if (intentType === "prop_insert" || intentType === "symbolic_insert") return "insert";
  if (intentType === "environment_establishing") return "establishing";
  if (intentType === "environment_transition") return "wide";

  switch (shotType) {
    case "extreme_closeup":
    case "closeup":
      return "closeup";
    case "wide":
      return "wide";
    case "over_shoulder":
      return "over_shoulder";
    default:
      return "medium";
  }
}

function computePriorities(
  intentType: PanelIntentType,
  dominantSubject: DominantSubjectType,
): { env: number; char: number; prop: number; crowd: number } {
  switch (dominantSubject) {
    case "environment":
      return { env: 90, char: 10, prop: 20, crowd: 30 };
    case "prop":
      return { env: 20, char: 20, prop: 95, crowd: 10 };
    case "aftermath":
      return { env: 70, char: 10, prop: 50, crowd: 20 };
    case "crowd":
    case "guard_group":
      return { env: 40, char: 30, prop: 20, crowd: 85 };
    case "group":
      return { env: 35, char: 70, prop: 25, crowd: 50 };
    case "duo":
      return { env: 30, char: 80, prop: 25, crowd: 20 };
    case "hero":
    case "enemy":
    case "ally":
    case "npc":
      return { env: 25, char: 90, prop: 30, crowd: 15 };
    default:
      return { env: 50, char: 50, prop: 50, crowd: 50 };
  }
}

function buildForbiddenFraming(
  intentType: PanelIntentType,
  dominantSubject: DominantSubjectType,
): FramingCategory[] {
  const forbidden: FramingCategory[] = [];

  if (dominantSubject === "environment" || dominantSubject === "aftermath") {
    forbidden.push("portrait", "closeup");
  }
  if (dominantSubject === "prop") {
    forbidden.push("portrait");
  }
  if (dominantSubject === "crowd" || dominantSubject === "guard_group") {
    forbidden.push("portrait");
  }

  return forbidden;
}

function buildForbiddenTokens(
  intentType: PanelIntentType,
  dominantSubject: DominantSubjectType,
): string[] {
  if (
    dominantSubject === "environment"
    || dominantSubject === "prop"
    || dominantSubject === "aftermath"
    || dominantSubject === "crowd"
    || dominantSubject === "guard_group"
    || dominantSubject === "group"
  ) {
    return [...HERO_FORBIDDEN_TOKENS];
  }
  return [];
}

function resolveReferencePolicy(
  intentType: PanelIntentType,
  dominantSubject: DominantSubjectType,
): ReferencePolicyIntent {
  if (dominantSubject === "hero" || intentType === "hero_portrait" || intentType === "hero_action") {
    return "STRONG";
  }
  if (dominantSubject === "duo" || dominantSubject === "group") {
    return "LIGHT";
  }
  if (dominantSubject === "environment" || dominantSubject === "prop" || dominantSubject === "aftermath") {
    return "NONE";
  }
  return "LIGHT";
}

function buildRequiredReferenceSet(
  intentType: PanelIntentType,
  dominantSubject: DominantSubjectType,
): RequiredReferenceSet {
  const base: RequiredReferenceSet = {
    characterRefs: false,
    sceneRefs: false,
    styleRefs: true,
    environmentRefs: false,
  };

  if (dominantSubject === "hero" || dominantSubject === "duo" || dominantSubject === "enemy" || dominantSubject === "ally") {
    base.characterRefs = true;
  }
  if (dominantSubject === "environment" || dominantSubject === "aftermath") {
    base.environmentRefs = true;
    base.sceneRefs = true;
  }
  if (intentType === "environment_establishing" || intentType === "environment_transition") {
    base.sceneRefs = true;
    base.environmentRefs = true;
  }

  return base;
}

function buildVisualHierarchy(
  intentType: PanelIntentType,
  dominantSubject: DominantSubjectType,
  panel: PanelPlanInput,
  heroCharacterId: string | null,
  castMap: Map<string, CharacterCastInfo>,
): VisualHierarchyLayer {
  const hierarchy: VisualHierarchyLayer = {
    foreground: [],
    midground: [],
    background: [],
  };

  switch (dominantSubject) {
    case "environment":
      hierarchy.foreground.push("architectural elements", "environmental details");
      hierarchy.midground.push("ambient layered background");
      hierarchy.background.push("distant setting cues");
      if (panel.characterIds.length > 0) {
        hierarchy.background.push("silhouettes only, not centered");
      }
      break;
    case "prop":
      hierarchy.foreground.push("key object/prop, fully legible and centered");
      hierarchy.midground.push("minimal context");
      hierarchy.background.push("subdued environment");
      break;
    case "aftermath":
      hierarchy.foreground.push("debris, consequence markers");
      hierarchy.midground.push("altered environment");
      hierarchy.background.push("residual atmosphere");
      break;
    case "crowd":
    case "guard_group":
      hierarchy.foreground.push("guards/crowd as primary subjects");
      hierarchy.midground.push("environment context");
      if (heroCharacterId && panel.characterIds.includes(heroCharacterId)) {
        hierarchy.background.push("hero as small silhouette only");
      }
      break;
    case "duo":
      const heroName = heroCharacterId ? castMap.get(heroCharacterId)?.name ?? "hero" : "hero";
      const otherIds = panel.characterIds.filter((id) => id !== heroCharacterId);
      const otherNames = otherIds.map((id) => castMap.get(id)?.name ?? "ally").join(", ");
      hierarchy.foreground.push(`${heroName} and ${otherNames}, both readable`);
      hierarchy.midground.push("environment context");
      hierarchy.background.push("setting details");
      break;
    case "hero":
      hierarchy.foreground.push("protagonist centered and readable");
      hierarchy.midground.push("supporting environment");
      hierarchy.background.push("setting details");
      break;
    default:
      hierarchy.foreground.push("primary subject");
      hierarchy.midground.push("context");
      hierarchy.background.push("environment");
  }

  return hierarchy;
}

function buildSuppressedEntities(
  intentType: PanelIntentType,
  dominantSubject: DominantSubjectType,
  panel: PanelPlanInput,
  heroCharacterId: string | null,
): SuppressedEntity[] {
  const suppressed: SuppressedEntity[] = [];

  if (
    dominantSubject === "environment"
    || dominantSubject === "prop"
    || dominantSubject === "aftermath"
    || dominantSubject === "crowd"
    || dominantSubject === "guard_group"
  ) {
    if (heroCharacterId && panel.characterIds.includes(heroCharacterId)) {
      suppressed.push({
        entityType: "character",
        label: "hero",
        reason: "cutaway_panel_hero_should_be_background_only",
      });
    }
    suppressed.push({
      entityType: "framing",
      label: "hero portrait framing",
      reason: "cutaway_forbids_hero_centric_composition",
    });
    suppressed.push({
      entityType: "clause",
      label: "Subject lock: [hero]",
      reason: "cutaway_should_not_lock_on_hero",
    });
  }

  return suppressed;
}

export function buildPanelGenerationIntent(
  panel: PanelPlanInput,
  heroCharacterId: string | null,
  castMap: Map<string, CharacterCastInfo>,
  locationCanon: Map<string, LocationCanonInfo>,
): PanelGenerationIntent {
  const intentType = resolveIntentType(panel, heroCharacterId, castMap);
  const dominantSubject = resolveDominantSubject(intentType, panel);
  const cameraIntent = resolveFramingCategory(intentType, panel.shotType);
  const priorities = computePriorities(intentType, dominantSubject);

  const requiredEntities: RequiredEntity[] = panel.characterIds.map((id) => {
    const char = castMap.get(id);
    const isHero = id === heroCharacterId;
    const isPrimary = (dominantSubject === "hero" && isHero)
      || (dominantSubject === "enemy" && char?.role === "antagonist")
      || (dominantSubject === "npc" && !isHero);
    return {
      entityType: "character" as const,
      entityId: id,
      label: char?.name ?? "unknown",
      role: isPrimary ? "primary" as const : "secondary" as const,
      mustBeReadable: isPrimary,
    };
  });

  if (panel.npcGroupPresence.length > 0) {
    requiredEntities.push({
      entityType: "npc_group",
      entityId: null,
      label: panel.npcGroupPresence.join(", "),
      role: dominantSubject === "guard_group" ? "primary" : "secondary",
      mustBeReadable: dominantSubject === "guard_group",
    });
  }

  const requiredProps: IntentRequiredProp[] = panel.requiredProps.map((p) => ({
    canonicalName: p.canonicalName,
    ownerCategory: p.ownerCategory ?? "unassigned",
    visibilityMode: p.visibilityMode ?? "in_hand",
    mustBeVisible: p.mustBeVisible ?? true,
  }));

  const secondarySubjects: DominantSubjectType[] = [];
  if (dominantSubject !== "environment" && priorities.env > 30) secondarySubjects.push("environment");
  if (dominantSubject !== "crowd" && priorities.crowd > 40) secondarySubjects.push("crowd");
  if (dominantSubject !== "prop" && priorities.prop > 40) secondarySubjects.push("prop");

  return {
    panelId: panel.panelId,
    panelNumber: panel.panelNumber,
    pageNumber: panel.pageNumber,
    beatId: panel.beatId,
    intentType,
    beatType: panel.beatType,
    panelFunction: panel.purpose ?? intentType,
    dominantSubject,
    secondarySubjects,
    cutawayType: panel.cutawayType,
    cameraIntent,
    compositionIntent: `${cameraIntent} shot focused on ${dominantSubject}`,
    shotType: panel.shotType,
    cameraAngle: panel.cameraAngle,
    environmentPriority: priorities.env,
    characterPriority: priorities.char,
    propPriority: priorities.prop,
    crowdPriority: priorities.crowd,
    requiredVisibleEntities: requiredEntities,
    requiredVisibleProps: requiredProps,
    requiredLocationSignals: panel.mustShowLocationSignals,
    suppressedEntities: buildSuppressedEntities(intentType, dominantSubject, panel, heroCharacterId),
    suppressedPromptClauses: dominantSubject !== "hero" ? ["Subject lock: [hero]", "hero foreground"] : [],
    allowedReferencePolicy: resolveReferencePolicy(intentType, dominantSubject),
    requiredReferenceSet: buildRequiredReferenceSet(intentType, dominantSubject),
    forbiddenFraming: buildForbiddenFraming(intentType, dominantSubject),
    forbiddenPromptTokens: buildForbiddenTokens(intentType, dominantSubject),
    visualHierarchy: buildVisualHierarchy(intentType, dominantSubject, panel, heroCharacterId, castMap),
    reason: `intentType=${intentType} dominant=${dominantSubject} shotType=${panel.shotType}`,
  };
}

export function planChapterGenerationIntents(
  input: GenerationIntentPlannerInput,
): PanelGenerationIntent[] {
  return input.panels.map((panel) =>
    buildPanelGenerationIntent(
      panel,
      input.heroCharacterId,
      input.castByCharacterId,
      input.locationCanon,
    ),
  );
}
