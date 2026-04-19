/**
 * P2.2 — Tests du continuity diff ledger.
 *
 * Vérifie la détection structurée des diffs entre deux snapshots
 * `CharacterState[]` : injuries, outfit, relations, possessions, scalars.
 * Vérifie également la prise en compte des `EventLedgerEntry` pour marquer
 * un diff "justified" (sans polluer le rapport).
 */
import { describe, it, expect } from "vitest";
import { buildContinuityDiffLedger, getUnjustifiedDiffs } from "./build-continuity-diff-ledger";
import type { CharacterState, EventLedgerEntry } from "./types";

function makeCharacter(overrides: Partial<CharacterState>): CharacterState {
  return {
    characterId: overrides.characterId ?? "hero",
    identity: overrides.identity ?? { stableName: null, roleType: null },
    appearanceLocked: overrides.appearanceLocked ?? {
      hairColor: null,
      eyeColor: null,
      silhouette: null,
      scars: [],
      tattoos: [],
      fixedAccessories: [],
      forbiddenVisualDrift: [],
    },
    psychologicalCanon: overrides.psychologicalCanon ?? {
      coreTraits: [],
      fears: [],
      motivations: [],
      speechRules: [],
    },
    physicalCanon: overrides.physicalCanon ?? {
      baselineOutfit: null,
      allowedOutfitVariations: [],
      bodyMarkers: [],
    },
    currentState: overrides.currentState ?? {
      location: null,
      outfit: null,
      injuries: [],
      fatigue: null,
      emotion: null,
      objective: null,
      possessions: [],
      knowledge: [],
      obligations: [],
    },
    continuityObligations: overrides.continuityObligations ?? [],
    relationshipStates: overrides.relationshipStates ?? [],
  };
}

function makeEvent(overrides: Partial<EventLedgerEntry>): EventLedgerEntry {
  return {
    eventId: overrides.eventId ?? "evt-1",
    chapterId: overrides.chapterId ?? null,
    sceneId: overrides.sceneId ?? null,
    chapterNumber: overrides.chapterNumber ?? 1,
    sceneNumber: overrides.sceneNumber ?? null,
    eventType: overrides.eventType ?? "generic",
    title: overrides.title ?? "",
    description: overrides.description ?? "",
    actorIds: overrides.actorIds ?? [],
    location: overrides.location ?? null,
    consequences: overrides.consequences ?? [],
    objectsGained: overrides.objectsGained ?? [],
    objectsLost: overrides.objectsLost ?? [],
    injuriesApplied: overrides.injuriesApplied ?? [],
    injuriesResolved: overrides.injuriesResolved ?? [],
    relationshipChanges: overrides.relationshipChanges ?? [],
    continuityFlags: overrides.continuityFlags ?? [],
    irreversible: overrides.irreversible ?? false,
    importance: overrides.importance ?? "minor",
  };
}

describe("buildContinuityDiffLedger — injuries", () => {
  it("blessure disparue sans event → injury_disappeared, non justifié, major", () => {
    const prev = makeCharacter({
      characterId: "hero",
      currentState: {
        location: null, outfit: null, injuries: ["coupure au bras"], fatigue: null,
        emotion: null, objective: null, possessions: [], knowledge: [], obligations: [],
      },
    });
    const curr = makeCharacter({ characterId: "hero" });
    const { entries } = buildContinuityDiffLedger({ previous: [prev], current: [curr] });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      type: "injury_disappeared",
      justified: false,
      severity: "major",
    });
  });

  it("blessure disparue avec event de résolution → justified, severity minor", () => {
    const prev = makeCharacter({
      characterId: "hero",
      currentState: {
        location: null, outfit: null, injuries: ["coupure au bras"], fatigue: null,
        emotion: null, objective: null, possessions: [], knowledge: [], obligations: [],
      },
    });
    const curr = makeCharacter({ characterId: "hero" });
    const event = makeEvent({
      eventType: "injury",
      actorIds: ["hero"],
      injuriesResolved: ["coupure au bras"],
    });
    const { entries } = buildContinuityDiffLedger({
      previous: [prev],
      current: [curr],
      justifiedEvents: [event],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.justified).toBe(true);
    expect(entries[0]!.severity).toBe("minor");
  });

  it("nouvelle blessure sans event → major injury_appeared", () => {
    const prev = makeCharacter({ characterId: "hero" });
    const curr = makeCharacter({
      characterId: "hero",
      currentState: {
        location: null, outfit: null, injuries: ["poignet cassé"], fatigue: null,
        emotion: null, objective: null, possessions: [], knowledge: [], obligations: [],
      },
    });
    const { entries } = buildContinuityDiffLedger({ previous: [prev], current: [curr] });
    expect(entries[0]!.type).toBe("injury_appeared");
    expect(entries[0]!.severity).toBe("major");
    expect(entries[0]!.justified).toBe(false);
  });
});

describe("buildContinuityDiffLedger — outfit", () => {
  it("outfit changé hors variations autorisées → major, non justifié", () => {
    const prev = makeCharacter({
      characterId: "hero",
      physicalCanon: { baselineOutfit: "uniforme scolaire bleu", allowedOutfitVariations: ["tenue sport"], bodyMarkers: [] },
      currentState: { location: null, outfit: "uniforme scolaire bleu", injuries: [], fatigue: null, emotion: null, objective: null, possessions: [], knowledge: [], obligations: [] },
    });
    const curr = makeCharacter({
      characterId: "hero",
      physicalCanon: { baselineOutfit: "uniforme scolaire bleu", allowedOutfitVariations: ["tenue sport"], bodyMarkers: [] },
      currentState: { location: null, outfit: "kimono traditionnel", injuries: [], fatigue: null, emotion: null, objective: null, possessions: [], knowledge: [], obligations: [] },
    });
    const { entries } = buildContinuityDiffLedger({ previous: [prev], current: [curr] });
    expect(entries[0]!.type).toBe("outfit_changed");
    expect(entries[0]!.severity).toBe("major");
    expect(entries[0]!.justified).toBe(false);
  });

  it("outfit dans allowedOutfitVariations → minor, justifié", () => {
    const prev = makeCharacter({
      characterId: "hero",
      physicalCanon: { baselineOutfit: "uniforme", allowedOutfitVariations: ["tenue sport"], bodyMarkers: [] },
      currentState: { location: null, outfit: "uniforme", injuries: [], fatigue: null, emotion: null, objective: null, possessions: [], knowledge: [], obligations: [] },
    });
    const curr = makeCharacter({
      characterId: "hero",
      physicalCanon: { baselineOutfit: "uniforme", allowedOutfitVariations: ["tenue sport"], bodyMarkers: [] },
      currentState: { location: null, outfit: "tenue sport", injuries: [], fatigue: null, emotion: null, objective: null, possessions: [], knowledge: [], obligations: [] },
    });
    const { entries } = buildContinuityDiffLedger({ previous: [prev], current: [curr] });
    expect(entries[0]!.severity).toBe("minor");
    expect(entries[0]!.justified).toBe(true);
  });

  it("outfit revenu à la baseline → outfit_reset, justifié", () => {
    const prev = makeCharacter({
      characterId: "hero",
      physicalCanon: { baselineOutfit: "uniforme", allowedOutfitVariations: [], bodyMarkers: [] },
      currentState: { location: null, outfit: "tenue de combat", injuries: [], fatigue: null, emotion: null, objective: null, possessions: [], knowledge: [], obligations: [] },
    });
    const curr = makeCharacter({
      characterId: "hero",
      physicalCanon: { baselineOutfit: "uniforme", allowedOutfitVariations: [], bodyMarkers: [] },
      currentState: { location: null, outfit: "uniforme", injuries: [], fatigue: null, emotion: null, objective: null, possessions: [], knowledge: [], obligations: [] },
    });
    const { entries } = buildContinuityDiffLedger({ previous: [prev], current: [curr] });
    expect(entries[0]!.type).toBe("outfit_reset");
    expect(entries[0]!.justified).toBe(true);
  });
});

describe("buildContinuityDiffLedger — relationships", () => {
  it("nouvelle relation → relationship_emerged, justifié (minor)", () => {
    const prev = makeCharacter({ characterId: "hero", relationshipStates: [] });
    const curr = makeCharacter({
      characterId: "hero",
      relationshipStates: [{
        targetCharacterId: "ally",
        trust: 50, tension: 20, affection: 30, fear: 0, debt: 0, dominance: 0, note: null,
      }],
    });
    const { entries } = buildContinuityDiffLedger({ previous: [prev], current: [curr] });
    expect(entries[0]!.type).toBe("relationship_emerged");
    expect(entries[0]!.targetCharacterId).toBe("ally");
    expect(entries[0]!.justified).toBe(true);
  });

  it("shift ≥60 sur trust → relationship_shifted severity=major", () => {
    const prev = makeCharacter({
      characterId: "hero",
      relationshipStates: [{ targetCharacterId: "ally", trust: 80, tension: null, affection: null, fear: null, debt: null, dominance: null, note: null }],
    });
    const curr = makeCharacter({
      characterId: "hero",
      relationshipStates: [{ targetCharacterId: "ally", trust: 10, tension: null, affection: null, fear: null, debt: null, dominance: null, note: null }],
    });
    const { entries } = buildContinuityDiffLedger({ previous: [prev], current: [curr] });
    const shift = entries.find((e) => e.type === "relationship_shifted");
    expect(shift).toBeDefined();
    expect(shift!.severity).toBe("major");
    expect(shift!.justified).toBe(false);
  });

  it("relation disparue → relationship_dropped severity=major", () => {
    const prev = makeCharacter({
      characterId: "hero",
      relationshipStates: [{ targetCharacterId: "ally", trust: 60, tension: null, affection: null, fear: null, debt: null, dominance: null, note: null }],
    });
    const curr = makeCharacter({ characterId: "hero", relationshipStates: [] });
    const { entries } = buildContinuityDiffLedger({ previous: [prev], current: [curr] });
    expect(entries[0]!.type).toBe("relationship_dropped");
    expect(entries[0]!.severity).toBe("major");
  });
});

describe("buildContinuityDiffLedger — summary + helpers", () => {
  it("compte correctement les catégories dans summary", () => {
    const prev = makeCharacter({
      characterId: "hero",
      currentState: { location: null, outfit: "A", injuries: ["x"], fatigue: null, emotion: null, objective: null, possessions: ["sword"], knowledge: [], obligations: [] },
    });
    const curr = makeCharacter({
      characterId: "hero",
      physicalCanon: { baselineOutfit: null, allowedOutfitVariations: [], bodyMarkers: [] },
      currentState: { location: null, outfit: "B", injuries: [], fatigue: null, emotion: null, objective: null, possessions: [], knowledge: [], obligations: [] },
    });
    const ledger = buildContinuityDiffLedger({ previous: [prev], current: [curr] });
    expect(ledger.summary.injuryDiffs).toBe(1);
    expect(ledger.summary.outfitDiffs).toBe(1);
    expect(ledger.summary.possessionDiffs).toBe(1);
    expect(ledger.summary.totalEntries).toBe(3);
    expect(ledger.summary.unjustifiedCount).toBeGreaterThanOrEqual(1);
    expect(ledger.perCharacter.hero).toHaveLength(3);
  });

  it("getUnjustifiedDiffs filtre correctement", () => {
    const prev = makeCharacter({
      characterId: "hero",
      currentState: { location: null, outfit: null, injuries: ["cut"], fatigue: null, emotion: null, objective: null, possessions: [], knowledge: [], obligations: [] },
    });
    const curr = makeCharacter({ characterId: "hero" });
    const event = makeEvent({ actorIds: ["hero"], injuriesResolved: ["cut"] });
    const ledger = buildContinuityDiffLedger({ previous: [prev], current: [curr], justifiedEvents: [event] });
    expect(getUnjustifiedDiffs(ledger)).toHaveLength(0);
  });

  it("ignore un personnage sans match dans `previous`", () => {
    const curr = makeCharacter({
      characterId: "new-ally",
      currentState: { location: null, outfit: "x", injuries: [], fatigue: null, emotion: null, objective: null, possessions: [], knowledge: [], obligations: [] },
    });
    const ledger = buildContinuityDiffLedger({ previous: [], current: [curr] });
    expect(ledger.entries).toHaveLength(0);
  });
});
