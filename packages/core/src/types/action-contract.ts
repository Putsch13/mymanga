/**
 * ActionContract — per-panel action policy.
 *
 * Derived from the parent `BeatNarrativeContract`, but scoped to a single
 * panel because a dialogue beat can still have one movement panel in the
 * middle of it (and vice versa).
 *
 * The contract is read by:
 *   - build-panel-contract (purpose + shot selection)
 *   - prompt-action-linter (blocks forbidden verbs before provider call)
 *   - narrative-truth-pass (hard stop for action envelope violations)
 */

import type { ActionEnvelope } from "./beat-narrative-contract";

export interface ActionContract {
  level: ActionEnvelope;
  /** Verbs the image is allowed to depict (informational; linter is verb-banlist driven). */
  allowedVerbs: string[];
  /** Verbs that must not appear in the effective prompt or panel composition. */
  forbiddenVerbs: string[];
  requiresImpactFX: boolean;
  allowsWeaponVisibility: boolean;
  allowsContactPose: boolean;
  allowsAttackTrajectory: boolean;
}

/**
 * Hard banlist used regardless of locale. Tokens are lowercased substrings;
 * the linter matches on word boundaries.
 */
export const COMBAT_VERB_BANLIST: readonly string[] = [
  "strike",
  "strikes",
  "striking",
  "punch",
  "punches",
  "punching",
  "kick",
  "kicks",
  "kicking",
  "slash",
  "slashes",
  "slashing",
  "stab",
  "stabs",
  "stabbing",
  "clash",
  "clashes",
  "clashing",
  "fight stance",
  "combat stance",
  "fighting stance",
  "guard stance",
  "impact burst",
  "riposte",
  "attack",
  "attacks",
  "attacking",
  "charge",
  "charges",
  "charging",
  "parry",
  "lunge",
  "lunges",
  "lunging",
  "sword swing",
  "blade swing",
  "weapon clash",
  "duel framing",
] as const;

export const CONTACT_VERB_BANLIST: readonly string[] = [
  "grab",
  "grabs",
  "push",
  "pushes",
  "shove",
  "shoves",
  "block",
  "blocks",
] as const;

const PRESETS: Record<ActionEnvelope, ActionContract> = {
  none: {
    level: "none",
    allowedVerbs: [
      "look",
      "glance",
      "stare",
      "pause",
      "turn",
      "lean",
      "hesitate",
      "speak",
      "listen",
      "smile",
      "frown",
    ],
    forbiddenVerbs: [...COMBAT_VERB_BANLIST, ...CONTACT_VERB_BANLIST],
    requiresImpactFX: false,
    allowsWeaponVisibility: false,
    allowsContactPose: false,
    allowsAttackTrajectory: false,
  },
  micro: {
    level: "micro",
    allowedVerbs: [
      "look",
      "glance",
      "pause",
      "turn",
      "lean",
      "hesitate",
      "tighten grip",
      "clench",
      "step back",
      "step forward",
    ],
    forbiddenVerbs: [...COMBAT_VERB_BANLIST],
    requiresImpactFX: false,
    allowsWeaponVisibility: true,
    allowsContactPose: false,
    allowsAttackTrajectory: false,
  },
  physical_nonviolent: {
    level: "physical_nonviolent",
    allowedVerbs: ["grab", "push", "block", "hold", "pull", "shove"],
    forbiddenVerbs: [...COMBAT_VERB_BANLIST],
    requiresImpactFX: false,
    allowsWeaponVisibility: false,
    allowsContactPose: true,
    allowsAttackTrajectory: false,
  },
  combat_light: {
    level: "combat_light",
    allowedVerbs: [
      "strike",
      "block",
      "dodge",
      "parry",
      "punch",
      "kick",
      "swing",
    ],
    forbiddenVerbs: [],
    requiresImpactFX: false,
    allowsWeaponVisibility: true,
    allowsContactPose: true,
    allowsAttackTrajectory: true,
  },
  combat_full: {
    level: "combat_full",
    allowedVerbs: [
      "strike",
      "slash",
      "stab",
      "punch",
      "kick",
      "clash",
      "charge",
      "lunge",
      "impact",
    ],
    forbiddenVerbs: [],
    requiresImpactFX: true,
    allowsWeaponVisibility: true,
    allowsContactPose: true,
    allowsAttackTrajectory: true,
  },
};

export function actionContractForEnvelope(
  envelope: ActionEnvelope,
): ActionContract {
  const preset = PRESETS[envelope];
  // Return a shallow clone so callers can safely extend without mutating presets.
  return {
    ...preset,
    allowedVerbs: [...preset.allowedVerbs],
    forbiddenVerbs: [...preset.forbiddenVerbs],
  };
}
