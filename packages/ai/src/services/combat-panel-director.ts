export interface CombatPanelDirectionInput {
  beatText: string;
  scenePurpose?: string | null;
  currentShotType?: string | null;
}

export interface CombatPanelDirection {
  preset:
    | "combat_clash"
    | "combat_aftermath"
    | "rage_closeup"
    | "dialogue_tension"
    | "establishing_location"
    | "crowd_reaction"
    | "hero_entry_panel";
  shotType: "wide" | "medium" | "closeup" | "extreme_closeup" | "over_shoulder";
  framing: string;
  impactCue: string;
  environmentReaction: string;
}

export function directCombatPanel(input: CombatPanelDirectionInput): CombatPanelDirection {
  const text = `${input.beatText} ${input.scenePurpose ?? ""}`.toLowerCase();
  if (/(aftermath|retomb|apres|after the hit|aftermath)/.test(text)) {
    return {
      preset: "combat_aftermath",
      shotType: "wide",
      framing: "show damage aftermath and spatial consequence",
      impactCue: "dust settling and broken stance",
      environmentReaction: "visible damage and altered environment",
    };
  }
  if (/(rage|furie|scream|cri|berserk)/.test(text)) {
    return {
      preset: "rage_closeup",
      shotType: "closeup",
      framing: "tight face and upper torso emphasis",
      impactCue: "explosive emotion and sharp ink lines",
      environmentReaction: "background reacts with speed lines and debris",
    };
  }
  if (/(crowd|foule|spectators|public reaction)/.test(text)) {
    return {
      preset: "crowd_reaction",
      shotType: "wide",
      framing: "fighters foreground, crowd readable in background",
      impactCue: "social shockwave around the action",
      environmentReaction: "spectator movement and arena reaction",
    };
  }
  if (/(arrive|entry|apparition|entr[ée]e héro)/.test(text)) {
    return {
      preset: "hero_entry_panel",
      shotType: "medium",
      framing: "hero dominant in frame with environment reveal",
      impactCue: "momentum and silhouette entrance",
      environmentReaction: "wind, cloth and crowd reacting to arrival",
    };
  }
  return {
    preset: "combat_clash",
    shotType: input.currentShotType === "closeup" ? "medium" : "wide",
    framing: "full clash readability with both fighters and space",
    impactCue: "clear movement arc and impact burst",
    environmentReaction: "ground or props react to the collision",
  };
}
