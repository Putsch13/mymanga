/**
 * BeatNarrativeContract — Phase 1 source of narrative truth.
 *
 * The existing page-role vocabulary (`establishing`, `confrontation`,
 * `cliffhanger`, …) collapses two orthogonal things into one string:
 *   1. what the beat is *for* narratively (setup, discovery, revelation…),
 *   2. how much physical action the beat is allowed to contain.
 *
 * This causes the pipeline to read `confrontation` and then infer a combat
 * shot plan even when the underlying beat is a verbal showdown. The
 * BeatNarrativeContract makes both dimensions explicit and forbids
 * downstream passes from inventing action that wasn't approved.
 */

export type StoryFunction =
  | "setup"
  | "discovery"
  | "dialogue_tension"
  | "investigation"
  | "movement"
  | "revelation"
  | "aftermath"
  | "decision"
  | "transition";

/**
 * Envelope of physical action the beat is allowed to visualise.
 *
 * - `none`: strictly no combat motion, no impact FX, no weapon swing.
 *   Posture + facial tension only.
 * - `micro`: hesitation, grip tightening, a hand on the hilt — never a blow.
 * - `physical_nonviolent`: pushing, grabbing, blocking. No strikes, no blades.
 * - `combat_light`: one-sided or brief exchange, no sustained choreography.
 * - `combat_full`: full fight beat; everything is on the table.
 */
export type ActionEnvelope =
  | "none"
  | "micro"
  | "physical_nonviolent"
  | "combat_light"
  | "combat_full";

/**
 * How much the visual layer is allowed to dramatise the beat.
 *
 * - `forbid_invented_action`: the image may not add anything the beat didn't
 *   explicitly describe. Safe default for dialogue / revelation / aftermath.
 * - `allow_literal_only`: the image may only depict events named in the beat.
 * - `allow_stylized_intensification`: the image may stylise the intensity
 *   (speed lines, dramatic angle) but may not change *what* is happening.
 */
export type VisualEscalationPolicy =
  | "forbid_invented_action"
  | "allow_literal_only"
  | "allow_stylized_intensification";

export interface BeatNarrativeContract {
  beatId: string;
  summary: string;
  storyFunction: StoryFunction;
  actionEnvelope: ActionEnvelope;
  visualEscalationPolicy: VisualEscalationPolicy;
  /** Story events that must exist *before* this beat runs (soft preconditions). */
  causalInputs: string[];
  /** Story events this beat produces (read downstream to chain truth). */
  causalOutputs: string[];
  /** Events the image MUST NOT depict (e.g. "weapon clash" on a dialogue beat). */
  forbiddenVisualEvents: string[];
  /** Events the image MUST depict (keeps pipeline honest about beat content). */
  requiredVisualEvents: string[];
}

export const DEFAULT_ACTION_ENVELOPE_FOR_FUNCTION: Record<
  StoryFunction,
  ActionEnvelope
> = {
  setup: "none",
  discovery: "micro",
  dialogue_tension: "none",
  investigation: "micro",
  movement: "physical_nonviolent",
  revelation: "micro",
  aftermath: "none",
  decision: "none",
  transition: "none",
};

export const DEFAULT_ESCALATION_POLICY_FOR_FUNCTION: Record<
  StoryFunction,
  VisualEscalationPolicy
> = {
  setup: "forbid_invented_action",
  discovery: "allow_literal_only",
  dialogue_tension: "forbid_invented_action",
  investigation: "allow_literal_only",
  movement: "allow_literal_only",
  revelation: "allow_stylized_intensification",
  aftermath: "forbid_invented_action",
  decision: "forbid_invented_action",
  transition: "forbid_invented_action",
};

/**
 * Derives a BeatNarrativeContract from a legacy page-role + optional hints.
 * This is the bridge used during rollout: outlines produced before the
 * contract existed still flow through the pipeline safely, but no
 * downstream consumer reads `pageRole` directly anymore.
 */
export function beatContractFromLegacyRole(input: {
  beatId: string;
  summary: string;
  legacyPageRole: string;
  explicitCombat?: boolean;
}): BeatNarrativeContract {
  const storyFunction = mapLegacyPageRoleToStoryFunction(input.legacyPageRole);
  const baseEnvelope = DEFAULT_ACTION_ENVELOPE_FOR_FUNCTION[storyFunction];
  const envelope: ActionEnvelope = input.explicitCombat
    ? "combat_full"
    : baseEnvelope;
  return {
    beatId: input.beatId,
    summary: input.summary,
    storyFunction,
    actionEnvelope: envelope,
    visualEscalationPolicy:
      DEFAULT_ESCALATION_POLICY_FOR_FUNCTION[storyFunction],
    causalInputs: [],
    causalOutputs: [],
    forbiddenVisualEvents: [],
    requiredVisualEvents: [],
  };
}

/**
 * Maps the old `pageRole` values to the new `storyFunction`. Deliberately
 * conservative: `confrontation` maps to `dialogue_tension` rather than any
 * combat flavour — callers who want actual combat must set
 * `explicitCombat: true` or build the contract manually. This removes the
 * silent promotion to `ACTION_PATTERN` that produced invented fights.
 */
export function mapLegacyPageRoleToStoryFunction(
  pageRole: string,
): StoryFunction {
  switch (pageRole) {
    case "establishing":
      return "setup";
    case "escalation":
      return "dialogue_tension";
    case "confrontation":
      return "dialogue_tension";
    case "revelation":
      return "revelation";
    case "aftermath":
      return "aftermath";
    case "cliffhanger":
      return "revelation";
    case "dialogue":
      return "dialogue_tension";
    case "action":
      return "movement";
    case "transition":
      return "transition";
    default:
      return "dialogue_tension";
  }
}
