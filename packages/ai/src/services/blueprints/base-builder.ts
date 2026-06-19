/**
 * Constructeur de Panel Blueprints Premium (noyau).
 *
 * Prend un ProductionBeat + facts + props et produit la liste des
 * PanelBlueprintPremium correspondant au beat. Delegue la taxonomy des shots
 * a `panel-templates.ts` et l'enrichissement a `blueprint-enrichment.ts`.
 */

import type {
  PanelBlueprintPremium,
  SubjectFocus,
  NarrativeFact,
  RequiredProp,
  ProductionBeat,
} from "@manga-ai-studio/core";

import {
  detectBeatType,
  getTemplatesForBeatType,
  type PanelTemplate,
} from "./panel-templates";

export interface PanelBlueprintContext {
  heroCharacterId?: string | null;
  chapterNumber?: number;
  projectGenre?: string | null;
  projectTone?: string | null;
  antagonistNames?: string[];
  antagonistIds?: string[];
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
