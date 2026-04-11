export interface CombatPanelDirectionInput {
  beatText: string;
  scenePurpose?: string | null;
  currentShotType?: string | null;
  momentum?: number;
  characterCount?: number;
}

export type CombatPreset =
  | "combat_clash"
  | "combat_aftermath"
  | "rage_closeup"
  | "dialogue_tension"
  | "establishing_location"
  | "crowd_reaction"
  | "hero_entry_panel"
  | "fast_exchange"
  | "heavy_strike"
  | "feint_and_counter"
  | "arena_shockwave"
  | "brutal_finisher"
  | "post_impact_silence";

export interface CombatPanelDirection {
  preset: CombatPreset;
  shotType: "wide" | "medium" | "closeup" | "extreme_closeup" | "over_shoulder";
  framing: string;
  impactCue: string;
  environmentReaction: string;
  momentum: number;
  impactClarity: "low" | "medium" | "high" | "extreme";
  recoveryBeat: string | null;
  actionReadabilityScore: number;
  crowdReactionHint: string | null;
  environmentDestructionLevel: "none" | "minor" | "moderate" | "major";
}

type PresetDefinition = Omit<CombatPanelDirection, "preset">;

const PRESET_DEFINITIONS: Record<CombatPreset, PresetDefinition> = {
  combat_clash: {
    shotType: "wide",
    framing: "full clash readability with both fighters and space",
    impactCue: "clear movement arc and impact burst",
    environmentReaction: "ground or props react to the collision",
    momentum: 70,
    impactClarity: "high",
    recoveryBeat: "brief pause before next exchange",
    actionReadabilityScore: 80,
    crowdReactionHint: null,
    environmentDestructionLevel: "minor",
  },
  combat_aftermath: {
    shotType: "wide",
    framing: "show damage aftermath and spatial consequence",
    impactCue: "dust settling and broken stance",
    environmentReaction: "visible damage and altered environment",
    momentum: 20,
    impactClarity: "medium",
    recoveryBeat: "character assessing damage",
    actionReadabilityScore: 65,
    crowdReactionHint: "crowd stunned or silent",
    environmentDestructionLevel: "moderate",
  },
  rage_closeup: {
    shotType: "closeup",
    framing: "tight face and upper torso emphasis",
    impactCue: "explosive emotion and sharp ink lines",
    environmentReaction: "background reacts with speed lines and debris",
    momentum: 90,
    impactClarity: "extreme",
    recoveryBeat: null,
    actionReadabilityScore: 75,
    crowdReactionHint: "crowd recoils or cheers",
    environmentDestructionLevel: "minor",
  },
  dialogue_tension: {
    shotType: "medium",
    framing: "two characters facing each other, tension in posture",
    impactCue: "verbal impact, sharp eye contact",
    environmentReaction: "static environment, focus on characters",
    momentum: 40,
    impactClarity: "medium",
    recoveryBeat: "character reaction shot",
    actionReadabilityScore: 70,
    crowdReactionHint: null,
    environmentDestructionLevel: "none",
  },
  establishing_location: {
    shotType: "wide",
    framing: "arena or battlefield establishing shot",
    impactCue: "scale and stakes revealed",
    environmentReaction: "environment defines the combat context",
    momentum: 30,
    impactClarity: "low",
    recoveryBeat: null,
    actionReadabilityScore: 60,
    crowdReactionHint: "crowd visible in background",
    environmentDestructionLevel: "none",
  },
  crowd_reaction: {
    shotType: "wide",
    framing: "fighters foreground, crowd readable in background",
    impactCue: "social shockwave around the action",
    environmentReaction: "spectator movement and arena reaction",
    momentum: 55,
    impactClarity: "medium",
    recoveryBeat: "return to fighters",
    actionReadabilityScore: 72,
    crowdReactionHint: "crowd gasps, cheers, or panics",
    environmentDestructionLevel: "none",
  },
  hero_entry_panel: {
    shotType: "medium",
    framing: "hero dominant in frame with environment reveal",
    impactCue: "momentum and silhouette entrance",
    environmentReaction: "wind, cloth and crowd reacting to arrival",
    momentum: 80,
    impactClarity: "high",
    recoveryBeat: null,
    actionReadabilityScore: 85,
    crowdReactionHint: "crowd reacts to hero presence",
    environmentDestructionLevel: "none",
  },
  fast_exchange: {
    shotType: "medium",
    framing: "rapid back-and-forth framing, minimal backgrounds",
    impactCue: "speed lines, blur trails, multiple impact marks",
    environmentReaction: "environment barely registers, focus on speed",
    momentum: 95,
    impactClarity: "high",
    recoveryBeat: "brief breath panel after exchange",
    actionReadabilityScore: 88,
    crowdReactionHint: null,
    environmentDestructionLevel: "minor",
  },
  heavy_strike: {
    shotType: "wide",
    framing: "full body impact, ground deformation visible",
    impactCue: "shockwave, crater, debris cloud",
    environmentReaction: "ground cracks, nearby objects destroyed",
    momentum: 85,
    impactClarity: "extreme",
    recoveryBeat: "aftermath panel showing scale of damage",
    actionReadabilityScore: 90,
    crowdReactionHint: "crowd thrown back or shielding",
    environmentDestructionLevel: "major",
  },
  feint_and_counter: {
    shotType: "medium",
    framing: "attacker overextended, defender pivoting",
    impactCue: "reversal moment frozen in time",
    environmentReaction: "minimal, focus on the pivot",
    momentum: 75,
    impactClarity: "high",
    recoveryBeat: "attacker's surprise reaction",
    actionReadabilityScore: 85,
    crowdReactionHint: "crowd surprised by reversal",
    environmentDestructionLevel: "none",
  },
  arena_shockwave: {
    shotType: "wide",
    framing: "full arena visible, shockwave radiating from center",
    impactCue: "concentric rings of force, dust and debris",
    environmentReaction: "arena structure damaged, crowd pushed back",
    momentum: 88,
    impactClarity: "extreme",
    recoveryBeat: "silence panel before next move",
    actionReadabilityScore: 92,
    crowdReactionHint: "entire crowd reacting simultaneously",
    environmentDestructionLevel: "major",
  },
  brutal_finisher: {
    shotType: "closeup",
    framing: "decisive blow close-up, loser's expression visible",
    impactCue: "final impact, blood or energy burst",
    environmentReaction: "environment shatters at point of impact",
    momentum: 100,
    impactClarity: "extreme",
    recoveryBeat: "loser falling, winner's pose",
    actionReadabilityScore: 95,
    crowdReactionHint: "crowd erupts or goes silent",
    environmentDestructionLevel: "moderate",
  },
  post_impact_silence: {
    shotType: "wide",
    framing: "both fighters still, dust settling",
    impactCue: "absence of motion, heavy silence",
    environmentReaction: "settling debris, smoke, damaged terrain",
    momentum: 10,
    impactClarity: "low",
    recoveryBeat: null,
    actionReadabilityScore: 60,
    crowdReactionHint: "crowd holding breath",
    environmentDestructionLevel: "moderate",
  },
};

function selectPreset(text: string, currentShotType: string | null | undefined): CombatPreset {
  if (/(aftermath|retomb|apr[eè]s|after the hit)/.test(text)) return "combat_aftermath";
  if (/(post.impact|silence|calme|poussière retombe)/.test(text)) return "post_impact_silence";
  if (/(rage|furie|scream|cri|berserk)/.test(text)) return "rage_closeup";
  if (/(finisher|coup final|finish|décisif|abattre)/.test(text)) return "brutal_finisher";
  if (/(shockwave|onde de choc|arena|arène|explosion)/.test(text)) return "arena_shockwave";
  if (/(heavy|lourd|puissant|écrase|smash|frappe lourde)/.test(text)) return "heavy_strike";
  if (/(feint|esquive|contre|counter|riposte|pivot)/.test(text)) return "feint_and_counter";
  if (/(rapide|fast|échange|exchange|rafale|série)/.test(text)) return "fast_exchange";
  if (/(crowd|foule|spectators|public reaction)/.test(text)) return "crowd_reaction";
  if (/(arrive|entry|apparition|entr[ée]e héro)/.test(text)) return "hero_entry_panel";
  if (/(dialogue|parle|dit|répond|tension verbale)/.test(text)) return "dialogue_tension";
  if (/(établit|décor|lieu|arena|champ de bataille)/.test(text)) return "establishing_location";

  return "combat_clash";
}

export function directCombatPanel(input: CombatPanelDirectionInput): CombatPanelDirection {
  const text = `${input.beatText} ${input.scenePurpose ?? ""}`.toLowerCase();
  const preset = selectPreset(text, input.currentShotType);
  const definition = PRESET_DEFINITIONS[preset];

  // Ajuster le shotType selon le contexte
  let shotType = definition.shotType;
  if (preset === "combat_clash" && input.currentShotType === "closeup") {
    shotType = "medium";
  }

  // Ajuster le momentum selon l'input
  const momentum = input.momentum !== undefined
    ? Math.round((definition.momentum + input.momentum) / 2)
    : definition.momentum;

  return {
    preset,
    ...definition,
    shotType,
    momentum,
  };
}
