import type { BeatEventType } from "./story-spine";
import type { CreativityControls } from "@manga-ai-studio/world";

export type GenreDirectorMode =
  | "shonen_combat"
  | "seinen_tension"
  | "romance_shojo"
  | "thriller_horror"
  | "quiet_aftermath"
  | "isekai_adventure"
  | "mecha_tactical"
  | "sport_rivalry"
  | "medical_drama"
  | "mystery_detective"
  | "slice_of_life"
  | "supernatural"
  | "historical_epic";

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

  // GENRE-1 : 8 nouveaux modes
  isekai_adventure: {
    beatRhythm: "medium",
    turnTypes: ["setup", "reveal", "escalation", "counterattack", "cliff_pivot"],
    silenceDensity: 0.2,
    actionDialogueRatio: 0.55,
    cliffhangerStyle: "new_world_threat_or_power_reveal",
    panelDensity: "balanced",
    emotionalIntensityDefault: 70,
    combatReadabilityBonus: 15,
    romanceTensionBonus: 8,
  },
  mecha_tactical: {
    beatRhythm: "fast",
    turnTypes: ["setup", "escalation", "confrontation", "counterattack", "reveal"],
    silenceDensity: 0.1,
    actionDialogueRatio: 0.75,
    cliffhangerStyle: "mech_damage_or_system_failure",
    panelDensity: "dense",
    emotionalIntensityDefault: 80,
    combatReadabilityBonus: 25,
    romanceTensionBonus: 3,
  },
  sport_rivalry: {
    beatRhythm: "fast",
    turnTypes: ["setup", "escalation", "counterattack", "reveal", "cliff_pivot"],
    silenceDensity: 0.2,
    actionDialogueRatio: 0.65,
    cliffhangerStyle: "last_second_play_or_technique_reveal",
    panelDensity: "dense",
    emotionalIntensityDefault: 75,
    combatReadabilityBonus: 18,
    romanceTensionBonus: 5,
  },
  medical_drama: {
    beatRhythm: "medium",
    turnTypes: ["setup", "escalation", "betrayal", "reveal", "silent_aftermath"],
    silenceDensity: 0.4,
    actionDialogueRatio: 0.3,
    cliffhangerStyle: "diagnosis_reveal_or_patient_crisis",
    panelDensity: "balanced",
    emotionalIntensityDefault: 72,
    combatReadabilityBonus: 0,
    romanceTensionBonus: 12,
  },
  mystery_detective: {
    beatRhythm: "slow",
    turnTypes: ["setup", "reveal", "interruption", "betrayal", "cliff_pivot"],
    silenceDensity: 0.45,
    actionDialogueRatio: 0.25,
    cliffhangerStyle: "culprit_revelation_or_new_clue",
    panelDensity: "airy",
    emotionalIntensityDefault: 60,
    combatReadabilityBonus: 5,
    romanceTensionBonus: 6,
  },
  slice_of_life: {
    beatRhythm: "slow",
    turnTypes: ["setup", "near_confession", "silent_aftermath", "reveal"],
    silenceDensity: 0.55,
    actionDialogueRatio: 0.15,
    cliffhangerStyle: "emotional_shift_or_small_revelation",
    panelDensity: "airy",
    emotionalIntensityDefault: 45,
    combatReadabilityBonus: 0,
    romanceTensionBonus: 15,
  },
  supernatural: {
    beatRhythm: "medium",
    turnTypes: ["setup", "escalation", "reveal", "confrontation", "cliff_pivot"],
    silenceDensity: 0.3,
    actionDialogueRatio: 0.5,
    cliffhangerStyle: "supernatural_threat_or_power_awakening",
    panelDensity: "balanced",
    emotionalIntensityDefault: 75,
    combatReadabilityBonus: 12,
    romanceTensionBonus: 5,
  },
  historical_epic: {
    beatRhythm: "medium",
    turnTypes: ["setup", "escalation", "confrontation", "betrayal", "reveal"],
    silenceDensity: 0.35,
    actionDialogueRatio: 0.55,
    cliffhangerStyle: "battle_outcome_or_political_betrayal",
    panelDensity: "balanced",
    emotionalIntensityDefault: 70,
    combatReadabilityBonus: 15,
    romanceTensionBonus: 8,
  },
};

export function getGenreDirectorConfig(mode: GenreDirectorMode): GenreDirectorConfig {
  return GENRE_CONFIGS[mode];
}

export function inferGenreMode(
  controls: Partial<CreativityControls>,
  selectedPlotLabel?: string | null,
  primaryGenre?: string | null,
): GenreDirectorMode {
  // GENRE-1 : mapper le genre primaire du projet vers les nouveaux modes
  if (primaryGenre) {
    const genre = primaryGenre.toLowerCase();
    if (/isekai|autre monde|transported|portal fantasy/.test(genre)) return "isekai_adventure";
    if (/mecha|robot|pilote|mecanique|mécanique/.test(genre)) return "mecha_tactical";
    if (/sport|basket|foot|tennis|baseball|volleyball|combat.*sport/.test(genre)) return "sport_rivalry";
    if (/médical|medical|hôpital|chirurg|docteur|infirm/.test(genre)) return "medical_drama";
    if (/mystery|enquête|détective|policier|investigation/.test(genre)) return "mystery_detective";
    if (/slice.*life|vie.*quotidienne|tranche.*vie|school.*life|quotidien/.test(genre)) return "slice_of_life";
    if (/surnaturel|supernatural|paranormal|occulte/.test(genre)) return "supernatural";
    if (/histori|edo|meiji|samourai|époque|medieval|médiéval|feudal/.test(genre)) return "historical_epic";
    if (/horreur|horror|gore|terreur/.test(genre)) return "thriller_horror";
    if (/romance|amour|shojo|love/.test(genre)) return "romance_shojo";
    if (/shonen|action|combat|battle/.test(genre)) return "shonen_combat";
    if (/seinen|mature|dark|adult/.test(genre)) return "seinen_tension";
  }

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
