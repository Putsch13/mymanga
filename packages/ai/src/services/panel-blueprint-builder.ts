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
import { MANGA_SHOT_BUDGET } from "@manga-ai-studio/core";

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
        // BUG-06 fix : pour les focus non-hero (environment, npc, prop, reaction,
        // aftermath…), filtrer activement le héros du fallback mayShowCharacterIds.
        // Sinon, involvedCharacters commence presque toujours par le héros et on
        // lock quand même dessus — ce qui trahit l'intention du subjectFocus.
        const nonHeroInvolved = context.heroCharacterId
          ? beat.involvedCharacters.filter((id) => id !== context.heroCharacterId)
          : beat.involvedCharacters;

        // Les focus strictement non-humains ne doivent montrer aucun personnage imposé.
        const purelyNonHumanFocus: SubjectFocus[] = ["environment", "prop", "aftermath"];
        if (purelyNonHumanFocus.includes(focus)) {
          mayShowCharacterIds.push(...nonHeroInvolved.slice(0, 1));
        } else {
          mayShowCharacterIds.push(...nonHeroInvolved.slice(0, 3));
        }
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

    // P4.1 : marquage automatique des panels contractuellement critiques.
    // Sont considérés "contractualCritical" :
    //   - reveal d'ennemi (cutawayType === "enemy_reveal" ou mustShowEnemy)
    //   - plan d'établissement décor (subjectFocus=environment avec shotType=wide)
    //   - insert prop / arme (cutawayType=prop_insert ou subjectFocus=prop)
    //   - scènes foule / groupe (requiredNpcCount > 0 ou subjectFocus=group/npc)
    //   - panel avec props obligatoires (required.length > 0)
    const contractualCritical = (
      (template.mustShowEnemy || template.cutawayType === "enemy_reveal") ||
      (template.subjectFocus === "environment" && template.shotType === "wide") ||
      (template.cutawayType === "prop_insert" || template.subjectFocus === "prop") ||
      (template.requiredNpcCount > 0 || template.subjectFocus === "npc" || template.subjectFocus === "group") ||
      required.length > 0
    );

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
      contractualCritical,
      notes: [],
      requiredSubjects,
    });
  });

  return blueprints;
}

// ─── Minimum-panels enforcement ───────────────────────────────────────────────

/**
 * READ-PREMIUM : Étend un array de blueprints existant jusqu'à un nombre minimum (75
 * par défaut) en ajoutant des panels cutaway / reaction / environment dérivés des
 * beats déjà présents. Les nouveaux panels prennent comme gabarit les blueprints
 * existants (même beatId, même casting de fond) mais varient shot + focus pour
 * enrichir le rendu sans dupliquer bêtement la même case.
 *
 * Sans cette fonction, un chapitre avec ~10 beats produit ~30 blueprints et la DB
 * n'a que 30 SceneImage → 30 cases dans le reader, bien en dessous des 75 images
 * promises au user (c'est le bug "je ne vois que ~8 cases").
 */
export function expandBlueprintsToMinimum(
  blueprints: PanelBlueprintPremium[],
  minimumPanels: number,
): PanelBlueprintPremium[] {
  if (blueprints.length >= minimumPanels || blueprints.length === 0) {
    return blueprints;
  }

  // Cycle de "variants" qui enrichissent le chapitre : plans de coupe, reactions,
  // gros plans d'environnement, inserts de props. Alignés avec les violations
  // possibles de `computeChapterFocusBudget` pour éviter d'en créer.
  const variants: Array<{
    shotType: string;
    subjectFocus: SubjectFocus;
    cameraAngle: string;
    cutawayType: CutawayType;
    purpose: string;
  }> = [
    { shotType: "wide", subjectFocus: "environment", cameraAngle: "eye_level", cutawayType: "environment", purpose: "environment establish — no hero" },
    { shotType: "closeup", subjectFocus: "reaction", cameraAngle: "eye_level", cutawayType: "reaction", purpose: "emotion beat — reaction shot" },
    { shotType: "extreme_closeup", subjectFocus: "prop", cameraAngle: "eye_level", cutawayType: "prop_insert", purpose: "prop / object insert" },
    { shotType: "medium", subjectFocus: "npc", cameraAngle: "eye_level", cutawayType: "crowd", purpose: "npc context shot" },
    { shotType: "wide", subjectFocus: "aftermath", cameraAngle: "low_angle", cutawayType: "aftermath", purpose: "aftermath / transition shot" },
    { shotType: "over_shoulder", subjectFocus: "duo", cameraAngle: "eye_level", cutawayType: "none", purpose: "over-shoulder reaction shot" },
  ];

  const result: PanelBlueprintPremium[] = [...blueprints];
  // Répartir les panels ajoutés en round-robin sur les beats pour ne pas concentrer
  // l'enrichissement sur un seul beat.
  let seedIndex = 0;
  let variantIndex = 0;
  while (result.length < minimumPanels) {
    const seed = blueprints[seedIndex % blueprints.length];
    const variant = variants[variantIndex % variants.length];
    const idxSuffix = result.length + 1;

    result.push({
      ...seed,
      panelId: `panel_${seed.beatId}_enrich_${idxSuffix}`,
      panelIndex: idxSuffix - 1,
      panelNumber: idxSuffix,
      shotType: variant.shotType,
      subjectFocus: variant.subjectFocus,
      cameraAngle: variant.cameraAngle,
      cutawayType: variant.cutawayType,
      purpose: variant.purpose,
      heroCenterAllowed: false,
      mustShowEnemy: false,
      requiredNpcCount: variant.subjectFocus === "npc" ? Math.max(1, seed.requiredNpcCount) : 0,
      dialogueCarrier: "narration",
      dialogueLinesAnchored: 0,
      speakerAnchorCharacterId: null,
      speakerAnchorCharacterName: null,
      mustShowCharacterIds: variant.subjectFocus === "environment" || variant.subjectFocus === "prop" ? [] : (seed.mustShowCharacterIds ?? []).slice(0, 1),
      mayShowCharacterIds: variant.subjectFocus === "environment" || variant.subjectFocus === "prop" ? [] : (seed.mayShowCharacterIds ?? []).slice(0, 2),
      requiredCharacters: variant.subjectFocus === "environment" || variant.subjectFocus === "prop" ? [] : (seed.requiredCharacters ?? []).slice(0, 1),
      requiredCharacterIds: variant.subjectFocus === "environment" || variant.subjectFocus === "prop" ? [] : (seed.requiredCharacterIds ?? []).slice(0, 1),
      notes: [...(seed.notes ?? []), "auto-enriched to reach premium minimum"],
    });

    variantIndex += 1;
    // Change de beat seed tous les 2 variants pour diversifier la source
    if (variantIndex % 2 === 0) {
      seedIndex += 1;
    }
  }

  // Renumérote proprement panelNumber/panelIndex pour ordre séquentiel global
  return result.map((bp, idx) => ({
    ...bp,
    panelIndex: idx,
    panelNumber: idx + 1,
  }));
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
    // P1.6 : un panel compte comme couverture NPC seulement si son focus l'est
    // réellement (subjectFocus=npc|group). Un blueprint héros avec
    // `requiredNpcCount>0` exprime une obligation, pas une satisfaction.
    if (bp.subjectFocus === "npc" || bp.subjectFocus === "group") npcCount++;
    if (bp.subjectFocus === "reaction") reactionCount++;
    if (bp.subjectFocus === "speaker" || bp.dialogueCarrier === "speaker_visible") speakerCount++;
    if (bp.subjectFocus === "group" || bp.subjectFocus === "duo") groupCount++;
  }

  const heroCenterRatio = heroCenterCount / total;
  const cutawayRatio = cutawayCount / total;

  const violations: FocusBudgetViolation[] = [];

  // BUG-03 fix : aligner le seuil sur MANGA_SHOT_BUDGET (packages/core)
  // - MAX_HERO_CENTER_RATIO (0.30) → warning
  // - HERO_CENTER_FAIL_RATIO (0.70) → blocking
  // Avant, le focus-budget ne flaguait qu'à 70%, alors que le shot-diversity-enforcer
  // corrigeait déjà à partir de 30%. Les deux politiques étaient désalignées.
  if (heroCenterRatio > MANGA_SHOT_BUDGET.MAX_HERO_CENTER_RATIO) {
    violations.push({
      type: "hero_overload",
      message: `${Math.round(heroCenterRatio * 100)}% des panels sont centrés héros (max recommandé : ${Math.round(MANGA_SHOT_BUDGET.MAX_HERO_CENTER_RATIO * 100)}%)`,
      severity: heroCenterRatio >= MANGA_SHOT_BUDGET.HERO_CENTER_FAIL_RATIO ? "blocking" : "warning",
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

  // P1.5 : arme / objet narratif critique (mustBeVisible === true) — on exige
  // un insert fort (subjectFocus=prop OU cutawayType=prop_insert). Sinon une
  // arme utilisée "hors champ" passe à travers le plan.
  const hasMustBeVisibleProp = blueprints.some(
    (bp) => Array.isArray(bp.requiredProps) && bp.requiredProps.some((p) => p.mustBeVisible === true),
  );
  const hasPropInsertTarget = blueprints.some(
    (bp) => bp.subjectFocus === "prop" || bp.cutawayType === "prop_insert",
  );
  if (hasMustBeVisibleProp && !hasPropInsertTarget) {
    violations.push({
      type: "missing_weapon_insert",
      message:
        "Une arme/objet narratif (mustBeVisible) est présent mais aucun panel ne lui est dédié en insert.",
      severity: "blocking",
    });
  }

  // P1.6 : si au moins un blueprint porte une obligation foule/PNJ
  // (requiredNpcCount > 0 via template, ou subjectFocus=npc/group), au moins un
  // panel doit réellement couvrir cette foule.
  const hasNpcObligation = blueprints.some(
    (bp) => bp.requiredNpcCount > 0 || bp.subjectFocus === "npc" || bp.subjectFocus === "group",
  );
  if (hasNpcObligation && npcCount === 0) {
    violations.push({
      type: "missing_npc_population",
      message:
        "Une scène de foule/PNJ est attendue mais aucun panel ne la met en scène.",
      severity: "blocking",
    });
  }

  // P1.7 : establishing shot manquant pour un chapitre qui déclare plusieurs
  // lieux dans ses `requiredLocationSignals`. Minimum attendu : 1 wide +
  // environment par signal majeur. On garde cette règle "soft" (warning)
  // pour éviter de bloquer systématiquement les chapitres huis-clos.
  const distinctLocations = new Set<string>();
  for (const bp of blueprints) {
    for (const signal of bp.requiredLocationSignals ?? []) {
      if (typeof signal === "string" && signal.trim().length > 0) {
        distinctLocations.add(signal.trim().toLowerCase());
      }
    }
  }
  const establishingShots = blueprints.filter(
    (bp) => bp.subjectFocus === "environment" && bp.shotType === "wide",
  ).length;
  if (distinctLocations.size >= 2 && establishingShots === 0) {
    violations.push({
      type: "missing_environment_establishing",
      message:
        `${distinctLocations.size} lieux sont mentionnés mais aucun plan d'établissement (wide + environment) n'est prévu.`,
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

// ─── Contractual Focus Adequacy (P1.3 + P3.1) ────────────────────────────────

/**
 * P3.1 — `computeShotVarietyBudget` mesure la variété des CADRAGES mais ignore
 * la variété des SUJETS. Un chapitre peut avoir wide/medium/closeup/insert
 * variés tout en restant 100% héros-centré. Cette fonction scrute explicitement
 * les inserts contractuels (arme, décor, PNJ, ennemi, aftermath, reaction)
 * pour bloquer ce biais.
 *
 * Score = nombre de contrats respectés / total des contrats actifs.
 * `blocking = true` si au moins un contrat dur (enemy, props, env) est cassé.
 */
export interface ContractualFocusAdequacyReport {
  score: number;
  environmentPanels: number;
  propInsertPanels: number;
  enemyFocusPanels: number;
  npcPanels: number;
  reactionPanels: number;
  aftermathPanels: number;
  heroCenterRatio: number;
  violations: Array<{
    type:
      | "missing_environment"
      | "missing_enemy_focus"
      | "missing_prop_insert"
      | "missing_npc_population"
      | "hero_overload_vs_contract";
    message: string;
    severity: "warning" | "blocking";
  }>;
  blocking: boolean;
}

export function computeContractualFocusAdequacy(
  blueprints: PanelBlueprintPremium[],
): ContractualFocusAdequacyReport {
  const total = blueprints.length;
  if (total === 0) {
    return {
      score: 0,
      environmentPanels: 0,
      propInsertPanels: 0,
      enemyFocusPanels: 0,
      npcPanels: 0,
      reactionPanels: 0,
      aftermathPanels: 0,
      heroCenterRatio: 0,
      violations: [],
      blocking: false,
    };
  }

  let environmentPanels = 0;
  let propInsertPanels = 0;
  let enemyFocusPanels = 0;
  let npcPanels = 0;
  let reactionPanels = 0;
  let aftermathPanels = 0;
  let heroCenterCount = 0;

  let hasEnemyObligation = false;
  let hasMandatoryProp = false;
  let hasNpcObligation = false;

  for (const bp of blueprints) {
    if (bp.subjectFocus === "environment") environmentPanels++;
    if (bp.subjectFocus === "prop" || bp.cutawayType === "prop_insert") propInsertPanels++;
    if (bp.subjectFocus === "enemy") enemyFocusPanels++;
    if (bp.subjectFocus === "npc" || bp.subjectFocus === "group" || bp.requiredNpcCount > 0) npcPanels++;
    if (bp.subjectFocus === "reaction") reactionPanels++;
    if (bp.subjectFocus === "aftermath") aftermathPanels++;
    if (bp.heroCenterAllowed && bp.subjectFocus === "hero") heroCenterCount++;

    if (bp.mustShowEnemy) hasEnemyObligation = true;
    if (bp.requiredProps && bp.requiredProps.length > 0) hasMandatoryProp = true;
    if (bp.requiredNpcCount > 0) hasNpcObligation = true;
  }

  const heroCenterRatio = heroCenterCount / total;
  const violations: ContractualFocusAdequacyReport["violations"] = [];

  if (environmentPanels === 0 && total > 3) {
    violations.push({
      type: "missing_environment",
      message: "Aucun panel environnement/décor n'est prévu pour ce chapitre.",
      severity: "blocking",
    });
  }
  if (hasEnemyObligation && enemyFocusPanels === 0) {
    violations.push({
      type: "missing_enemy_focus",
      message: "Un ennemi est obligatoire mais aucun panel ne le met au focus.",
      severity: "blocking",
    });
  }
  if (hasMandatoryProp && propInsertPanels === 0) {
    violations.push({
      type: "missing_prop_insert",
      message: "Un prop/arme obligatoire est présent mais jamais dédié à un insert.",
      severity: "blocking",
    });
  }
  if (hasNpcObligation && npcPanels === 0) {
    violations.push({
      type: "missing_npc_population",
      message: "Une scène de foule/PNJ est attendue mais aucun panel ne la couvre.",
      severity: "blocking",
    });
  }
  if (heroCenterRatio > MANGA_SHOT_BUDGET.HERO_CENTER_FAIL_RATIO) {
    violations.push({
      type: "hero_overload_vs_contract",
      message:
        `${Math.round(heroCenterRatio * 100)}% des panels sont centrés héros — ` +
        `le plan est trop égocentré pour laisser vivre le décor / PNJ / inserts.`,
      severity: "blocking",
    });
  }

  const totalContracts = [
    hasEnemyObligation,
    hasMandatoryProp,
    hasNpcObligation,
    true, // environment target — toujours attendu
    true, // hero-ratio — toujours attendu
  ].filter(Boolean).length;
  const respectedContracts = totalContracts - violations.filter((v) => v.severity === "blocking").length;
  const score = totalContracts > 0 ? Math.max(0, Math.min(1, respectedContracts / totalContracts)) : 1;

  return {
    score,
    environmentPanels,
    propInsertPanels,
    enemyFocusPanels,
    npcPanels,
    reactionPanels,
    aftermathPanels,
    heroCenterRatio,
    violations,
    blocking: violations.some((v) => v.severity === "blocking"),
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
