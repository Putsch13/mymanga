/**
 * PanelIntentCard — carte d'intention visuelle d'un panel.
 * Compilée depuis panel.mood, panel.beatId, scene.purpose.
 * Injectée dans le prompt pour que l'image joue le beat réel.
 */

export type PanelRole =
  | "setup"
  | "approach"
  | "tension"
  | "reveal"
  | "confrontation"
  | "impact"
  | "reaction"
  | "aftermath"
  | "romance_beat"
  | "interruption"
  | "silent_observation"
  | "crowd_reaction";

export type PanelBeatEventType =
  | "combat_turning_point"
  | "reveal"
  | "romance_tension"
  | "interruption"
  | "aftermath"
  | "dialogue_conflict"
  | "silent_beat"
  | "crowd_reaction"
  | "establishing"
  | "approach"
  | "impact"
  | "reaction"
  | "tension";

export interface PanelIntentCard {
  panelRole: PanelRole;
  beatEventType: PanelBeatEventType;
  emotionalTarget: string;
  /** 0–10 : intensité de l'action */
  actionIntensity: number;
  /** 0–10 : niveau de mouvement attendu */
  motionLevel: number;
  cameraShot: string;
  framing: string;
  angle: string;
  stagingPriority: string;
  /** Éléments qui DOIVENT être visibles dans ce panel */
  mustShow: string[];
  /** Éléments à éviter absolument */
  mustAvoid: string[];
  continuityPriority: "high" | "medium" | "low";
  sfxIntent: string | null;
  dialoguePriority: "high" | "medium" | "low" | "none";
  /** Contraintes visuelles dérivées du beat */
  beatVisualConstraints: string[];
  /** Interdit les SFX incohérents avec ce beat */
  sfxForbiddenTypes?: string[];
}

/** Règles beat → contraintes visuelles */
const BEAT_VISUAL_RULES: Record<PanelBeatEventType, {
  mustShow: string[];
  mustAvoid: string[];
  beatVisualConstraints: string[];
  sfxForbiddenTypes?: string[];
  motionLevel: number;
  actionIntensity: number;
}> = {
  combat_turning_point: {
    mustShow: ["clear movement arc", "attacker and defender readable", "consequence visible"],
    mustAvoid: ["static neutral pose", "empty background", "no motion"],
    beatVisualConstraints: [
      "show who acts and who reacts",
      "visible consequence of the blow",
      "dynamic framing with diagonal energy",
    ],
    motionLevel: 8,
    actionIntensity: 9,
  },
  reveal: {
    mustShow: ["focus on revealed information", "character reaction"],
    mustAvoid: ["cluttered background", "obscured focal point", "multiple competing elements"],
    beatVisualConstraints: [
      "clear focal point on the reveal",
      "reaction shot readable",
      "no visual noise around the key element",
    ],
    motionLevel: 2,
    actionIntensity: 3,
  },
  romance_tension: {
    mustShow: ["proximity between characters", "eye contact or avoidance", "subtle gesture"],
    mustAvoid: ["action SFX", "impact burst", "crowd noise", "aggressive framing"],
    beatVisualConstraints: [
      "intimate framing, medium or close-up",
      "soft lighting, no harsh shadows",
      "hesitation readable in posture",
    ],
    sfxForbiddenTypes: ["impact", "explosion", "crash"],
    motionLevel: 1,
    actionIntensity: 1,
  },
  interruption: {
    mustShow: ["contrast between momentum and break", "interruptor clearly visible"],
    mustAvoid: ["smooth transition", "calm composition"],
    beatVisualConstraints: [
      "sharp visual break in the panel flow",
      "interruptor framing dominant",
      "interrupted character's reaction visible",
    ],
    motionLevel: 5,
    actionIntensity: 4,
  },
  aftermath: {
    mustShow: ["emotional or physical cost", "breathing space", "consequence visible"],
    mustAvoid: ["action poses", "speed lines", "impact SFX"],
    beatVisualConstraints: [
      "silence and stillness in composition",
      "wide or medium shot for scale of consequence",
      "character posture shows exhaustion or emotion",
    ],
    sfxForbiddenTypes: ["impact", "explosion"],
    motionLevel: 1,
    actionIntensity: 1,
  },
  dialogue_conflict: {
    mustShow: ["both characters readable", "tension in posture", "eye contact"],
    mustAvoid: ["action SFX", "environmental chaos"],
    beatVisualConstraints: [
      "over-shoulder or medium shot",
      "body language shows conflict",
    ],
    motionLevel: 2,
    actionIntensity: 3,
  },
  silent_beat: {
    mustShow: ["character expression", "environment detail"],
    mustAvoid: ["SFX", "dialogue bubbles", "action poses"],
    beatVisualConstraints: [
      "no SFX overlay",
      "emphasis on expression and environment",
    ],
    sfxForbiddenTypes: ["impact", "movement", "ambient_loud"],
    motionLevel: 0,
    actionIntensity: 0,
  },
  crowd_reaction: {
    mustShow: ["crowd visible and reactive", "focal character in foreground"],
    mustAvoid: ["empty background", "isolated character"],
    beatVisualConstraints: [
      "wide shot showing crowd scale",
      "crowd emotion readable",
    ],
    motionLevel: 4,
    actionIntensity: 4,
  },
  establishing: {
    mustShow: ["full environment readable", "location signals clear"],
    mustAvoid: ["tight close-up", "obscured background"],
    beatVisualConstraints: [
      "favor wide or medium framing, avoid extreme close-up",
      "foreground, midground, background all readable when possible",
    ],
    motionLevel: 1,
    actionIntensity: 1,
  },
  approach: {
    mustShow: ["character movement direction", "destination implied"],
    mustAvoid: ["static composition"],
    beatVisualConstraints: ["directional framing", "environment context visible"],
    motionLevel: 4,
    actionIntensity: 3,
  },
  impact: {
    mustShow: ["impact point visible", "force direction readable", "reaction"],
    mustAvoid: ["static pose", "no consequence"],
    beatVisualConstraints: [
      "impact burst or speed lines",
      "attacker and target both readable",
    ],
    motionLevel: 9,
    actionIntensity: 9,
  },
  reaction: {
    mustShow: ["character expression", "context of what they react to"],
    mustAvoid: ["action SFX on calm reaction"],
    beatVisualConstraints: ["close-up or medium shot", "expression dominant"],
    motionLevel: 2,
    actionIntensity: 2,
  },
  tension: {
    mustShow: ["tension in posture", "environmental atmosphere"],
    mustAvoid: ["relaxed composition"],
    beatVisualConstraints: ["high contrast lighting", "tight framing"],
    motionLevel: 2,
    actionIntensity: 4,
  },
};

/** Mapper le purpose/mood d'un panel vers un PanelBeatEventType */
export function inferBeatEventType(
  purpose: string | null | undefined,
  mood: string | null | undefined,
  scenePurpose: string | null | undefined,
): PanelBeatEventType {
  const text = `${purpose ?? ""} ${mood ?? ""} ${scenePurpose ?? ""}`.toLowerCase();

  if (/(combat.*turn|turning.*point|decisive.*blow|coup.*décisif|tournant)/.test(text)) return "combat_turning_point";
  if (/(reveal|révèle|découvert|twist|surprise)/.test(text)) return "reveal";
  if (/(romance|amour|love|tender|intime|intimate|blush|rougit)/.test(text)) return "romance_tension";
  if (/(interrupt|interrompt|cut|cassure|rupture)/.test(text)) return "interruption";
  if (/(aftermath|après.*combat|retombée|silence.*après|recovery)/.test(text)) return "aftermath";
  if (/(dialogue|parle|dit|répond|confrontation.*verbale)/.test(text)) return "dialogue_conflict";
  if (/(silent|silence|sans.*parole|observation|contempl)/.test(text)) return "silent_beat";
  if (/(crowd|foule|public|spectators)/.test(text)) return "crowd_reaction";
  if (/(establish|décor|lieu|wide.*shot|vue.*ensemble)/.test(text)) return "establishing";
  if (/(approach|approche|arrive|walk|marche)/.test(text)) return "approach";
  if (/(impact|frappe|strike|hit|coup|smash)/.test(text)) return "impact";
  if (/(reaction|réaction|shock|choc|surprise)/.test(text)) return "reaction";
  if (/(tension|menace|threat|danger)/.test(text)) return "tension";

  // Fallback depuis mood
  if (mood === "action") return "impact";
  if (mood === "romance") return "romance_tension";
  if (mood === "tension") return "tension";
  if (mood === "revelation") return "reveal";
  if (mood === "calm") return "silent_beat";
  if (mood === "dramatic") return "tension";

  return "tension";
}

/** Mapper le purpose vers un PanelRole */
export function inferPanelRole(
  purpose: string | null | undefined,
  beatEventType: PanelBeatEventType,
): PanelRole {
  const text = (purpose ?? "").toLowerCase();

  if (/(establish|décor|lieu)/.test(text)) return "setup";
  if (/(approach|arrive)/.test(text)) return "approach";
  if (/(tension|menace)/.test(text)) return "tension";
  if (/(reveal|découvert)/.test(text)) return "reveal";
  if (/(confrontation|face.*à.*face)/.test(text)) return "confrontation";
  if (/(impact|frappe|strike)/.test(text)) return "impact";
  if (/(reaction|réaction)/.test(text)) return "reaction";
  if (/(aftermath|après)/.test(text)) return "aftermath";
  if (/(romance|amour|tender)/.test(text)) return "romance_beat";
  if (/(interrupt)/.test(text)) return "interruption";
  if (/(silent|silence|observe)/.test(text)) return "silent_observation";
  if (/(crowd|foule)/.test(text)) return "crowd_reaction";

  // Fallback depuis beatEventType
  const beatToRole: Record<PanelBeatEventType, PanelRole> = {
    combat_turning_point: "impact",
    reveal: "reveal",
    romance_tension: "romance_beat",
    interruption: "interruption",
    aftermath: "aftermath",
    dialogue_conflict: "confrontation",
    silent_beat: "silent_observation",
    crowd_reaction: "crowd_reaction",
    establishing: "setup",
    approach: "approach",
    impact: "impact",
    reaction: "reaction",
    tension: "tension",
  };
  return beatToRole[beatEventType] ?? "tension";
}

/** Compiler une PanelIntentCard depuis les données disponibles */
export function buildPanelIntentCard(input: {
  purpose: string | null | undefined;
  mood: string | null | undefined;
  scenePurpose: string | null | undefined;
  sfx?: string[] | null;
  dialogueCount?: number;
  cameraShot?: string;
  cameraAngle?: string;
}): PanelIntentCard {
  const beatEventType = inferBeatEventType(input.purpose, input.mood, input.scenePurpose);
  const panelRole = inferPanelRole(input.purpose, beatEventType);
  const rules = BEAT_VISUAL_RULES[beatEventType];

  const hasSfx = Array.isArray(input.sfx) && input.sfx.length > 0;
  const sfxForbidden = rules.sfxForbiddenTypes ?? [];
  const sfxIntent = hasSfx ? input.sfx!.slice(0, 2).join(", ") : null;

  return {
    panelRole,
    beatEventType,
    emotionalTarget: deriveEmotionalTarget(beatEventType),
    actionIntensity: rules.actionIntensity,
    motionLevel: rules.motionLevel,
    cameraShot: input.cameraShot ?? deriveDefaultCamera(beatEventType),
    framing: deriveDefaultFraming(beatEventType),
    angle: input.cameraAngle ?? "eye_level",
    stagingPriority: deriveStagingPriority(beatEventType),
    mustShow: rules.mustShow,
    mustAvoid: rules.mustAvoid,
    continuityPriority: deriveContinuityPriority(beatEventType),
    sfxIntent,
    dialoguePriority: (input.dialogueCount ?? 0) > 0 ? "high" : "none",
    beatVisualConstraints: rules.beatVisualConstraints,
    sfxForbiddenTypes: sfxForbidden,
  };
}

function deriveEmotionalTarget(beat: PanelBeatEventType): string {
  const targets: Record<PanelBeatEventType, string> = {
    combat_turning_point: "adrenaline, decisiveness",
    reveal: "shock, understanding",
    romance_tension: "longing, hesitation",
    interruption: "surprise, frustration",
    aftermath: "exhaustion, reflection",
    dialogue_conflict: "tension, determination",
    silent_beat: "contemplation, weight",
    crowd_reaction: "social pressure, spectacle",
    establishing: "orientation, immersion",
    approach: "anticipation, purpose",
    impact: "shock, power",
    reaction: "surprise, emotion",
    tension: "dread, anticipation",
  };
  return targets[beat] ?? "neutral";
}

function deriveDefaultCamera(beat: PanelBeatEventType): string {
  const cameras: Record<PanelBeatEventType, string> = {
    combat_turning_point: "wide",
    reveal: "medium",
    romance_tension: "closeup",
    interruption: "medium",
    aftermath: "wide",
    dialogue_conflict: "over_shoulder",
    silent_beat: "medium",
    crowd_reaction: "wide",
    establishing: "wide",
    approach: "medium",
    impact: "wide",
    reaction: "closeup",
    tension: "medium",
  };
  return cameras[beat] ?? "medium";
}

function deriveDefaultFraming(beat: PanelBeatEventType): string {
  const framings: Record<PanelBeatEventType, string> = {
    combat_turning_point: "full body both fighters, space for movement",
    reveal: "focal point centered, reaction visible",
    romance_tension: "intimate, characters close, soft background",
    interruption: "interruptor dominant, interrupted character reacting",
    aftermath: "wide to show scale of consequence",
    dialogue_conflict: "both characters in frame, tension in posture",
    silent_beat: "character centered, environment breathing room",
    crowd_reaction: "foreground character, crowd in background",
    establishing: "full environment, characters small",
    approach: "character in motion, destination implied",
    impact: "impact point centered, force direction clear",
    reaction: "face dominant, context in background",
    tension: "tight framing, high contrast",
  };
  return framings[beat] ?? "balanced composition";
}

function deriveStagingPriority(beat: PanelBeatEventType): string {
  if (beat === "combat_turning_point" || beat === "impact") return "action_readability";
  if (beat === "romance_tension") return "emotional_proximity";
  if (beat === "reveal") return "focal_clarity";
  if (beat === "establishing" || beat === "crowd_reaction") return "environment_scale";
  return "character_expression";
}

function deriveContinuityPriority(beat: PanelBeatEventType): "high" | "medium" | "low" {
  if (beat === "combat_turning_point" || beat === "impact" || beat === "romance_tension") return "high";
  if (beat === "establishing" || beat === "crowd_reaction") return "low";
  return "medium";
}

/** Construire le bloc prompt depuis une PanelIntentCard */
export function buildPanelIntentPromptBlock(card: PanelIntentCard): string {
  const parts: string[] = [];

  parts.push(`Beat: ${card.beatEventType} (role: ${card.panelRole})`);
  parts.push(`Emotional target: ${card.emotionalTarget}`);

  if (card.mustShow.length > 0) {
    parts.push(`Must show: ${card.mustShow.join(", ")}`);
  }
  if (card.beatVisualConstraints.length > 0) {
    parts.push(card.beatVisualConstraints.join(". "));
  }
  if (card.motionLevel >= 7) {
    parts.push("High motion: speed lines, dynamic pose, energy burst required");
  }

  return parts.join(". ");
}

/** Construire le bloc négatif depuis une PanelIntentCard */
export function buildPanelIntentNegativeBlock(card: PanelIntentCard): string {
  const parts: string[] = [...card.mustAvoid];
  if (card.sfxForbiddenTypes && card.sfxForbiddenTypes.length > 0) {
    parts.push(...card.sfxForbiddenTypes.map((t) => `${t} SFX`));
  }
  return parts.join(", ");
}
