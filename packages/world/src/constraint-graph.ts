import type {
  ConstraintDecision,
  ConstraintEdge,
  ConstraintGraph,
  ConstraintNode,
  OntologyEntry,
  SceneBlueprintInput,
} from "./types";

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function buildNodes(input: SceneBlueprintInput): ConstraintNode[] {
  const values: ConstraintNode[] = [
    { id: `universe:${normalize(input.style.universe)}`, type: "universe", value: input.style.universe },
    { id: `tone:${normalize(input.style.tone)}`, type: "tone", value: input.style.tone },
    { id: `style:${normalize(input.style.visualStyle)}`, type: "style", value: input.style.visualStyle },
    { id: `location:${normalize(input.scene.location)}`, type: "location", value: input.scene.location },
  ];
  for (const faction of input.scene.factions) {
    values.push({ id: `faction:${normalize(faction)}`, type: "faction", value: faction });
  }
  for (const worldState of input.scene.worldState) {
    values.push({ id: `world_state:${normalize(worldState)}`, type: "world_state", value: worldState });
  }
  if (input.scene.weather) {
    values.push({ id: `weather:${normalize(input.scene.weather)}`, type: "weather", value: input.scene.weather });
  }
  return values;
}

function compatibilityMatches(entryValues: string[], candidate: string) {
  return entryValues.length === 0 || entryValues.some((value) => candidate.includes(normalize(value)));
}

export function evaluateOntologyCandidate(
  input: SceneBlueprintInput,
  entry: OntologyEntry,
): ConstraintDecision {
  const hardFailures: string[] = [];
  const softWarnings: string[] = [];
  let score = 1;

  const universe = normalize(input.style.universe);
  const tone = normalize(input.style.tone);
  const style = normalize(input.style.visualStyle);
  const location = normalize(input.scene.location);
  const weather = normalize(input.scene.weather);
  const factions = input.scene.factions.map(normalize);
  const worldStates = input.scene.worldState.map(normalize);

  if (!compatibilityMatches(entry.universes ?? [], universe)) {
    if (input.controls.worldStrictness >= 60) hardFailures.push(`Universe mismatch for ${entry.label}`);
    else softWarnings.push(`Universe drift risk for ${entry.label}`);
    score -= 0.35;
  }
  if (!compatibilityMatches(entry.tones ?? [], tone)) {
    if (input.controls.worldStrictness >= 75) hardFailures.push(`Tone mismatch for ${entry.label}`);
    else softWarnings.push(`Tone drift risk for ${entry.label}`);
    score -= 0.2;
  }
  if (!compatibilityMatches(entry.styles ?? [], style)) {
    softWarnings.push(`Style family mismatch for ${entry.label}`);
    score -= 0.1;
  }
  if ((entry.tags ?? []).length > 0 && !(entry.tags ?? []).some((tag) => location.includes(normalize(tag)))) {
    softWarnings.push(`Location signal is weak for ${entry.label}`);
    score -= 0.1;
  }
  if ((entry.weathers ?? []).length > 0 && weather && !compatibilityMatches(entry.weathers ?? [], weather)) {
    softWarnings.push(`Weather mismatch for ${entry.label}`);
    score -= 0.05;
  }
  if ((entry.factions ?? []).length > 0 && factions.length > 0 && !(entry.factions ?? []).some((faction) => factions.includes(normalize(faction)))) {
    softWarnings.push(`Faction mismatch for ${entry.label}`);
    score -= 0.05;
  }
  if ((entry.worldStates ?? []).length > 0 && worldStates.length > 0 && !(entry.worldStates ?? []).some((state) => worldStates.includes(normalize(state)))) {
    softWarnings.push(`World state mismatch for ${entry.label}`);
    score -= 0.05;
  }

  return {
    accepted: hardFailures.length === 0,
    hardFailures,
    softWarnings,
    score: Math.max(0, Math.min(1, score)),
  };
}

export function buildConstraintGraph(
  input: SceneBlueprintInput,
  ontologyEntries: OntologyEntry[],
): ConstraintGraph {
  const nodes = buildNodes(input);
  const edges: ConstraintEdge[] = [];
  for (const entry of ontologyEntries) {
    const decision = evaluateOntologyCandidate(input, entry);
    edges.push({
      source: `universe:${normalize(input.style.universe)}`,
      target: entry.id,
      strength: decision.hardFailures.length > 0 ? "hard" : "soft",
      reason: decision.hardFailures[0] ?? decision.softWarnings[0] ?? `Compatible with ${entry.label}`,
      weight: decision.score,
    });
  }
  return { nodes, edges };
}

export function mergeConstraintDecisions(decisions: ConstraintDecision[]): ConstraintDecision {
  return {
    accepted: decisions.every((decision) => decision.accepted),
    hardFailures: decisions.flatMap((decision) => decision.hardFailures),
    softWarnings: decisions.flatMap((decision) => decision.softWarnings),
    score:
      decisions.length > 0
        ? decisions.reduce((sum, decision) => sum + decision.score, 0) / decisions.length
        : 1,
  };
}
