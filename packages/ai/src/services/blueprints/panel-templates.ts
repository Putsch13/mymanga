/**
 * Templates de decoupage panel-par-panel selon le type de beat narratif.
 *
 * Source of truth des shot types / subject focus / cutaway par "mood" de beat.
 * Extrait de `panel-blueprint-builder.ts` dans le Sprint C pour isoler la
 * data layout des regles d'assignation.
 */

import type {
  SubjectFocus,
  CutawayType,
  NarrativeFact,
  ProductionBeat,
} from "@manga-ai-studio/core";

export type BeatType =
  | "combat"
  | "tense_dialogue"
  | "infiltration"
  | "reveal"
  | "emotional"
  | "public_scene"
  | "chase"
  | "generic";

export interface PanelTemplate {
  purpose: string;
  shotType: string;
  cameraAngle: string;
  subjectFocus: SubjectFocus;
  secondaryFocus?: SubjectFocus | null;
  mustShowEnemy: boolean;
  requiredNpcCount: number;
  cutawayType: CutawayType;
  heroCenterAllowed: boolean;
  criticality: "low" | "medium" | "high" | "critical";
  dialogueCarrier?: "speaker_visible" | "offscreen_allowed" | "narration";
}

// ─── Detection du type de beat ────────────────────────────────────────────────

export function detectBeatType(beat: ProductionBeat, facts: NarrativeFact[]): BeatType {
  const text = [beat.summary, beat.narrativeFunction, beat.dramaticChange]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasEnemy = facts.some((f) => f.type === "enemy_presence" || f.type === "threat");
  const hasAction = facts.some((f) => f.type === "action");
  const hasReveal = facts.some((f) => f.type === "reveal");
  const hasDialogue = facts.some((f) => f.type === "dialogue");
  const hasCrowd = facts.some((f) => f.type === "npc_presence");
  const hasMovement = facts.some((f) => f.type === "movement");

  if (hasAction && hasEnemy) return "combat";
  if (hasReveal) return "reveal";
  if (/(infiltr|furtif|stealth|silhouette|surveillance|ruse|discrétion)/.test(text) && hasEnemy)
    return "infiltration";
  if (/(infiltr|furtif|stealth|silhouette|ruse|discrétion)/.test(text)) return "infiltration";
  if (hasCrowd && /(marché|market|rue|street|arène|arena|foule|crowd|place|cité|ville)/.test(text))
    return "public_scene";
  if (hasMovement && /(fuite|fuis|chase|poursuite|pursuit|course-poursuite)/.test(text)) return "chase";
  if (hasDialogue && (hasEnemy || /(tension|menace|confronte|ultimatum)/.test(text)))
    return "tense_dialogue";
  if (/(émotion|emotion|pleure|cries|larmes|tears|réalise|realizes|choc|honte|tristesse)/.test(text))
    return "emotional";
  if (hasEnemy && hasDialogue) return "tense_dialogue";
  if (hasEnemy) return "combat";

  return "generic";
}

// ─── Templates par type de beat ───────────────────────────────────────────────

export const COMBAT_TEMPLATES: PanelTemplate[] = [
  {
    purpose: "establishing battlefield — aucun héros",
    shotType: "wide",
    cameraAngle: "aerial",
    subjectFocus: "environment",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    cutawayType: "environment",
    heroCenterAllowed: false,
    criticality: "high",
  },
  {
    purpose: "crowd reaction — spectateurs / témoins",
    shotType: "wide",
    cameraAngle: "eye_level",
    subjectFocus: "npc",
    mustShowEnemy: false,
    requiredNpcCount: 3,
    cutawayType: "none",
    heroCenterAllowed: false,
    criticality: "low",
  },
  {
    purpose: "wide action establishing",
    shotType: "wide",
    cameraAngle: "low_angle",
    subjectFocus: "group",
    mustShowEnemy: true,
    requiredNpcCount: 0,
    cutawayType: "none",
    heroCenterAllowed: false,
    criticality: "high",
  },
  {
    purpose: "weapon / prop insert",
    shotType: "closeup",
    cameraAngle: "eye_level",
    subjectFocus: "prop",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    cutawayType: "prop_insert",
    heroCenterAllowed: false,
    criticality: "high",
  },
  {
    purpose: "enemy focus / threat",
    shotType: "medium",
    cameraAngle: "low_angle",
    subjectFocus: "enemy",
    mustShowEnemy: true,
    requiredNpcCount: 0,
    cutawayType: "enemy",
    heroCenterAllowed: false,
    criticality: "critical",
  },
  {
    purpose: "hero reaction / counter",
    shotType: "medium",
    cameraAngle: "eye_level",
    subjectFocus: "reaction",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    cutawayType: "reaction",
    heroCenterAllowed: true,
    criticality: "medium",
  },
  {
    purpose: "aftermath / terrain damage",
    shotType: "wide",
    cameraAngle: "high_angle",
    subjectFocus: "aftermath",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    cutawayType: "aftermath",
    heroCenterAllowed: false,
    criticality: "medium",
  },
];

export const TENSE_DIALOGUE_TEMPLATES: PanelTemplate[] = [
  {
    purpose: "establishing / environment context",
    shotType: "wide",
    cameraAngle: "eye_level",
    subjectFocus: "environment",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    cutawayType: "environment",
    heroCenterAllowed: false,
    criticality: "low",
  },
  {
    purpose: "speaker A medium",
    shotType: "medium",
    cameraAngle: "eye_level",
    subjectFocus: "hero",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    cutawayType: "none",
    heroCenterAllowed: true,
    criticality: "high",
    dialogueCarrier: "speaker_visible",
  },
  {
    purpose: "reaction B",
    shotType: "medium",
    cameraAngle: "eye_level",
    subjectFocus: "reaction",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    cutawayType: "reaction",
    heroCenterAllowed: false,
    criticality: "medium",
  },
  {
    purpose: "prop cutaway if key object",
    shotType: "closeup",
    cameraAngle: "eye_level",
    subjectFocus: "prop",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    cutawayType: "prop_insert",
    heroCenterAllowed: false,
    criticality: "medium",
  },
  {
    purpose: "payoff face-off",
    shotType: "over_shoulder",
    cameraAngle: "eye_level",
    subjectFocus: "group",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    cutawayType: "none",
    heroCenterAllowed: true,
    criticality: "high",
    dialogueCarrier: "speaker_visible",
  },
  {
    purpose: "NPC reaction crowd / witness",
    shotType: "medium",
    cameraAngle: "eye_level",
    subjectFocus: "npc",
    mustShowEnemy: false,
    requiredNpcCount: 2,
    cutawayType: "none",
    heroCenterAllowed: false,
    criticality: "low",
  },
  {
    purpose: "décor détail symbolique — ancrage lieu",
    shotType: "closeup",
    cameraAngle: "high_angle",
    subjectFocus: "prop",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    cutawayType: "prop_insert",
    heroCenterAllowed: false,
    criticality: "low",
  },
];

export const INFILTRATION_TEMPLATES: PanelTemplate[] = [
  {
    purpose: "environment / architecture / route",
    shotType: "wide",
    cameraAngle: "high_angle",
    subjectFocus: "environment",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    cutawayType: "environment",
    heroCenterAllowed: false,
    criticality: "medium",
  },
  {
    purpose: "close object / badge / terminal / lock",
    shotType: "closeup",
    cameraAngle: "eye_level",
    subjectFocus: "prop",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    cutawayType: "prop_insert",
    heroCenterAllowed: false,
    criticality: "high",
  },
  {
    purpose: "enemy / guard silhouette",
    shotType: "medium",
    cameraAngle: "eye_level",
    subjectFocus: "enemy",
    mustShowEnemy: true,
    requiredNpcCount: 0,
    cutawayType: "enemy",
    heroCenterAllowed: false,
    criticality: "high",
  },
  {
    purpose: "movement trace / approach",
    shotType: "wide",
    cameraAngle: "eye_level",
    subjectFocus: "hero",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    cutawayType: "movement_trace",
    heroCenterAllowed: true,
    criticality: "medium",
  },
];

export const REVEAL_TEMPLATES: PanelTemplate[] = [
  {
    purpose: "reveal subject",
    shotType: "medium",
    cameraAngle: "low_angle",
    subjectFocus: "environment",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    cutawayType: "none",
    heroCenterAllowed: false,
    criticality: "critical",
  },
  {
    purpose: "focused reaction",
    shotType: "closeup",
    cameraAngle: "eye_level",
    subjectFocus: "reaction",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    cutawayType: "reaction",
    heroCenterAllowed: true,
    criticality: "critical",
  },
  {
    purpose: "evidence / prop / detail insert",
    shotType: "closeup",
    cameraAngle: "eye_level",
    subjectFocus: "prop",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    cutawayType: "prop_insert",
    heroCenterAllowed: false,
    criticality: "critical",
  },
  {
    purpose: "environment shift / tension reset",
    shotType: "wide",
    cameraAngle: "high_angle",
    subjectFocus: "environment",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    cutawayType: "environment",
    heroCenterAllowed: false,
    criticality: "medium",
  },
];

export const PUBLIC_SCENE_TEMPLATES: PanelTemplate[] = [
  {
    purpose: "crowd establishing",
    shotType: "wide",
    cameraAngle: "high_angle",
    subjectFocus: "npc",
    mustShowEnemy: false,
    requiredNpcCount: 3,
    cutawayType: "crowd",
    heroCenterAllowed: false,
    criticality: "medium",
  },
  {
    purpose: "hero in crowd medium",
    shotType: "medium",
    cameraAngle: "eye_level",
    subjectFocus: "hero",
    mustShowEnemy: false,
    requiredNpcCount: 2,
    cutawayType: "none",
    heroCenterAllowed: true,
    criticality: "medium",
  },
  {
    purpose: "crowd reaction / ambient",
    shotType: "wide",
    cameraAngle: "eye_level",
    subjectFocus: "npc",
    mustShowEnemy: false,
    requiredNpcCount: 4,
    cutawayType: "crowd",
    heroCenterAllowed: false,
    criticality: "low",
  },
  {
    purpose: "detail / prop in public context",
    shotType: "closeup",
    cameraAngle: "eye_level",
    subjectFocus: "prop",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    cutawayType: "prop_insert",
    heroCenterAllowed: false,
    criticality: "low",
  },
];

export const GENERIC_TEMPLATES: PanelTemplate[] = [
  {
    purpose: "establishing",
    shotType: "wide",
    cameraAngle: "eye_level",
    subjectFocus: "environment",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    cutawayType: "environment",
    heroCenterAllowed: false,
    criticality: "low",
  },
  {
    purpose: "character medium",
    shotType: "medium",
    cameraAngle: "eye_level",
    subjectFocus: "hero",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    cutawayType: "none",
    heroCenterAllowed: true,
    criticality: "medium",
  },
  {
    purpose: "reaction / detail",
    shotType: "closeup",
    cameraAngle: "eye_level",
    subjectFocus: "reaction",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    cutawayType: "none",
    heroCenterAllowed: false,
    criticality: "low",
  },
  {
    purpose: "environment cutaway",
    shotType: "wide",
    cameraAngle: "eye_level",
    subjectFocus: "environment",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    cutawayType: "environment",
    heroCenterAllowed: false,
    criticality: "low",
  },
];

export function getTemplatesForBeatType(beatType: BeatType): PanelTemplate[] {
  switch (beatType) {
    case "combat": return COMBAT_TEMPLATES;
    case "tense_dialogue": return TENSE_DIALOGUE_TEMPLATES;
    case "infiltration": return INFILTRATION_TEMPLATES;
    case "reveal": return REVEAL_TEMPLATES;
    case "public_scene": return PUBLIC_SCENE_TEMPLATES;
    case "chase": return [...COMBAT_TEMPLATES.slice(0, 3), GENERIC_TEMPLATES[0]];
    case "emotional": return [
      TENSE_DIALOGUE_TEMPLATES[1],
      TENSE_DIALOGUE_TEMPLATES[2],
      REVEAL_TEMPLATES[1],
      GENERIC_TEMPLATES[0],
    ];
    default: return GENERIC_TEMPLATES;
  }
}
