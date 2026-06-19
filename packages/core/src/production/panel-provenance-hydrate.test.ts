import { describe, expect, it } from "vitest";
import {
  buildPanelTraceabilityReport,
  computeNarrativeMemoryDigestFromOutline,
  hydratePanelProvenanceOnBlueprints,
} from "./panel-provenance-hydrate";
import type { PanelBlueprintPremium } from "../types/narrative-facts";

function minimalBp(overrides: Partial<PanelBlueprintPremium> = {}): PanelBlueprintPremium {
  return {
    panelId: "p1",
    beatId: "b1",
    panelNumber: 1,
    purpose: "test",
    shotType: "medium",
    cameraAngle: "eye",
    subjectFocus: "hero",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    requiredProps: [],
    requiredLocationSignals: [],
    cutawayType: "none",
    heroCenterAllowed: true,
    criticality: "low",
    ...overrides,
  } as PanelBlueprintPremium;
}

describe("computeNarrativeMemoryDigestFromOutline", () => {
  it("est stable pour le même outline", () => {
    const o = {
      chapterGoal: "goal",
      cliffhanger: "cliff",
      beats: [{ beatId: "1", summary: "a" }],
    };
    expect(computeNarrativeMemoryDigestFromOutline(o)).toBe(computeNarrativeMemoryDigestFromOutline(o));
  });

  it("change quand un beat change", () => {
    const a = { beats: [{ beatId: "1", summary: "x" }] };
    const b = { beats: [{ beatId: "1", summary: "y" }] };
    expect(computeNarrativeMemoryDigestFromOutline(a)).not.toBe(computeNarrativeMemoryDigestFromOutline(b));
  });
});

describe("hydratePanelProvenanceOnBlueprints", () => {
  it("ajoute retrofit si provenance absente", () => {
    const out = hydratePanelProvenanceOnBlueprints([minimalBp()], { narrativeMemoryDigest: "abc12345" });
    expect(out[0]!.provenance?.origin).toBe("retrofit_inferred");
    expect(out[0]!.provenance?.narrativeMemoryDigest).toBe("abc12345");
  });

  it("complète le digest si provenance déjà présente", () => {
    const bp = minimalBp({
      provenance: {
        origin: "author_raw_merged",
        canonicalPanelId: "p1",
        canonicalBeatId: "b1",
        appliedRules: ["x"],
      },
    });
    const out = hydratePanelProvenanceOnBlueprints([bp], { narrativeMemoryDigest: "deadbeef" });
    expect(out[0]!.provenance?.origin).toBe("author_raw_merged");
    expect(out[0]!.provenance?.narrativeMemoryDigest).toBe("deadbeef");
  });
});

describe("buildPanelTraceabilityReport", () => {
  it("compte les écarts lieu / PNJ / ancrage dialogue", () => {
    const bps: PanelBlueprintPremium[] = [
      minimalBp({
        panelId: "p1",
        subjectFocus: "hero",
        mustShowCharacterIds: ["c1"],
        environmentVisualDna: { locationName: "unknown" },
      }),
      minimalBp({
        panelId: "p2",
        requiredNpcCount: 2,
        npcVisualDna: [],
        environmentVisualDna: { locationName: "Café" },
        dialogueCarrier: "speaker_visible",
        dialogueLines: [{ speaker: "A", text: "Hi" }],
        speakerAnchorCharacterId: undefined,
      }),
    ];
    const r = buildPanelTraceabilityReport(bps);
    expect(r.panelCount).toBe(2);
    expect(r.panelsWeakLocationBinding).toBeGreaterThanOrEqual(1);
    expect(r.panelsNpcContractVsDnaMismatch).toBe(1);
    expect(r.panelsDialogueAnchorMismatch).toBe(1);
  });
});
