import type {
  CutawayType,
  PanelBlueprintPremium,
  SubjectFocus,
} from "@manga-ai-studio/core";

import { isConflictHeavyBeatPanel } from "../premium-manga-cutaway";
import {
  pickPrimaryActorForBeat,
  pickRequiredOpponentForBeat,
  subjectFocusForVisualEntity,
  type VisualEntity,
} from "../visual-entity-registry";
import {
  buildEntityActionLine,
  resolveBlueprintReferencePolicyForEntity,
  resolveRenderModeForEntity,
} from "../visual-entity-prompt";

import { isDialogueHeavyBeat } from "./critical-classification";

function resolveSubjectFocusForEntity(entity: VisualEntity): SubjectFocus {
  if (entity.isOpponent) return "enemy";
  if (entity.role === "protagonist") return "hero";
  if (entity.canAppearAsGroup) return "group";
  return "npc";
}

export function convertPanelToEntityDrivenPanel(
  bp: PanelBlueprintPremium,
  entity: VisualEntity,
  options: { reason: string },
): void {
  if (
    entity.consistencyLevel === "strict"
    && entity.referenceImageUrls.length === 0
  ) {
    throw new Error(`required_entity_missing_model_sheet entity=${entity.id}`);
  }

  bp.cutawayType = "none" as CutawayType;
  bp.rebalancedFromCutaway = true;
  bp.subjectFocus = resolveSubjectFocusForEntity(entity);
  bp.mangaPanelFunction = entity.isOpponent ? "opponent_pressure" : "entity_action";
  bp.renderMode = resolveRenderModeForEntity(entity);
  bp.mustShowEnemy = entity.isOpponent;

  const merged = new Set<string>([
    ...(bp.requiredEntityIds ?? []),
    ...(bp.mustShowCharacterIds ?? []),
    entity.id,
  ]);
  bp.requiredEntityIds = [...merged];
  bp.mustShowCharacterIds = [...merged];
  bp.requiredCharacters = [...merged];

  bp.shotType = bp.shotType === "wide" ? "medium" : bp.shotType || "medium";
  bp.cameraAngle = entity.isOpponent
    ? bp.cameraAngle || "low"
    : bp.cameraAngle || "eye_level";

  bp.purpose = buildEntityActionLine(bp, entity);
  bp.referencePolicy = resolveBlueprintReferencePolicyForEntity(entity);

  bp.notes = [
    ...(bp.notes ?? []),
    options.reason,
    `entity_driven:${entity.id}`,
  ];
}

export function buildActorDrivenReplacement(
  bp: PanelBlueprintPremium,
  entities: VisualEntity[],
  fallbackHeroId: string | null,
): Partial<PanelBlueprintPremium> {
  const primary = pickPrimaryActorForBeat(bp.beatId, entities, fallbackHeroId);
  const opponent = pickRequiredOpponentForBeat({
    beatId: bp.beatId,
    visualEntities: entities,
  });

  if (isDialogueHeavyBeat(bp) && primary) {
    return {
      purpose: "dialogue reaction — visible emotional beat",
      shotType: "medium_close",
      cameraAngle: "eye_level",
      subjectFocus: "speaker",
      secondaryFocus: "hero",
      cutawayType: "none" as CutawayType,
      dialogueCarrier: "speaker_visible",
      heroCenterAllowed: true,
      mustShowCharacterIds: [
        ...(bp.mustShowCharacterIds ?? []),
        primary.id,
      ].filter((id, i, a) => a.indexOf(id) === i),
      requiredCharacters: [primary.id],
    };
  }

  if (isConflictHeavyBeatPanel(bp) && opponent) {
    const sf = subjectFocusForVisualEntity(opponent);
    return {
      purpose: `${opponent.name} — visible pressure / conflict beat`,
      shotType: "medium",
      cameraAngle: "low",
      subjectFocus: sf,
      cutawayType: "none" as CutawayType,
      mustShowEnemy: opponent.isOpponent,
      mustShowCharacterIds: primary
        ? [primary.id, opponent.id].filter((id, i, a) => a.indexOf(id) === i)
        : [opponent.id],
      requiredCharacters: primary ? [primary.id, opponent.id] : [opponent.id],
      requiredEntityIds: [
        ...new Set([...(bp.requiredEntityIds ?? []), opponent.id]),
      ],
      heroCenterAllowed: sf === "hero",
    };
  }

  if (primary) {
    const sf: SubjectFocus = primary.role === "protagonist" ? "hero" : "npc";
    const basePurpose = String(bp.purpose ?? "").trim() || `${primary.name} action beat`;
    return {
      purpose: basePurpose,
      shotType: "medium",
      cameraAngle: "eye_level",
      subjectFocus: sf,
      cutawayType: "none" as CutawayType,
      mustShowCharacterIds: [primary.id],
      requiredCharacters: [primary.id],
      requiredEntityIds: [
        ...new Set([...(bp.requiredEntityIds ?? []), primary.id]),
      ],
      heroCenterAllowed: sf === "hero",
    };
  }

  const basePurpose = String(bp.purpose ?? "").trim() || "ensemble story beat";
  return {
    purpose: basePurpose,
    shotType: "medium",
    cameraAngle: "eye_level",
    subjectFocus: "group",
    cutawayType: "none" as CutawayType,
    heroCenterAllowed: false,
  };
}

const GENERIC_PURPOSE_PATTERNS = [
  "character advances the scene",
  "visible action or emotion",
  "group tension — character-driven story beat",
];

function rewritePurposeWithVisibleActor(bp: PanelBlueprintPremium): string {
  let base = String(bp.purpose ?? "").trim();

  for (const pattern of GENERIC_PURPOSE_PATTERNS) {
    if (base.toLowerCase().includes(pattern.toLowerCase())) {
      base = base
        .replace(new RegExp(pattern, "gi"), "")
        .trim()
        .replace(/^[\s—-]+|[\s—-]+$/g, "")
        .trim();
    }
  }

  if (!base || base.length < 3) {
    base = bp.beatId ? `beat ${bp.beatId} action` : "story progression";
  }

  const propNames = (bp.requiredProps ?? [])
    .filter((p) => p.mustBeVisible !== false)
    .map((p) => p.canonicalName)
    .filter(Boolean);

  const propLine = propNames.length > 0
    ? ` Key props visible in the same frame: ${propNames.join(", ")}.`
    : "";

  const loc = (bp.requiredLocationSignals ?? []).filter(Boolean).join(", ");

  if (isConflictHeavyBeatPanel(bp)) {
    return [
      "Conflict panel:",
      base,
      loc ? `Location context: ${loc}.` : "",
      "Show a concrete combat or threat action, not a static portrait.",
      propLine,
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (isDialogueHeavyBeat(bp)) {
    return [
      "Dialogue panel:",
      base,
      "Show speaker/listener geometry, facial emotion, and readable body language.",
      propLine,
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [
    "Story action panel:",
    base,
    loc ? `Location context: ${loc}.` : "",
    "Show a concrete action, reaction, or decision connected to this beat.",
    propLine,
  ]
    .filter(Boolean)
    .join(" ");
}

export function convertCutawayToActorDrivenPanel(
  bp: PanelBlueprintPremium,
  entities: VisualEntity[],
  fallbackHeroId: string | null,
  _orderMap: Map<string, number>,
): void {
  const opponent = pickRequiredOpponentForBeat({
    beatId: bp.beatId,
    visualEntities: entities,
  });

  if (isConflictHeavyBeatPanel(bp) && opponent) {
    convertPanelToEntityDrivenPanel(bp, opponent, {
      reason: "cutaway_rebalanced_to_actor_driven_panel",
    });
    return;
  }

  const replacement = buildActorDrivenReplacement(bp, entities, fallbackHeroId);
  Object.assign(bp, replacement);
  bp.cutawayType = "none" as CutawayType;

  if (bp.shotType === "wide") bp.shotType = "medium";
  if (!bp.cameraAngle) bp.cameraAngle = "eye_level";

  bp.purpose = rewritePurposeWithVisibleActor(bp);

  bp.notes = [...(bp.notes ?? []), "cutaway_rebalanced_to_actor_driven_panel"];
}
