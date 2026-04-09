import { describe, expect, it } from "vitest";
import { buildFixedRegressionSuite } from "./qa-suites";
import { buildSceneBlueprint } from "./scene-blueprint";
import { runPropertyValidators, validateEnvironmentInteraction } from "./property-validators";

describe("property validators", () => {
  it("covers the six premium regression scenarios", () => {
    expect(buildFixedRegressionSuite()).toHaveLength(6);
  });

  it("validate premium scene properties on fixed cases", () => {
    for (const testCase of buildFixedRegressionSuite()) {
      const blueprint = buildSceneBlueprint(testCase.input);
      const results = runPropertyValidators(blueprint);
      if (!results.every((result) => result.ok)) {
        throw new Error(`${testCase.id}: ${JSON.stringify(results.filter((result) => !result.ok))}`);
      }
      expect(results.every((result) => result.ok)).toBe(true);
    }
  });

  it("fails when no environment interaction is present", () => {
    const blueprint = buildSceneBlueprint(buildFixedRegressionSuite()[1].input);
    const broken = {
      ...blueprint,
      composition: {
        ...blueprint.composition,
        interactionBeat: "",
      },
      procedural: {
        ...blueprint.procedural,
        selectedLocations: {
          ...blueprint.procedural.selectedLocations,
          primary: blueprint.procedural.selectedLocations.primary.map((item) => ({ ...item, interactionHooks: [] })),
        },
        selectedCreatures: {
          ...blueprint.procedural.selectedCreatures,
          primary: blueprint.procedural.selectedCreatures.primary.map((item) => ({ ...item, interactionHooks: [] })),
        },
      },
    };
    expect(validateEnvironmentInteraction(broken).ok).toBe(false);
  });
});
