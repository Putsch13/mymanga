/**
 * P1.3 (sprint 5) — Tests des détecteurs `detectTimelineViolations` et
 * `detectCausalityBreaks`.
 */
import { describe, it, expect } from "vitest";
import {
  detectTimelineViolations,
  detectCausalityBreaks,
} from "./run-continuity-diff";
import type { CharacterState, EventLedgerEntry } from "./types";

function makeEvent(overrides: Partial<EventLedgerEntry>): EventLedgerEntry {
  return {
    eventId: overrides.eventId ?? `ev-${Math.random().toString(36).slice(2, 8)}`,
    chapterId: null,
    sceneId: null,
    chapterNumber: overrides.chapterNumber ?? 1,
    sceneNumber: overrides.sceneNumber ?? 1,
    eventType: overrides.eventType ?? "event",
    title: overrides.title ?? "untitled",
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

describe("detectTimelineViolations (P1.3)", () => {
  it("actor mort irréversiblement ne peut pas agir dans un event postérieur", () => {
    const events = [
      makeEvent({
        eventId: "e1",
        chapterNumber: 2,
        sceneNumber: 1,
        eventType: "death",
        actorIds: ["char-antagonist"],
        irreversible: true,
        title: "Mort du boss",
      }),
      makeEvent({
        eventId: "e2",
        chapterNumber: 3,
        sceneNumber: 2,
        eventType: "reveal",
        actorIds: ["char-antagonist"],
        title: "Retour du boss",
      }),
    ];
    const issues = detectTimelineViolations(events);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe("critical");
    expect(issues[0]!.type).toBe("timeline_violation");
    expect(issues[0]!.message).toContain("char-antagonist");
  });

  it("un actor mort de manière réversible (irreversible=false) n'émet pas de violation", () => {
    const events = [
      makeEvent({
        eventId: "e1",
        chapterNumber: 1,
        eventType: "death",
        actorIds: ["a"],
        irreversible: false,
      }),
      makeEvent({
        eventId: "e2",
        chapterNumber: 2,
        actorIds: ["a"],
        title: "réapparition (rêve, flashback)",
      }),
    ];
    const issues = detectTimelineViolations(events);
    expect(issues).toHaveLength(0);
  });

  it("injuriesResolved sans injury préalable → timeline_violation", () => {
    const events = [
      makeEvent({
        eventId: "e1",
        chapterNumber: 3,
        actorIds: ["hero"],
        injuriesResolved: ["coupure à la jambe"],
      }),
    ];
    const issues = detectTimelineViolations(events);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.type).toBe("timeline_violation");
    expect(issues[0]!.message).toContain("coupure à la jambe");
  });

  it("injuriesResolved AVEC injury préalable ne signale rien", () => {
    const events = [
      makeEvent({
        eventId: "e1",
        chapterNumber: 2,
        actorIds: ["hero"],
        injuriesApplied: ["coupure à la jambe"],
      }),
      makeEvent({
        eventId: "e2",
        chapterNumber: 3,
        actorIds: ["hero"],
        injuriesResolved: ["coupure à la jambe"],
      }),
    ];
    expect(detectTimelineViolations(events)).toHaveLength(0);
  });

  it("objectsLost sans acquisition préalable → timeline_violation", () => {
    const events = [
      makeEvent({
        eventId: "e1",
        chapterNumber: 2,
        actorIds: ["hero"],
        objectsLost: ["amulette rouge"],
      }),
    ];
    const issues = detectTimelineViolations(events);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.type).toBe("timeline_violation");
  });

  it("objectsLost après objectsGained : pas de violation", () => {
    const events = [
      makeEvent({
        eventId: "e1",
        chapterNumber: 1,
        actorIds: ["hero"],
        objectsGained: ["amulette rouge"],
      }),
      makeEvent({
        eventId: "e2",
        chapterNumber: 3,
        actorIds: ["hero"],
        objectsLost: ["amulette rouge"],
      }),
    ];
    expect(detectTimelineViolations(events)).toHaveLength(0);
  });
});

describe("detectCausalityBreaks (P1.3)", () => {
  function makeState(overrides: {
    characterId?: string;
    injuries?: string[];
  }): CharacterState {
    return {
      characterId: overrides.characterId ?? "char-1",
      identity: {} as CharacterState["identity"],
      appearanceLocked: {
        forbiddenVisualDrift: [],
        scars: [],
        tattoos: [],
        fixedAccessories: [],
      },
      psychologicalCanon: {
        coreTraits: [],
        fears: [],
        motivations: [],
        speechRules: [],
      },
      physicalCanon: {
        allowedOutfitVariations: [],
        bodyMarkers: [],
      },
      currentState: {
        injuries: overrides.injuries ?? [],
        possessions: [],
        knowledge: [],
        obligations: [],
      },
      continuityObligations: [],
      relationshipStates: [],
    };
  }

  it("blessure appliquée + toujours visible → pas de break", () => {
    const events = [
      makeEvent({
        actorIds: ["hero"],
        injuriesApplied: ["cicatrice front"],
      }),
    ];
    const states = [makeState({ characterId: "hero", injuries: ["cicatrice front"] })];
    expect(detectCausalityBreaks({ events, currentCharacterStates: states })).toHaveLength(0);
  });

  it("blessure appliquée + résolue → pas de break", () => {
    const events = [
      makeEvent({ eventId: "a", actorIds: ["hero"], injuriesApplied: ["coupure"] }),
      makeEvent({ eventId: "b", actorIds: ["hero"], injuriesResolved: ["coupure"] }),
    ];
    const states = [makeState({ characterId: "hero", injuries: [] })];
    expect(detectCausalityBreaks({ events, currentCharacterStates: states })).toHaveLength(0);
  });

  it("blessure appliquée, ni visible ni résolue → causality_break", () => {
    const events = [
      makeEvent({ actorIds: ["hero"], injuriesApplied: ["cicatrice front"] }),
    ];
    const states = [makeState({ characterId: "hero", injuries: [] })];
    const issues = detectCausalityBreaks({ events, currentCharacterStates: states });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.type).toBe("causality_break");
    expect(issues[0]!.severity).toBe("major");
    expect(issues[0]!.message).toContain("cicatrice front");
  });

  it("sans state (character non trouvé) : la blessure appliquée non résolue signale un break", () => {
    const events = [
      makeEvent({ actorIds: ["ghost"], injuriesApplied: ["fracture"] }),
    ];
    const issues = detectCausalityBreaks({
      events,
      currentCharacterStates: [],
    });
    expect(issues).toHaveLength(1);
  });
});
