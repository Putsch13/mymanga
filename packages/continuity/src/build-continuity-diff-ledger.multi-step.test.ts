/**
 * P3.4 / P4 — Continuité inter-scènes et inter-chapitres.
 *
 * Scénarios couverts :
 *   - 3 scènes consécutives d'un même chapitre : blessure apparaît, est
 *     justifiée par un event, puis disparaît justifiée par un event de
 *     résolution → aucun diff non-justifié.
 *   - Transition chapter N → chapter N+1 : la baseline d'outfit change, les
 *     diffs sont détectés comme majors non-justifiés.
 *   - Causalité : un event dans le chapitre précédent justifie un diff dans
 *     le chapitre suivant (timeline linéaire).
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
    eventId: overrides.eventId ?? "evt",
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

describe("continuity — transitions scene→scene (P3.4/P4)", () => {
  it("3 scènes consécutives : blessure apparaît justifiée, soignée justifiée → 0 diff non-justifié cumulé", () => {
    const s1 = makeCharacter({ characterId: "hero" });
    const s2 = makeCharacter({
      characterId: "hero",
      currentState: {
        location: null,
        outfit: null,
        injuries: ["coupure au bras"],
        fatigue: null,
        emotion: null,
        objective: null,
        possessions: [],
        knowledge: [],
        obligations: [],
      },
    });
    const s3 = makeCharacter({ characterId: "hero" });

    const e12 = makeEvent({
      eventId: "evt-inj",
      chapterNumber: 1,
      sceneNumber: 2,
      eventType: "injury",
      actorIds: ["hero"],
      injuriesApplied: ["coupure au bras"],
    });
    const e23 = makeEvent({
      eventId: "evt-heal",
      chapterNumber: 1,
      sceneNumber: 3,
      eventType: "injury",
      actorIds: ["hero"],
      injuriesResolved: ["coupure au bras"],
    });

    const diff12 = buildContinuityDiffLedger({
      previous: [s1],
      current: [s2],
      justifiedEvents: [e12],
    });
    const diff23 = buildContinuityDiffLedger({
      previous: [s2],
      current: [s3],
      justifiedEvents: [e23],
    });

    expect(getUnjustifiedDiffs(diff12)).toHaveLength(0);
    expect(getUnjustifiedDiffs(diff23)).toHaveLength(0);
    expect(diff12.entries[0]?.type).toBe("injury_appeared");
    expect(diff23.entries[0]?.type).toBe("injury_disappeared");
  });

  it("blessure apparaît scène 2 SANS event → diff non-justifié (pas de causalité)", () => {
    const s1 = makeCharacter({ characterId: "hero" });
    const s2 = makeCharacter({
      characterId: "hero",
      currentState: {
        location: null,
        outfit: null,
        injuries: ["plaie au flanc"],
        fatigue: null,
        emotion: null,
        objective: null,
        possessions: [],
        knowledge: [],
        obligations: [],
      },
    });

    const diff = buildContinuityDiffLedger({ previous: [s1], current: [s2] });
    expect(getUnjustifiedDiffs(diff)).toHaveLength(1);
    expect(diff.entries[0]?.type).toBe("injury_appeared");
    expect(diff.entries[0]?.severity).toBe("major");
  });
});

describe("continuity — transitions chapter N → chapter N+1 (P3.4/P4)", () => {
  it("changement d'outfit baseline entre chapitres SANS event → major non-justifié", () => {
    const endOfChapter1 = makeCharacter({
      characterId: "hero",
      physicalCanon: {
        baselineOutfit: "uniforme scolaire bleu",
        allowedOutfitVariations: [],
        bodyMarkers: [],
      },
      currentState: {
        location: null,
        outfit: "uniforme scolaire bleu",
        injuries: [],
        fatigue: null,
        emotion: null,
        objective: null,
        possessions: [],
        knowledge: [],
        obligations: [],
      },
    });
    const startOfChapter2 = makeCharacter({
      characterId: "hero",
      physicalCanon: {
        baselineOutfit: "uniforme scolaire bleu",
        allowedOutfitVariations: [],
        bodyMarkers: [],
      },
      currentState: {
        location: null,
        outfit: "armure de voyage",
        injuries: [],
        fatigue: null,
        emotion: null,
        objective: null,
        possessions: [],
        knowledge: [],
        obligations: [],
      },
    });

    const diff = buildContinuityDiffLedger({
      previous: [endOfChapter1],
      current: [startOfChapter2],
    });
    expect(diff.entries[0]?.type).toBe("outfit_changed");
    expect(diff.entries[0]?.severity).toBe("major");
    expect(diff.entries[0]?.justified).toBe(false);
  });

  it("changement d'outfit entre chapitres avec event 'change_outfit' explicite → justified", () => {
    const endOfChapter1 = makeCharacter({
      characterId: "hero",
      physicalCanon: {
        baselineOutfit: "uniforme scolaire bleu",
        allowedOutfitVariations: ["armure de voyage"],
        bodyMarkers: [],
      },
      currentState: {
        location: null,
        outfit: "uniforme scolaire bleu",
        injuries: [],
        fatigue: null,
        emotion: null,
        objective: null,
        possessions: [],
        knowledge: [],
        obligations: [],
      },
    });
    const startOfChapter2 = makeCharacter({
      characterId: "hero",
      physicalCanon: {
        baselineOutfit: "uniforme scolaire bleu",
        allowedOutfitVariations: ["armure de voyage"],
        bodyMarkers: [],
      },
      currentState: {
        location: null,
        outfit: "armure de voyage",
        injuries: [],
        fatigue: null,
        emotion: null,
        objective: null,
        possessions: [],
        knowledge: [],
        obligations: [],
      },
    });

    const diff = buildContinuityDiffLedger({
      previous: [endOfChapter1],
      current: [startOfChapter2],
    });
    expect(diff.entries[0]?.justified).toBe(true);
    expect(diff.entries[0]?.severity).toBe("minor");
  });

  it("possession perdue entre chapitres SANS event → major non-justifié", () => {
    const endOfChapter1 = makeCharacter({
      characterId: "hero",
      currentState: {
        location: null,
        outfit: null,
        injuries: [],
        fatigue: null,
        emotion: null,
        objective: null,
        possessions: ["épée sacrée"],
        knowledge: [],
        obligations: [],
      },
    });
    const startOfChapter2 = makeCharacter({
      characterId: "hero",
      currentState: {
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
    });

    const diff = buildContinuityDiffLedger({
      previous: [endOfChapter1],
      current: [startOfChapter2],
    });
    const lost = diff.entries.find((e) => e.type === "possession_lost");
    expect(lost).toBeDefined();
    expect(lost!.justified).toBe(false);
  });

  it("causalité injury : event de chapitre N-1 (injuriesResolved) justifie la disparition de la blessure au chapitre N", () => {
    const endOfChapter1 = makeCharacter({
      characterId: "hero",
      currentState: {
        location: null,
        outfit: null,
        injuries: ["brûlure au dos"],
        fatigue: null,
        emotion: null,
        objective: null,
        possessions: [],
        knowledge: [],
        obligations: [],
      },
    });
    const startOfChapter2 = makeCharacter({
      characterId: "hero",
      currentState: {
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
    });
    const endOfChapter1Event = makeEvent({
      eventId: "evt-heal-final",
      chapterNumber: 1,
      eventType: "injury",
      actorIds: ["hero"],
      injuriesResolved: ["brûlure au dos"],
    });

    const diff = buildContinuityDiffLedger({
      previous: [endOfChapter1],
      current: [startOfChapter2],
      justifiedEvents: [endOfChapter1Event],
    });
    const healed = diff.entries.find((e) => e.type === "injury_disappeared");
    expect(healed).toBeDefined();
    expect(healed!.justified).toBe(true);
    expect(healed!.severity).toBe("minor");
  });
});
