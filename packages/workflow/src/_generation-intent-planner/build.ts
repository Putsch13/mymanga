import { resolveDominantSubject } from "./dominant-subject";
import { buildForbiddenFraming, buildForbiddenTokens } from "./forbidden";
import { resolveFramingCategory } from "./framing";
import { buildSuppressedEntities, buildVisualHierarchy } from "./hierarchy";
import { resolveIntentType } from "./intent-resolution";
import { computePriorities } from "./priorities";
import { buildRequiredReferenceSet, resolveReferencePolicy } from "./references";
import type {
  CharacterCastInfo,
  DominantSubjectType,
  GenerationIntentPlannerInput,
  IntentRequiredProp,
  LocationCanonInfo,
  PanelGenerationIntent,
  PanelPlanInput,
  RequiredEntity,
} from "./types";

export function buildPanelGenerationIntent(
  panel: PanelPlanInput,
  heroCharacterId: string | null,
  castMap: Map<string, CharacterCastInfo>,
  _locationCanon: Map<string, LocationCanonInfo>,
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
      role: isPrimary ? ("primary" as const) : ("secondary" as const),
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
