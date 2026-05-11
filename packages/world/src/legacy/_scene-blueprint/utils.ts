import { createSeededRng } from "../../seeded-rng";
import type {
  ProceduralEntity,
  ProceduralSelection,
  SceneBlueprintInput,
} from "../../types";

export function uniq(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter(Boolean) as string[])];
}

export function deriveLocationSignals(input: SceneBlueprintInput): string[] {
  const tokens = input.scene.location
    .split(/[\s,/-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4)
    .slice(0, 3);
  const universe = input.style.universe.toLowerCase();
  const genreSignals = universe.includes("post")
    ? ["ruines lisibles", "horizon fracturé"]
    : universe.includes("romance")
      ? ["profondeur décorative douce", "lumière enveloppante"]
      : universe.includes("cyber")
        ? ["perspective néon", "couches urbaines lisibles"]
        : ["profondeur spatiale", "signaux de lieu lisibles"];
  return uniq([input.scene.location, ...tokens, ...genreSignals]);
}

export function toSelection(primary: ProceduralEntity[]): ProceduralSelection {
  return {
    primary,
    secondary: primary.slice(1),
    traces: primary.flatMap((item) =>
      item.interactionHooks.slice(0, 1).map((hook, index) => ({
        id: `${item.id}-trace-${index}`,
        label: hook,
        kind: "trace" as const,
        visualCues: item.visualCues.slice(0, 2),
        interactionHooks: [hook],
        sourceOntologyId: item.sourceOntologyId,
      })),
    ),
  };
}

export function filterSelection(
  selection: ProceduralSelection,
  acceptedIds: Set<string>,
): ProceduralSelection {
  return {
    primary: selection.primary.filter((item) => acceptedIds.has(item.sourceOntologyId)),
    secondary: selection.secondary.filter((item) => acceptedIds.has(item.sourceOntologyId)),
    traces: selection.traces.filter((item) => acceptedIds.has(item.sourceOntologyId)),
  };
}

export function chooseWeather(input: SceneBlueprintInput, seed: number): string {
  if (input.scene.weather) return input.scene.weather;
  const rng = createSeededRng(seed + 14);
  const universe = input.style.universe.toLowerCase();
  const options = universe.includes("romance")
    ? ["clear", "golden breeze", "light petals"]
    : universe.includes("cyber")
      ? ["rain", "mist", "acid drizzle"]
      : universe.includes("post")
        ? ["dust storm", "dry wind", "toxic haze"]
        : ["clear", "cloudy", "wind"];
  return rng.pickOne(options);
}

export function chooseTimeOfDay(input: SceneBlueprintInput, seed: number): string {
  if (input.scene.timeOfDay) return input.scene.timeOfDay;
  const rng = createSeededRng(seed + 7);
  return rng.pickOne(["dawn", "day", "sunset", "night"]);
}

export function syntheticProceduralEntity(
  kind: ProceduralEntity["kind"],
  label: string,
  sourceOntologyId: string,
  visualCues: string[],
  interactionHooks: string[],
): ProceduralEntity {
  return {
    id: sourceOntologyId,
    label,
    kind,
    visualCues,
    interactionHooks,
    sourceOntologyId,
  };
}
