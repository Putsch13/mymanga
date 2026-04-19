/**
 * P2.2 — Continuity diff ledger.
 *
 * Fonction pure qui compare deux snapshots `CharacterState[]` (chapitre
 * précédent vs chapitre courant) et produit un journal STRUCTURÉ des diffs :
 * injuries, outfit, relations, possessions, émotion, lieu.
 *
 * Avant ce ledger :
 *   - `run-continuity-diff.ts` ne comparait que les traits visuels verrouillés
 *     (hair/eye/silhouette) et un heuristique injury très grossier.
 *   - outfit_drift / relationship_drift étaient marqués `TODO`.
 *   - Aucun caller ne pouvait inspecter la nature précise d'un changement
 *     pour décider d'une action (retry, repair auto, validation humaine).
 *
 * Avec ce ledger :
 *   - chaque diff est une entrée typée avec `severity`, `justified` (flag qui
 *     indique qu'un `EventLedgerEntry` justifie le changement), `reason`.
 *   - les callers (`runContinuityDiff`, QA pass, repair pass) construisent
 *     des `ContinuityIssue` ciblés sans réinventer la comparaison.
 *
 * Fonction PURE : pas d'accès DB, pas de log global. Callsite responsable de
 * charger les snapshots et de persister les findings.
 */

import type { CharacterState, EventLedgerEntry } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────

export type ContinuityDiffEntryType =
  | "injury_appeared"
  | "injury_disappeared"
  | "outfit_changed"
  | "outfit_reset"
  | "relationship_emerged"
  | "relationship_shifted"
  | "relationship_dropped"
  | "possession_acquired"
  | "possession_lost"
  | "emotion_changed"
  | "location_changed"
  | "objective_changed";

export interface ContinuityDiffEntry {
  type: ContinuityDiffEntryType;
  characterId: string;
  /** Autre personnage impliqué (relationship uniquement). */
  targetCharacterId?: string | null;
  fromValue: string | null;
  toValue: string | null;
  severity: "minor" | "major" | "critical";
  /**
   * Vrai si un `EventLedgerEntry` justifie explicitement le changement
   * (ex. `injuriesResolved` mentionne la blessure qui disparaît).
   */
  justified: boolean;
  reason: string;
}

export interface ContinuityDiffLedger {
  entries: ContinuityDiffEntry[];
  perCharacter: Record<string, ContinuityDiffEntry[]>;
  summary: {
    totalEntries: number;
    unjustifiedCount: number;
    injuryDiffs: number;
    outfitDiffs: number;
    relationshipDiffs: number;
    possessionDiffs: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function normalizeLabel(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

function equalsLabel(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeLabel(a) === normalizeLabel(b);
}

function eventsResolvedInjuries(events: EventLedgerEntry[] | undefined, characterId: string): Set<string> {
  if (!events || events.length === 0) return new Set();
  const resolved = new Set<string>();
  for (const event of events) {
    if (!event.actorIds || event.actorIds.length === 0 || event.actorIds.includes(characterId)) {
      for (const injury of event.injuriesResolved ?? []) {
        resolved.add(normalizeLabel(injury));
      }
    }
  }
  return resolved;
}

function eventsAppliedInjuries(events: EventLedgerEntry[] | undefined, characterId: string): Set<string> {
  if (!events || events.length === 0) return new Set();
  const applied = new Set<string>();
  for (const event of events) {
    if (!event.actorIds || event.actorIds.length === 0 || event.actorIds.includes(characterId)) {
      for (const injury of event.injuriesApplied ?? []) {
        applied.add(normalizeLabel(injury));
      }
    }
  }
  return applied;
}

function eventsOutfitChanges(events: EventLedgerEntry[] | undefined, characterId: string): boolean {
  if (!events || events.length === 0) return false;
  for (const event of events) {
    const relevant = !event.actorIds || event.actorIds.length === 0 || event.actorIds.includes(characterId);
    if (!relevant) continue;
    const flags = [...(event.continuityFlags ?? []), event.eventType];
    if (flags.some((f) => /outfit|costume|uniform|disguise/.test(f.toLowerCase()))) return true;
  }
  return false;
}

function eventsLocationChanges(events: EventLedgerEntry[] | undefined, characterId: string): boolean {
  if (!events || events.length === 0) return false;
  for (const event of events) {
    const relevant = !event.actorIds || event.actorIds.length === 0 || event.actorIds.includes(characterId);
    if (!relevant) continue;
    if (event.eventType === "location_change" || event.eventType === "travel") return true;
  }
  return false;
}

// ─── Diff computation ─────────────────────────────────────────────────────

function diffInjuries(
  prev: CharacterState,
  curr: CharacterState,
  events: EventLedgerEntry[] | undefined,
): ContinuityDiffEntry[] {
  const entries: ContinuityDiffEntry[] = [];
  const prevInjuries = (prev.currentState.injuries ?? []).map(normalizeLabel).filter(Boolean);
  const currInjuries = (curr.currentState.injuries ?? []).map(normalizeLabel).filter(Boolean);
  const resolvedByEvents = eventsResolvedInjuries(events, curr.characterId);
  const appliedByEvents = eventsAppliedInjuries(events, curr.characterId);

  const prevSet = new Set(prevInjuries);
  const currSet = new Set(currInjuries);

  for (const inj of currInjuries) {
    if (!prevSet.has(inj)) {
      const justified = appliedByEvents.has(inj);
      entries.push({
        type: "injury_appeared",
        characterId: curr.characterId,
        fromValue: null,
        toValue: inj,
        severity: justified ? "minor" : "major",
        justified,
        reason: justified ? "event_injuries_applied" : "injury_without_event",
      });
    }
  }
  for (const inj of prevInjuries) {
    if (!currSet.has(inj)) {
      const justified = resolvedByEvents.has(inj);
      entries.push({
        type: "injury_disappeared",
        characterId: curr.characterId,
        fromValue: inj,
        toValue: null,
        severity: justified ? "minor" : "major",
        justified,
        reason: justified ? "event_injuries_resolved" : "injury_vanished_without_event",
      });
    }
  }
  return entries;
}

function diffOutfit(
  prev: CharacterState,
  curr: CharacterState,
  events: EventLedgerEntry[] | undefined,
): ContinuityDiffEntry[] {
  const entries: ContinuityDiffEntry[] = [];
  const prevOutfit = prev.currentState.outfit ?? null;
  const currOutfit = curr.currentState.outfit ?? null;
  if (equalsLabel(prevOutfit, currOutfit)) return entries;

  const allowedVariations = new Set(
    [
      curr.physicalCanon.baselineOutfit,
      ...(curr.physicalCanon.allowedOutfitVariations ?? []),
    ]
      .filter(Boolean)
      .map((v) => normalizeLabel(v)),
  );
  const baselineNormalized = normalizeLabel(curr.physicalCanon.baselineOutfit);
  const currOutfitNormalized = normalizeLabel(currOutfit);
  const prevOutfitNormalized = normalizeLabel(prevOutfit);

  const isAllowedVariation = currOutfitNormalized && allowedVariations.has(currOutfitNormalized);
  const justifiedByEvent = eventsOutfitChanges(events, curr.characterId);

  // Reset vers la baseline = changement "normal" (severity minor).
  const isReset = baselineNormalized
    && currOutfitNormalized === baselineNormalized
    && prevOutfitNormalized !== baselineNormalized;

  entries.push({
    type: isReset ? "outfit_reset" : "outfit_changed",
    characterId: curr.characterId,
    fromValue: prevOutfit,
    toValue: currOutfit,
    severity:
      isAllowedVariation || justifiedByEvent || isReset ? "minor" : "major",
    justified: isAllowedVariation || justifiedByEvent || isReset,
    reason: isAllowedVariation
      ? "outfit_in_allowed_variations"
      : justifiedByEvent
        ? "event_costume_change"
        : isReset
          ? "outfit_reset_to_baseline"
          : "outfit_change_without_justification",
  });
  return entries;
}

function diffRelationships(
  prev: CharacterState,
  curr: CharacterState,
): ContinuityDiffEntry[] {
  const entries: ContinuityDiffEntry[] = [];
  const prevByTarget = new Map(
    (prev.relationshipStates ?? []).map((r) => [r.targetCharacterId, r]),
  );
  const currByTarget = new Map(
    (curr.relationshipStates ?? []).map((r) => [r.targetCharacterId, r]),
  );

  for (const [targetId, currRel] of currByTarget) {
    const prevRel = prevByTarget.get(targetId);
    if (!prevRel) {
      entries.push({
        type: "relationship_emerged",
        characterId: curr.characterId,
        targetCharacterId: targetId,
        fromValue: null,
        toValue: currRel.note ?? JSON.stringify({ trust: currRel.trust, tension: currRel.tension }),
        severity: "minor",
        justified: true,
        reason: "new_relationship_edge",
      });
      continue;
    }
    // Shift quantitatif : variation >= 30 points sur trust/tension/affection/fear/debt/dominance.
    const metrics: Array<keyof typeof prevRel> = ["trust", "tension", "affection", "fear", "debt", "dominance"];
    for (const key of metrics) {
      const pv = prevRel[key] as number | null | undefined;
      const cv = currRel[key] as number | null | undefined;
      if (typeof pv === "number" && typeof cv === "number" && Math.abs(cv - pv) >= 30) {
        entries.push({
          type: "relationship_shifted",
          characterId: curr.characterId,
          targetCharacterId: targetId,
          fromValue: `${key}=${pv}`,
          toValue: `${key}=${cv}`,
          severity: Math.abs(cv - pv) >= 60 ? "major" : "minor",
          justified: false,
          reason: "relationship_metric_shift_over_threshold",
        });
      }
    }
  }

  for (const [targetId, prevRel] of prevByTarget) {
    if (!currByTarget.has(targetId)) {
      entries.push({
        type: "relationship_dropped",
        characterId: curr.characterId,
        targetCharacterId: targetId,
        fromValue: prevRel.note ?? JSON.stringify({ trust: prevRel.trust, tension: prevRel.tension }),
        toValue: null,
        severity: "major",
        justified: false,
        reason: "relationship_edge_missing_in_current_snapshot",
      });
    }
  }
  return entries;
}

function diffPossessions(
  prev: CharacterState,
  curr: CharacterState,
): ContinuityDiffEntry[] {
  const entries: ContinuityDiffEntry[] = [];
  const prevSet = new Set((prev.currentState.possessions ?? []).map(normalizeLabel));
  const currSet = new Set((curr.currentState.possessions ?? []).map(normalizeLabel));
  for (const p of currSet) {
    if (!prevSet.has(p) && p) {
      entries.push({
        type: "possession_acquired",
        characterId: curr.characterId,
        fromValue: null,
        toValue: p,
        severity: "minor",
        justified: true,
        reason: "possession_new",
      });
    }
  }
  for (const p of prevSet) {
    if (!currSet.has(p) && p) {
      entries.push({
        type: "possession_lost",
        characterId: curr.characterId,
        fromValue: p,
        toValue: null,
        severity: "minor",
        justified: false,
        reason: "possession_removed_without_event",
      });
    }
  }
  return entries;
}

function diffScalars(
  prev: CharacterState,
  curr: CharacterState,
  events: EventLedgerEntry[] | undefined,
): ContinuityDiffEntry[] {
  const entries: ContinuityDiffEntry[] = [];
  if (!equalsLabel(prev.currentState.emotion, curr.currentState.emotion)
    && (prev.currentState.emotion || curr.currentState.emotion)) {
    entries.push({
      type: "emotion_changed",
      characterId: curr.characterId,
      fromValue: prev.currentState.emotion ?? null,
      toValue: curr.currentState.emotion ?? null,
      severity: "minor",
      justified: true,
      reason: "emotion_flux_expected",
    });
  }
  if (!equalsLabel(prev.currentState.location, curr.currentState.location)
    && (prev.currentState.location || curr.currentState.location)) {
    const justified = eventsLocationChanges(events, curr.characterId);
    entries.push({
      type: "location_changed",
      characterId: curr.characterId,
      fromValue: prev.currentState.location ?? null,
      toValue: curr.currentState.location ?? null,
      severity: justified ? "minor" : "major",
      justified,
      reason: justified ? "event_location_change" : "location_change_without_event",
    });
  }
  if (!equalsLabel(prev.currentState.objective, curr.currentState.objective)
    && (prev.currentState.objective || curr.currentState.objective)) {
    entries.push({
      type: "objective_changed",
      characterId: curr.characterId,
      fromValue: prev.currentState.objective ?? null,
      toValue: curr.currentState.objective ?? null,
      severity: "minor",
      justified: true,
      reason: "objective_evolution_expected",
    });
  }
  return entries;
}

// ─── API publique ─────────────────────────────────────────────────────────

export function buildContinuityDiffLedger(input: {
  previous: CharacterState[];
  current: CharacterState[];
  justifiedEvents?: EventLedgerEntry[];
}): ContinuityDiffLedger {
  const prevById = new Map(input.previous.map((c) => [c.characterId, c]));
  const entries: ContinuityDiffEntry[] = [];

  for (const curr of input.current) {
    const prev = prevById.get(curr.characterId);
    if (!prev) continue;
    entries.push(...diffInjuries(prev, curr, input.justifiedEvents));
    entries.push(...diffOutfit(prev, curr, input.justifiedEvents));
    entries.push(...diffRelationships(prev, curr));
    entries.push(...diffPossessions(prev, curr));
    entries.push(...diffScalars(prev, curr, input.justifiedEvents));
  }

  const perCharacter: Record<string, ContinuityDiffEntry[]> = {};
  for (const entry of entries) {
    (perCharacter[entry.characterId] ??= []).push(entry);
  }

  const summary = {
    totalEntries: entries.length,
    unjustifiedCount: entries.filter((e) => !e.justified).length,
    injuryDiffs: entries.filter((e) => e.type.startsWith("injury_")).length,
    outfitDiffs: entries.filter((e) => e.type.startsWith("outfit_")).length,
    relationshipDiffs: entries.filter((e) => e.type.startsWith("relationship_")).length,
    possessionDiffs: entries.filter((e) => e.type.startsWith("possession_")).length,
  };

  return { entries, perCharacter, summary };
}

/**
 * Utilitaire : filtre le ledger pour ne garder que les diffs non justifiés
 * (= ceux qui méritent un ContinuityIssue).
 */
export function getUnjustifiedDiffs(ledger: ContinuityDiffLedger): ContinuityDiffEntry[] {
  return ledger.entries.filter((e) => !e.justified);
}
