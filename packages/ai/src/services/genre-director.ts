import type { BeatEventType } from "./story-spine";
import type { CreativityControls } from "@manga-ai-studio/world";

export type GenreDirectorMode =
  | "shonen_combat"
  | "seinen_tension"
  | "romance_shojo"
  | "thriller_horror"
  | "quiet_aftermath";

export type GenreDirectorConfig = {
  beatRhythm: "fast" | "medium" | "slow";
  turnTypes: BeatEventType[];
  silenceDensity: number;
  actionDialogueRatio: number;
  cliffhangerStyle: string;
  panelDensity: "dense" | "balanced" | "airy";
  emotionalIntensityDefault: number;
  combatReadabilityBonus: number;
  romanceTensionBonus: number;
};

const GENRE_CONFIGS: Record<GenreDirectorMode, GenreDirectorConfig> = {
  shonen_combat: {
    beatRhythm: "fast",
    turnTypes: ["escalation", "confrontation", "counterattack", "reveal", "cliff_pivot"],
    silenceDensity: 0.15,
    actionDialogueRatio: 0.7,
    cliffhangerStyle: "power_reveal_or_new_threat",
    panelDensity: "dense",
    emotionalIntensityDefault: 75,
    combatReadabilityBonus: 20,
    romanceTensionBonus: 0,
  },
  seinen_tension: {
    beatRhythm: "medium",
    turnTypes: ["setup", "escalation", "betrayal", "reveal", "silent_aftermath"],
    silenceDensity: 0.3,
    actionDialogueRatio: 0.5,
    cliffhangerStyle: "moral_dilemma_or_revelation",
    panelDensity: "balanced",
    emotionalIntensityDefault: 65,
    combatReadabilityBonus: 5,
    romanceTensionBonus: 5,
  },
  romance_shojo: {
    beatRhythm: "slow",
    turnTypes: ["setup", "near_confession", "interruption", "silent_aftermath", "reveal"],
    silenceDensity: 0.45,
    actionDialogueRatio: 0.25,
    cliffhangerStyle: "emotional_ambiguity_or_misunderstanding",
    panelDensity: "airy",
    emotionalIntensityDefault: 70,
    combatReadabilityBonus: 0,
    romanceTensionBonus: 25,
  },
  thriller_horror: {
    beatRhythm: "medium",
    turnTypes: ["setup", "escalation", "interruption", "betrayal", "cliff_pivot"],
    silenceDensity: 0.35,
    actionDialogueRatio: 0.45,
    cliffhangerStyle: "threat_imminent_or_identity_reveal",
    panelDensity: "balanced",
    emotionalIntensityDefault: 80,
    combatReadabilityBonus: 10,
    romanceTensionBonus: 0,
  },
  quiet_aftermath: {
    beatRhythm: "slow",
    turnTypes: ["silent_aftermath", "setup", "near_confession", "reveal"],
    silenceDensity: 0.6,
    actionDialogueRatio: 0.2,
    cliffhangerStyle: "quiet_revelation_or_character_shift",
    panelDensity: "airy",
    emotionalIntensityDefault: 50,
    combatReadabilityBonus: 0,
    romanceTensionBonus: 10,
  },
};

export function getGenreDirectorConfig(mode: GenreDirectorMode): GenreDirectorConfig {
  return GENRE_CONFIGS[mode];
}

export function inferGenreMode(
  controls: Partial<CreativityControls>,
  selectedPlotLabel?: string | null,
): GenreDirectorMode {
  const novelty = controls.noveltyLevel ?? 55;
  const worldStrictness = controls.worldStrictness ?? 85;

  // Shock plot → thriller/horror
  if (selectedPlotLabel === "shock") {
    return "thriller_horror";
  }

  // Faible novelty + strict → quiet aftermath
  if (novelty < 30 && worldStrictness > 80) {
    return "quiet_aftermath";
  }

  // Haute novelty + faible strictness → shonen combat
  if (novelty > 70 && worldStrictness < 60) {
    return "shonen_combat";
  }

  // Bold plot → seinen tension
  if (selectedPlotLabel === "bold") {
    return "seinen_tension";
  }

  // Safe plot → romance shojo
  if (selectedPlotLabel === "safe") {
    return "romance_shojo";
  }

  // Défaut équilibré
  return "seinen_tension";
}

export function buildGenreDirectorPromptHints(config: GenreDirectorConfig): string[] {
  const hints: string[] = [];

  hints.push(`Rythme narratif : ${config.beatRhythm}`);
  hints.push(`Types de turns prioritaires : ${config.turnTypes.join(", ")}`);
  hints.push(`Densité de silence : ${Math.round(config.silenceDensity * 100)}%`);
  hints.push(`Ratio action/dialogue : ${Math.round(config.actionDialogueRatio * 100)}%`);
  hints.push(`Style de cliffhanger : ${config.cliffhangerStyle}`);
  hints.push(`Densité de panels : ${config.panelDensity}`);

  if (config.combatReadabilityBonus > 0) {
    hints.push(`Priorité lisibilité combat : +${config.combatReadabilityBonus}`);
  }
  if (config.romanceTensionBonus > 0) {
    hints.push(`Priorité tension romantique : +${config.romanceTensionBonus}`);
  }

  return hints;
}
