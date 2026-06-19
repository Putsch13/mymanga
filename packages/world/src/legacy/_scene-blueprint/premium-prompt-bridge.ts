import type { SceneBlueprintInput } from "../../types";

export interface PremiumPromptBridgeLines {
  requiredPropLine?: string;
  requiredEnemyLine?: string;
  speakerAnchorLine?: string;
  focusLine?: string;
  antiCollapseLine?: string;
  cutawayLine?: string;
}

const FOCUS_DESCRIPTIONS: Record<string, string> = {
  hero: "primary subject: hero character",
  enemy: "primary subject: enemy/adversary — do not center the hero",
  ally: "primary subject: ally character",
  npc: "primary subject: NPC / crowd presence",
  group: "primary subject: group interaction",
  environment: "primary subject: environment / location — this is an environment cutaway, not a character portrait",
  prop: "primary subject: prop/object insert — object must be legible and foreground",
  reaction: "primary subject: reaction shot — emotional expression is the focus",
  aftermath: "primary subject: aftermath — show consequences, not action",
};

const ANTI_COLLAPSE_BY_CUTAWAY: Record<string, string> = {
  environment: "do not collapse this into a hero portrait; this panel must show the environment",
  enemy: "do not center the hero; enemy must be the dominant subject",
  prop_insert: "do not replace the prop with generic background; object must be foreground and readable",
  reaction: "do not omit the emotional expression; reaction must be the panel's core",
  movement_trace: "do not freeze the action; movement and trajectory must be readable",
  crowd: "do not empty the background; crowd presence is mandatory",
  aftermath: "do not show active combat; show aftermath/consequences only",
};

const CUTAWAY_DESCRIPTIONS: Record<string, string> = {
  environment_establishing: "CUTAWAY: environment establishing shot — show the location, not the characters",
  enemy_reveal: "CUTAWAY: enemy reveal — show the adversary/threat, not the hero",
  object_insert: "CUTAWAY: object insert — show the prop/object in detail, foreground readable",
  reaction_insert: "CUTAWAY: reaction insert — show emotional expression/reaction, face readable",
  location_transition: "CUTAWAY: location transition — show the new location establishing",
  threat_insert: "CUTAWAY: threat insert — show the weapon/danger, not the character holding it",
  environment: "CUTAWAY: environment — show the environment, not a character portrait",
  enemy: "CUTAWAY: enemy — show the enemy/adversary as primary subject",
  prop_insert: "CUTAWAY: prop insert — show the object/prop as primary subject",
  reaction: "CUTAWAY: reaction — show the emotional reaction as primary subject",
  npc_group: "CUTAWAY: NPC group — show the crowd/group, not the protagonist",
  surveillance: "CUTAWAY: surveillance — show the watching/observing element",
  aftermath: "CUTAWAY: aftermath — show the consequences/damage, not the action",
};

export function buildPremiumPromptBridgeLines(input: SceneBlueprintInput): PremiumPromptBridgeLines {
  const contract = input.premiumContract;
  if (!contract) return {};

  const lines: PremiumPromptBridgeLines = {};

  if (contract.requiredPropNames && contract.requiredPropNames.length > 0) {
    const propList = contract.requiredPropNames.join(", ");
    lines.requiredPropLine = `REQUIRED PROPS (must be clearly visible): ${propList}. Do not omit or replace with generic clutter.`;
  }

  // Enemy presence hard constraint — uniquement si le panel cible réellement
  // l'ennemi, un groupe ou le héros. Sinon (cutaway environment/prop/reaction/
  // aftermath, ou focus NPC non-ennemi), cette ligne crée une contradiction
  // (CUTAWAY vs REQUIRED enemy) et force Flux à réinjecter un personnage en
  // foreground au lieu du décor/PNJ.
  if (contract.mustShowEnemy) {
    const focus = contract.subjectFocus;
    const enemyRelevant =
      !focus
      || focus === "hero"
      || focus === "enemy"
      || focus === "antagonist"
      || focus === "group";
    if (enemyRelevant) {
      lines.requiredEnemyLine =
        "REQUIRED: enemy/adversary must be clearly present and readable in this panel. Do not replace with hero portrait.";
    }
  }

  if (contract.speakerAnchorCharacterId && contract.dialogueCarrier === "speaker_visible") {
    lines.speakerAnchorLine = `REQUIRED: dialogue speaker must be visibly framed and face readable. Speaker ID: ${contract.speakerAnchorCharacterId}.`;
  } else if (contract.dialogueCarrier === "offscreen_allowed") {
    lines.speakerAnchorLine = "Speaker may be offscreen; dialogue bubble placement must be coherent.";
  }

  if (contract.subjectFocus) {
    lines.focusLine =
      FOCUS_DESCRIPTIONS[contract.subjectFocus] ?? `primary subject: ${contract.subjectFocus}`;
  }

  if (contract.cutawayType && contract.cutawayType !== "none") {
    const antiLine = ANTI_COLLAPSE_BY_CUTAWAY[contract.cutawayType];
    if (antiLine) {
      lines.antiCollapseLine = antiLine;
      if (contract.antiCollapseReason) {
        lines.antiCollapseLine += ` (reason: ${contract.antiCollapseReason})`;
      }
    }
  } else if (!contract.heroCenterAllowed) {
    lines.antiCollapseLine = "do not center the hero; this panel has a different primary subject";
  }

  if (contract.cutawayType && contract.cutawayType !== "none") {
    lines.cutawayLine =
      CUTAWAY_DESCRIPTIONS[contract.cutawayType]
      ?? `CUTAWAY: ${contract.cutawayType} — this is a cutaway panel, not a hero portrait`;
  }

  return lines;
}
