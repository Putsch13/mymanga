/**
 * Inférence des `NarrativeFact` pour un beat unique.
 *
 * Combine les patterns de `dictionaries.ts`, les helpers sémantiques
 * (`semantic-helpers.ts`), l'extraction de props (`prop-candidates.ts`) et
 * l'enrichissement async optionnel (`narrative-fact-llm-enricher`).
 */
import type { NarrativeFact, ProductionBeat } from "@manga-ai-studio/core";
import { inferAdditionalFactsFromSemantics } from "../narrative-fact-llm-enricher";
import {
  ACTION_VERBS,
  CONFRONTATION_SIGNALS,
  CROWD_SIGNALS,
  DIALOGUE_VERBS,
  MAGIC_SIGNALS,
  MOVEMENT_VERBS,
  PROP_USAGE_VERBS,
  REACTION_SIGNALS,
  REVEAL_SIGNALS,
  THREAT_VERBS,
} from "./dictionaries";
import { extractPropCandidatesFromText } from "./prop-candidates";
import {
  generateId,
  hasCommunicationSignal,
  hasHackingSignal,
  hasMedicalSignal,
  hasMysticalSignal,
  matchesAny,
} from "./semantic-helpers";
import type { NarrativeExtractionContext } from "./types";

export function inferNarrativeFactsFromBeat(
  beat: ProductionBeat,
  context: NarrativeExtractionContext,
): NarrativeFact[] {
  const facts: NarrativeFact[] = [];
  const text = [
    beat.summary,
    beat.narrativeFunction,
    beat.whyThisBeatExists,
    beat.dramaticChange,
    ...(beat.environmentContext ?? []),
  ]
    .filter(Boolean)
    .join(" ");

  let idx = 0;

  if (matchesAny(text, ACTION_VERBS)) {
    facts.push({
      id: generateId("fact_action", beat.beatId, idx++),
      beatId: beat.beatId,
      type: "action",
      actorIds: beat.involvedCharacters ?? [],
      targetIds: [],
      propCandidates: [],
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: "must_show",
      evidenceStrength: 0.85,
      source: "inference",
      notes: ["action verbs detected in beat summary"],
    });
  }

  if (matchesAny(text, THREAT_VERBS)) {
    facts.push({
      id: generateId("fact_threat", beat.beatId, idx++),
      beatId: beat.beatId,
      type: "threat",
      actorIds: beat.involvedCharacters ?? [],
      targetIds: [],
      propCandidates: [],
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: "must_show",
      evidenceStrength: 0.9,
      source: "inference",
      notes: ["threat verbs detected"],
    });
  }

  if (matchesAny(text, DIALOGUE_VERBS)) {
    facts.push({
      id: generateId("fact_dialogue", beat.beatId, idx++),
      beatId: beat.beatId,
      type: "dialogue",
      actorIds: beat.involvedCharacters ?? [],
      targetIds: [],
      propCandidates: [],
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: "must_show",
      evidenceStrength: 0.8,
      source: "inference",
      notes: ["dialogue verbs detected"],
    });
  }

  const hasPropUsage =
    matchesAny(text, PROP_USAGE_VERBS) ||
    hasCommunicationSignal(text) ||
    hasHackingSignal(text) ||
    hasMedicalSignal(text) ||
    hasMysticalSignal(text);

  if (hasPropUsage) {
    const propCandidates = extractPropCandidatesFromText(text, context);
    if (hasCommunicationSignal(text) && !propCandidates.includes("phone")) {
      propCandidates.push("phone");
    }
    if (hasHackingSignal(text) && !propCandidates.includes("laptop")) {
      propCandidates.push("laptop");
    }
    facts.push({
      id: generateId("fact_prop_usage", beat.beatId, idx++),
      beatId: beat.beatId,
      type: "prop_usage",
      actorIds: beat.involvedCharacters ?? [],
      targetIds: [],
      propCandidates,
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: "must_show",
      evidenceStrength: 0.75,
      source: "inference",
      notes: [
        "prop usage detected",
        ...(hasCommunicationSignal(text) ? ["communication signal"] : []),
        ...(hasHackingSignal(text) ? ["hacking signal"] : []),
        ...(hasMedicalSignal(text) ? ["medical signal"] : []),
        ...(hasMysticalSignal(text) ? ["mystical signal"] : []),
      ],
    });
  }

  if (matchesAny(text, MOVEMENT_VERBS)) {
    facts.push({
      id: generateId("fact_movement", beat.beatId, idx++),
      beatId: beat.beatId,
      type: "movement",
      actorIds: beat.involvedCharacters ?? [],
      targetIds: [],
      propCandidates: [],
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: "may_show",
      evidenceStrength: 0.7,
      source: "inference",
    });
  }

  if (matchesAny(text, REVEAL_SIGNALS)) {
    facts.push({
      id: generateId("fact_reveal", beat.beatId, idx++),
      beatId: beat.beatId,
      type: "reveal",
      actorIds: beat.involvedCharacters ?? [],
      targetIds: [],
      propCandidates: extractPropCandidatesFromText(text, context),
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: "must_show",
      evidenceStrength: 0.9,
      source: "inference",
      notes: ["reveal signal detected"],
    });
    facts.push({
      id: generateId("fact_reaction", beat.beatId, idx++),
      beatId: beat.beatId,
      type: "emotional_reaction",
      actorIds: beat.involvedCharacters ?? [],
      targetIds: [],
      propCandidates: [],
      locationSignals: [],
      requiredVisibility: "must_show",
      evidenceStrength: 0.8,
      source: "inference",
    });
  }

  if (matchesAny(text, REACTION_SIGNALS)) {
    facts.push({
      id: generateId("fact_reaction_emo", beat.beatId, idx++),
      beatId: beat.beatId,
      type: "reaction",
      actorIds: beat.involvedCharacters ?? [],
      targetIds: [],
      propCandidates: [],
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: "must_show",
      evidenceStrength: 0.8,
      source: "inference",
      notes: ["emotional reaction signal detected"],
    });
  }

  if (matchesAny(text, CONFRONTATION_SIGNALS)) {
    facts.push({
      id: generateId("fact_enemy", beat.beatId, idx++),
      beatId: beat.beatId,
      type: "enemy_presence",
      actorIds: beat.involvedCharacters ?? [],
      targetIds: [],
      propCandidates: [],
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: "must_show",
      evidenceStrength: 0.95,
      source: "inference",
      notes: ["confrontation signal detected"],
    });
  }

  if (matchesAny(text, MAGIC_SIGNALS)) {
    facts.push({
      id: generateId("fact_magic", beat.beatId, idx++),
      beatId: beat.beatId,
      type: "reveal",
      actorIds: beat.involvedCharacters ?? [],
      targetIds: [],
      propCandidates: ["magic_aura", "energy_blast", "magical_glow"],
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: "must_show",
      evidenceStrength: 0.9,
      source: "inference",
      notes: ["magic/supernatural signal detected"],
    });
  }

  if (matchesAny(text, CROWD_SIGNALS)) {
    facts.push({
      id: generateId("fact_npc", beat.beatId, idx++),
      beatId: beat.beatId,
      type: "npc_presence",
      actorIds: [],
      targetIds: [],
      propCandidates: [],
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: "may_show",
      evidenceStrength: 0.8,
      source: "inference",
      notes: ["crowd/public scene detected"],
    });
  }

  // Garde hostile : noms de gardes + contexte de confrontation, si on n'a pas
  // déjà émis un fact `enemy_presence`.
  const guardNouns =
    /(gardes?|guards?|soldats?|soldiers?|milice|militia|police|gendarmes?|sécurité)/i;
  const hostileContext = matchesAny(text, CONFRONTATION_SIGNALS);
  const hasHostileGuard = guardNouns.test(text) && hostileContext;

  if (hasHostileGuard && !facts.some((f) => f.type === "enemy_presence")) {
    facts.push({
      id: generateId("fact_hostile_guard", beat.beatId, idx++),
      beatId: beat.beatId,
      type: "enemy_presence",
      actorIds: beat.involvedCharacters ?? [],
      targetIds: [],
      propCandidates: [],
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: "must_show",
      evidenceStrength: 0.9,
      source: "inference",
      notes: ["hostile guard context: guard noun + confrontation signal"],
    });
  }

  if ((beat.environmentContext?.length ?? 0) > 0) {
    facts.push({
      id: generateId("fact_location", beat.beatId, idx++),
      beatId: beat.beatId,
      type: "location_signal",
      actorIds: [],
      targetIds: [],
      propCandidates: [],
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: "may_show",
      evidenceStrength: 0.7,
      source: "outline",
    });
  }

  if (context.recentContinuityEvents) {
    for (const event of context.recentContinuityEvents) {
      const gained = event.entities?.objectsGained ?? [];
      const lost = event.entities?.objectsLost ?? [];
      if (gained.length > 0 || lost.length > 0) {
        facts.push({
          id: generateId("fact_continuity_prop", beat.beatId, idx++),
          beatId: beat.beatId,
          type: "prop_transfer",
          actorIds: beat.involvedCharacters ?? [],
          targetIds: [],
          propCandidates: [...gained, ...lost],
          locationSignals: [],
          requiredVisibility: "may_show",
          evidenceStrength: 0.85,
          source: "continuity",
          notes: [
            ...(gained.length > 0 ? [`objects gained: ${gained.join(", ")}`] : []),
            ...(lost.length > 0 ? [`objects lost: ${lost.join(", ")}`] : []),
          ],
        });
      }
    }
  }

  // Couche 2 : analyse sémantique légère (formes passives, expressions
  // idiomatiques, noms d'objets sans verbe d'usage).
  const semanticFacts = inferAdditionalFactsFromSemantics(beat, facts);
  facts.push(...semanticFacts);

  return facts;
}
