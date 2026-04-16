import { describe, it, expect } from "vitest";
import { validateKernelCoherence } from "./validate-kernel-coherence";
import type { ContinuityKernel, CharacterState } from "./types";

function makeCharState(overrides?: Partial<CharacterState>): CharacterState {
  return {
    characterId: "c1",
    identity: { stableName: "Kaito", roleType: "hero" },
    appearanceLocked: { hairColor: "black", eyeColor: "blue", silhouette: null, scars: [], tattoos: [], fixedAccessories: [], forbiddenVisualDrift: [] },
    psychologicalCanon: { coreTraits: [], fears: [], motivations: [], speechRules: [] },
    physicalCanon: { baselineOutfit: "school_uniform", allowedOutfitVariations: [], bodyMarkers: [] },
    currentState: { location: "school", outfit: "school_uniform", injuries: [], fatigue: 0, emotion: "determined", objective: null, possessions: [], knowledge: [], obligations: [] },
    continuityObligations: [],
    relationshipStates: [],
    ...overrides,
  };
}

function makeKernel(charStates: CharacterState[]): ContinuityKernel {
  return {
    storyBible: { summary: "test", themes: [], worldRules: [], loreFacts: [], lockedCanonFacts: [] },
    worldState: { activeLocations: [], activeThreats: [], activeMysteries: [], factions: [], zonesOfControl: {}, structuralProhibitions: [], globalFlags: {} },
    characterStates: charStates,
    locationStates: [],
    relationshipGraph: [],
    eventLog: [],
    arcRegistry: [],
    chapterSnapshot: null,
  };
}

describe("validateKernelCoherence", () => {
  it("détecte 0 divergence quand kernel et canon sont identiques", () => {
    const state = makeCharState();
    const kernel = makeKernel([state]);
    const canon = { characterStates: [state] };
    const result = validateKernelCoherence(kernel, canon);
    expect(result.coherent).toBe(true);
    expect(result.divergences).toHaveLength(0);
  });

  it("détecte divergence d'émotion", () => {
    const kernelState = makeCharState();
    const canonState = makeCharState({ currentState: { ...makeCharState().currentState, emotion: "angry" } });
    const kernel = makeKernel([kernelState]);
    const canon = { characterStates: [canonState] };
    const result = validateKernelCoherence(kernel, canon);
    expect(result.coherent).toBe(false);
    expect(result.divergences.some((d) => d.field === "currentState.emotion")).toBe(true);
  });

  it("détecte personnage manquant dans le canon", () => {
    const kernel = makeKernel([makeCharState()]);
    const canon = { characterStates: [] as CharacterState[] };
    const result = validateKernelCoherence(kernel, canon);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("retourne coherent=true si canon est null", () => {
    const kernel = makeKernel([makeCharState()]);
    const result = validateKernelCoherence(kernel, null);
    expect(result.coherent).toBe(true);
  });

  it("résout toujours vers le kernel", () => {
    const kernelState = makeCharState();
    const canonState = makeCharState({
      currentState: {
        ...makeCharState().currentState,
        emotion: "happy",
        outfit: "battle_armor",
        injuries: ["cut"],
        location: "mountains",
      },
    });
    const kernel = makeKernel([kernelState]);
    const canon = { characterStates: [canonState] };
    const result = validateKernelCoherence(kernel, canon);
    expect(result.divergences.every((d) => d.resolvedTo === "kernel")).toBe(true);
    expect(result.divergences.length).toBeGreaterThanOrEqual(3);
  });
});
