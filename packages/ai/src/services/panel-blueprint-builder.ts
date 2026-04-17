/**
 * Constructeur de Panel Blueprints premium.
 * Remplace le plan macro (estimatedPanels: 4 uniforme) par une vraie
 * mise en scène automatisée panel par panel.
 */

import type {
  PanelBlueprintPremium,
  SubjectFocus,
  CutawayType,
  NarrativeFact,
  RequiredProp,
  ChapterFocusBudget,
  FocusBudgetViolation,
} from "@manga-ai-studio/core";
import type { ProductionBeat } from "@manga-ai-studio/core";

export interface PanelBlueprintContext {
  heroCharacterId?: string | null;
  chapterNumber?: number;
  projectGenre?: string | null;
  projectTone?: string | null;
  antagonistNames?: string[];
  antagonistIds?: string[];
}

// ─── Détection du type de beat ────────────────────────────────────────────────

type BeatType =
  | "combat"
  | "tense_dialogue"
  | "infiltration"
  | "reveal"
  | "emotional"
  | "public_scene"
  | "chase"
  | "generic";

function detectBeatType(beat: ProductionBeat, facts: NarrativeFact[]): BeatType {
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

// ─── Templates de découpage par type de beat ──────────────────────────────────

interface PanelTemplate {
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

const COMBAT_TEMPLATES: PanelTemplate[] = [
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

const TENSE_DIALOGUE_TEMPLATES: PanelTemplate[] = [
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

const INFILTRATION_TEMPLATES: PanelTemplate[] = [
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

const REVEAL_TEMPLATES: PanelTemplate[] = [
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

const PUBLIC_SCENE_TEMPLATES: PanelTemplate[] = [
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

const GENERIC_TEMPLATES: PanelTemplate[] = [
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

function getTemplatesForBeatType(beatType: BeatType): PanelTemplate[] {
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

// ─── Assignation des props aux panels ─────────────────────────────────────────

function assignPropsToPanel(
  template: PanelTemplate,
  props: RequiredProp[],
): { required: RequiredProp[]; optional: RequiredProp[] } {
  const required: RequiredProp[] = [];
  const optional: RequiredProp[] = [];

  for (const prop of props) {
    if (template.subjectFocus === "prop" || template.cutawayType === "prop_insert") {
      if (prop.mustBeVisible) {
        required.push(prop);
      } else {
        optional.push(prop);
      }
    } else if (
      prop.mustBeVisible &&
      (template.subjectFocus === "hero" || template.subjectFocus === "group")
    ) {
      // Prop obligatoire visible sur les panels héros/groupe si usage actif
      if (prop.visibilityMode === "used_in_action" || prop.visibilityMode === "in_hand") {
        required.push(prop);
      } else {
        optional.push(prop);
      }
    } else {
      optional.push(prop);
    }
  }

  return { required, optional };
}

// ─── Constructeur principal ───────────────────────────────────────────────────

export function buildPanelBlueprintsFromBeat(
  beat: ProductionBeat,
  facts: NarrativeFact[],
  props: RequiredProp[],
  context: PanelBlueprintContext,
  startingPageNumber = 1,
  startingPanelNumber = 1,
): PanelBlueprintPremium[] {
  const beatType = detectBeatType(beat, facts);
  const templates = getTemplatesForBeatType(beatType);
  const blueprints: PanelBlueprintPremium[] = [];

  const speakerFact = facts.find((f) => f.type === "dialogue");
  const enemyFact = facts.find((f) => f.type === "enemy_presence" || f.type === "threat");

  templates.forEach((template, idx) => {
    const panelId = `panel_${beat.beatId}_${idx + 1}`;
    const { required, optional } = assignPropsToPanel(template, props);

    const mustShowCharacterIds: string[] = [];
    const mayShowCharacterIds: string[] = [];

    if (beat.involvedCharacters && beat.involvedCharacters.length > 0) {
      const focus = template.subjectFocus;
      if (focus === "hero" && context.heroCharacterId) {
        mustShowCharacterIds.push(context.heroCharacterId);
        mayShowCharacterIds.push(...beat.involvedCharacters.filter((id) => id !== context.heroCharacterId).slice(0, 2));
      } else if (focus === "enemy" && context.antagonistIds?.length) {
        mustShowCharacterIds.push(...context.antagonistIds.slice(0, 1));
        mayShowCharacterIds.push(...beat.involvedCharacters.filter((id) => !context.antagonistIds?.includes(id)).slice(0, 2));
      } else {
        mayShowCharacterIds.push(...beat.involvedCharacters.slice(0, 3));
      }
    } else if (template.heroCenterAllowed) {
      // Ne pas fallback sur le héros — laisser le subjectFocus décider
      console.warn(`[blueprint] heroCenterAllowed but no involvedCharacters for beat=${beat.beatId}, panel=${idx + 1} — no forced hero`);
    }

    let speakerAnchorCharacterId: string | null = null;
    if (template.dialogueCarrier === "speaker_visible" && speakerFact) {
      speakerAnchorCharacterId = speakerFact.actorIds[0] ?? null;
      if (!speakerAnchorCharacterId) {
        console.warn(`[blueprint] speaker_visible but no actorId on speakerFact for beat=${beat.beatId}`);
      }
    }

    const requiredSubjects: string[] = [];
    if (template.mustShowEnemy || (enemyFact !== undefined && idx === 0)) {
      requiredSubjects.push("enemy", "guard", "soldier", "antagonist");
      if (Array.isArray(context.antagonistNames)) {
        requiredSubjects.push(...context.antagonistNames.slice(0, 2).map(n => n.toLowerCase()));
      }
    }
    if (template.subjectFocus === "npc" || template.requiredNpcCount > 0) {
      requiredSubjects.push("npc", "crowd");
    }
    if (template.subjectFocus === "environment" || template.subjectFocus === "aftermath") {
      requiredSubjects.push("background", "environment");
    }

    blueprints.push({
      panelId,
      beatId: beat.beatId,
      panelIndex: idx,
      pageNumber: startingPageNumber,
      panelNumber: startingPanelNumber + idx,
      purpose: template.purpose,
      shotType: template.shotType,
      cameraAngle: template.cameraAngle,
      subjectFocus: template.subjectFocus,
      secondaryFocus: template.secondaryFocus ?? null,
      // Alias spec : requiredCharacters = mustShowCharacterIds
      requiredCharacters: mustShowCharacterIds,
      requiredCharacterIds: mustShowCharacterIds,
      mustShowCharacterIds,
      mayShowCharacterIds,
      mustShowEnemy: template.mustShowEnemy || (enemyFact !== undefined && idx === 0),
      requiredNpcCount: template.requiredNpcCount,
      requiredProps: required,
      optionalProps: optional,
      presenceObligations: [],
      requiredLocationSignals: beat.environmentContext ?? [],
      speakerAnchorCharacterId,
      speakerAnchorCharacterName: null,
      dialogueCarrier: template.dialogueCarrier,
      dialogueLinesAnchored: template.dialogueCarrier === "speaker_visible" ? 1 : 0,
      cutawayType: template.cutawayType,
      heroCenterAllowed: template.heroCenterAllowed,
      criticality: template.criticality,
      notes: [],
      requiredSubjects,
    });
  });

  return blueprints;
}

// ─── Focus Budget ─────────────────────────────────────────────────────────────

export function computeChapterFocusBudget(
  blueprints: PanelBlueprintPremium[],
): ChapterFocusBudget {
  const total = blueprints.length;
  if (total === 0) {
    return {
      totalPanels: 0,
      heroCenterRatio: 0,
      focusDistribution: {} as Record<SubjectFocus, number>,
      shotDistribution: {},
      cutawayCount: 0,
      cutawayRatio: 0,
      heroFocusPanels: 0,
      enemyFocusPanels: 0,
      propInsertPanels: 0,
      environmentPanels: 0,
      reactionPanels: 0,
      speakerPanels: 0,
      groupPanels: 0,
      cutawayPanels: 0,
      npcPanels: 0,
      violations: [],
    };
  }

  const focusCounts: Partial<Record<SubjectFocus, number>> = {};
  const shotCounts: Record<string, number> = {};
  let heroCenterCount = 0;
  let cutawayCount = 0;
  let enemyFocusCount = 0;
  let propInsertCount = 0;
  let environmentCount = 0;
  let npcCount = 0;
  let reactionCount = 0;
  let speakerCount = 0;
  let groupCount = 0;

  for (const bp of blueprints) {
    focusCounts[bp.subjectFocus] = (focusCounts[bp.subjectFocus] ?? 0) + 1;
    shotCounts[bp.shotType] = (shotCounts[bp.shotType] ?? 0) + 1;

    if (bp.heroCenterAllowed && bp.subjectFocus === "hero") heroCenterCount++;
    if (bp.cutawayType !== "none") cutawayCount++;
    if (bp.subjectFocus === "enemy") enemyFocusCount++;
    if (bp.subjectFocus === "prop" || bp.cutawayType === "prop_insert") propInsertCount++;
    if (bp.subjectFocus === "environment") environmentCount++;
    if (bp.subjectFocus === "npc" || bp.requiredNpcCount > 0) npcCount++;
    if (bp.subjectFocus === "reaction") reactionCount++;
    if (bp.subjectFocus === "speaker" || bp.dialogueCarrier === "speaker_visible") speakerCount++;
    if (bp.subjectFocus === "group" || bp.subjectFocus === "duo") groupCount++;
  }

  const heroCenterRatio = heroCenterCount / total;
  const cutawayRatio = cutawayCount / total;

  const violations: FocusBudgetViolation[] = [];

  // Règle : max 70% héros-centrique
  if (heroCenterRatio > 0.7) {
    violations.push({
      type: "hero_overload",
      message: `${Math.round(heroCenterRatio * 100)}% des panels sont centrés héros (max recommandé : 70%)`,
      severity: "blocking",
    });
  }

  // Règle : au moins 1 panel environnement par chapitre
  if (environmentCount === 0) {
    violations.push({
      type: "missing_environment",
      message: "Aucun panel environnement/décor dans le chapitre",
      severity: "blocking",
    });
  }

  // Règle : au moins 1 panel ennemi si ennemi présent
  const hasEnemyObligation = blueprints.some((bp) => bp.mustShowEnemy);
  if (hasEnemyObligation && enemyFocusCount === 0) {
    violations.push({
      type: "missing_enemy_focus",
      message: "Un ennemi est obligatoire mais aucun panel ne le met au focus",
      severity: "blocking",
    });
  }

  // Règle : au moins 1 prop insert si prop obligatoire
  const hasMandatoryProp = blueprints.some((bp) => bp.requiredProps.length > 0);
  if (hasMandatoryProp && propInsertCount === 0) {
    violations.push({
      type: "missing_prop_insert",
      message: "Des props obligatoires sont présents mais aucun panel prop/insert n'est prévu",
      severity: "warning",
    });
  }

  // Règle : au moins un cutaway
  if (cutawayCount === 0 && total > 3) {
    violations.push({
      type: "no_cutaway",
      message: "Aucun plan de coupe dans le chapitre",
      severity: "warning",
    });
  }

  // Règle : variété de plans
  const uniqueShots = Object.keys(shotCounts).length;
  if (uniqueShots < 3 && total >= 4) {
    violations.push({
      type: "shot_monotony",
      message: `Seulement ${uniqueShots} types de cadrage différents (min recommandé : 3)`,
      severity: "warning",
    });
  }

  return {
    totalPanels: total,
    heroCenterRatio,
    focusDistribution: focusCounts as Record<SubjectFocus, number>,
    shotDistribution: shotCounts,
    cutawayCount,
    cutawayRatio,
    heroFocusPanels: heroCenterCount,
    enemyFocusPanels: enemyFocusCount,
    propInsertPanels: propInsertCount,
    environmentPanels: environmentCount,
    reactionPanels: reactionCount,
    speakerPanels: speakerCount,
    groupPanels: groupCount,
    cutawayPanels: cutawayCount,
    npcPanels: npcCount,
    violations,
  };
}

// ─── Shot Variety Budget ──────────────────────────────────────────────────────

export interface ShotVarietyReport {
  hasWide: boolean;
  hasMedium: boolean;
  hasCloseup: boolean;
  hasInsert: boolean;
  hasOverShoulder: boolean;
  varietyScore: number;
  missingShots: string[];
}

export function computeShotVarietyBudget(
  blueprints: PanelBlueprintPremium[],
): ShotVarietyReport {
  const shots = new Set(blueprints.map((bp) => bp.shotType));
  const hasWide = shots.has("wide");
  const hasMedium = shots.has("medium");
  const hasCloseup = shots.has("closeup") || shots.has("extreme_closeup");
  const hasInsert = blueprints.some((bp) => bp.cutawayType === "prop_insert");
  const hasOverShoulder = shots.has("over_shoulder");

  const present = [hasWide, hasMedium, hasCloseup, hasInsert, hasOverShoulder].filter(Boolean).length;
  const varietyScore = present / 5;

  const missingShots: string[] = [];
  if (!hasWide) missingShots.push("wide");
  if (!hasMedium) missingShots.push("medium");
  if (!hasCloseup) missingShots.push("closeup");
  if (!hasInsert) missingShots.push("insert");
  if (!hasOverShoulder) missingShots.push("over_shoulder");

  return { hasWide, hasMedium, hasCloseup, hasInsert, hasOverShoulder, varietyScore, missingShots };
}

// ─── Cutaway Budget ───────────────────────────────────────────────────────────

export interface CutawayBudgetReport {
  totalCutaways: number;
  cutawayRatio: number;
  hasEnvironmentCutaway: boolean;
  hasEnemyCutaway: boolean;
  hasPropInsert: boolean;
  hasReactionCutaway: boolean;
  meetsMinimum: boolean;
  recommendations: string[];
}

export function computeCutawayBudget(
  blueprints: PanelBlueprintPremium[],
): CutawayBudgetReport {
  const total = blueprints.length;
  const cutaways = blueprints.filter((bp) => bp.cutawayType !== "none");
  const cutawayRatio = total > 0 ? cutaways.length / total : 0;

  const hasEnvironmentCutaway = cutaways.some((bp) => bp.cutawayType === "environment");
  const hasEnemyCutaway = cutaways.some((bp) => bp.cutawayType === "enemy");
  const hasPropInsert = cutaways.some((bp) => bp.cutawayType === "prop_insert");
  const hasReactionCutaway = cutaways.some((bp) => bp.cutawayType === "reaction");

  const meetsMinimum = cutawayRatio >= 0.2 && hasEnvironmentCutaway;

  const recommendations: string[] = [];
  if (!hasEnvironmentCutaway) recommendations.push("Ajouter au moins un plan décor/environnement");
  if (!hasEnemyCutaway && blueprints.some((bp) => bp.mustShowEnemy)) {
    recommendations.push("Ajouter un plan ennemi (mustShowEnemy détecté)");
  }
  if (!hasPropInsert && blueprints.some((bp) => bp.requiredProps.length > 0)) {
    recommendations.push("Ajouter un insert prop (props obligatoires détectés)");
  }
  if (!hasReactionCutaway && total > 4) {
    recommendations.push("Ajouter un plan de réaction pour équilibrer");
  }

  return {
    totalCutaways: cutaways.length,
    cutawayRatio,
    hasEnvironmentCutaway,
    hasEnemyCutaway,
    hasPropInsert,
    hasReactionCutaway,
    meetsMinimum,
    recommendations,
  };
}

// ─── Score de premium readiness ───────────────────────────────────────────────

export function computePremiumReadinessScore(
  blueprints: PanelBlueprintPremium[],
): number {
  if (blueprints.length === 0) return 0;

  const budget = computeChapterFocusBudget(blueprints);
  const shotVariety = computeShotVarietyBudget(blueprints);
  const cutaway = computeCutawayBudget(blueprints);

  let score = 1.0;

  // Pénalités pour violations bloquantes
  const blockingViolations = budget.violations.filter((v) => v.severity === "blocking").length;
  score -= blockingViolations * 0.15;

  // Pénalités pour violations warnings
  const warningViolations = budget.violations.filter((v) => v.severity === "warning").length;
  score -= warningViolations * 0.05;

  // Bonus variété de plans
  score += shotVariety.varietyScore * 0.1;

  // Bonus cutaways
  if (cutaway.meetsMinimum) score += 0.05;

  return Math.max(0, Math.min(1, score));
}

// ─── Gore Directives ────────────────────────────────────────────────────────

export function buildGoreDirectives(intensityLayer: string, beatType: string): string {
  if (!["MATURE_VISUAL", "ADULT_EXPLICIT"].includes(intensityLayer)) return "";
  const goreLevel = intensityLayer === "ADULT_EXPLICIT" ? "explicit" : "implied";
  if (goreLevel === "implied") {
    return "Gore implicite autorisé : blessures visibles mais non étalées, sang présent sans excès, priorité à l'expression émotionnelle.";
  }
  return "Gore explicite autorisé (dark fantasy). Blessures anatomiques stylisées manga. Le sang suit la dynamique du panel. Pas de complaisance gratuite. Lisibilité prioritaire." +
    (beatType === "silent_aftermath" ? " Aftermath seulement — pas de violence active." : "");
}
