import { describe, it, expect } from "vitest";
import { runIntentCoverageQa } from "./intent-coverage-qa";
import type { IntentNarrativeContract } from "../intent/intent-narrative-contract";

function minimalContract(overrides: Partial<IntentNarrativeContract> = {}): IntentNarrativeContract {
  return {
    version: 1,
    chapterId: "ch1",
    storyFacts: [],
    requiredCharacters: [],
    requiredNpcGroups: [],
    requiredLocations: [],
    requiredLocationIds: [],
    requiredEvents: [],
    forbiddenInventions: [],
    ...overrides,
  };
}

describe("runIntentCoverageQa", () => {
  it("returns 100% score when no required events", () => {
    const result = runIntentCoverageQa({
      intentContract: minimalContract(),
      beatSummaries: ["Something happens"],
    });
    expect(result.ok).toBe(true);
    expect(result.intentCoverageScore).toBe(100);
    expect(result.missingEvents).toEqual([]);
  });

  it("T6: missing events produce warnings in non-strict mode", () => {
    const result = runIntentCoverageQa({
      intentContract: minimalContract({
        requiredEvents: [
          {
            id: "evt_1",
            label: "Le héros découvre la lettre secrète",
            type: "action",
            actors: [],
            requiredDialogue: false,
            mustAppearInBeat: true,
          },
        ],
      }),
      beatSummaries: ["Le village est calme ce matin"],
      strict: false,
    });
    expect(result.ok).toBe(true);
    expect(result.intentCoverageScore).toBe(0);
    expect(result.missingEvents).toContain("evt_1");
    expect(result.issues[0].severity).toBe("warning");
  });

  it("T6: missing events block in strict mode", () => {
    const result = runIntentCoverageQa({
      intentContract: minimalContract({
        requiredEvents: [
          {
            id: "evt_1",
            label: "Le héros découvre la lettre secrète",
            type: "action",
            actors: [],
            requiredDialogue: false,
            mustAppearInBeat: true,
          },
        ],
      }),
      beatSummaries: ["Le village est calme ce matin"],
      strict: true,
    });
    expect(result.ok).toBe(false);
    expect(result.issues[0].severity).toBe("error");
    expect(result.issues[0].code).toBe("REQUIRED_EVENT_MISSING");
  });

  it("T6: covered events produce 100% score", () => {
    const result = runIntentCoverageQa({
      intentContract: minimalContract({
        requiredEvents: [
          {
            id: "evt_1",
            label: "Le héros découvre la lettre secrète",
            type: "action",
            actors: [],
            requiredDialogue: false,
            mustAppearInBeat: true,
          },
        ],
      }),
      beatSummaries: ["Le héros découvre une mystérieuse lettre secrète cachée"],
    });
    expect(result.ok).toBe(true);
    expect(result.intentCoverageScore).toBe(100);
    expect(result.missingEvents).toEqual([]);
  });

  it("detects forbidden terms in beats", () => {
    const result = runIntentCoverageQa({
      intentContract: minimalContract({
        forbiddenInventions: ["dragon rouge"],
      }),
      beatSummaries: ["Un dragon rouge attaque le village"],
      strict: true,
    });
    expect(result.issues.some((i) => i.code === "FORBIDDEN_TERM_DETECTED")).toBe(true);
  });

  it("checks required locations against VisualWorld", () => {
    const result = runIntentCoverageQa({
      intentContract: minimalContract({
        requiredLocations: ["Taverne du port"],
      }),
      beatSummaries: [],
      visualWorldLocationNames: ["Forêt sombre"],
      strict: true,
    });
    expect(result.issues.some((i) => i.code === "REQUIRED_LOCATION_MISSING")).toBe(true);
  });

  it("checks required NPC groups against VisualWorld", () => {
    const result = runIntentCoverageQa({
      intentContract: minimalContract({
        requiredNpcGroups: [
          { id: "guards", label: "Gardes", role: "authority", requiredDialogue: false, mustMention: [] },
        ],
      }),
      beatSummaries: [],
      visualWorldNpcGroupLabels: ["Marchands"],
      strict: true,
    });
    expect(result.issues.some((i) => i.code === "REQUIRED_NPC_GROUP_MISSING")).toBe(true);
  });
});
