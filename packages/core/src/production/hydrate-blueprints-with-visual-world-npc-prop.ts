/**
 * Hydrate props puis PNJ depuis un `VisualWorldContract` (ordre PR3).
 * Préférez les appels explicites `hydrateBlueprintsWithPropDna` puis `hydrateBlueprintsWithNpcDna`
 * dans les routes premium ; ce module reste la façade stable pour les imports existants.
 */

import type { PanelBlueprintPremium } from "../types/narrative-facts";
import type { VisualWorldContract } from "../visual-world/visual-world-contract";
import { hydrateBlueprintsWithNpcDna } from "./hydrate-blueprints-with-npc-dna";
import { hydrateBlueprintsWithPropDna } from "./hydrate-blueprints-with-prop-dna";

export type HydrateBlueprintsWithVisualWorldNpcPropInput = {
  blueprints: PanelBlueprintPremium[];
  visualWorld: VisualWorldContract | null | undefined;
  strict?: boolean;
};

export function hydrateBlueprintsWithVisualWorldNpcAndProps(
  input: HydrateBlueprintsWithVisualWorldNpcPropInput,
): PanelBlueprintPremium[] {
  if (!input.visualWorld) return input.blueprints;
  const strict = input.strict === true;
  const afterProps = hydrateBlueprintsWithPropDna({
    blueprints: input.blueprints,
    visualWorld: input.visualWorld,
    strict,
  });
  return hydrateBlueprintsWithNpcDna({
    blueprints: afterProps,
    visualWorld: input.visualWorld,
    strict,
  });
}
