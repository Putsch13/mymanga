/**
 * Narrative Logger — structured narrative-level logs (not just technical).
 *
 * These logs answer "what part of the story is missing?" rather than
 * "what code failed?". Used for debugging content fidelity.
 */

export type NarrativeLogDomain =
  | "intent-contract"
  | "outline"
  | "visual-world"
  | "dialogue"
  | "preflight"
  | "canon-pack"
  | "cutaway-plan";

export interface NarrativeLogEntry {
  domain: NarrativeLogDomain;
  level: "info" | "warn" | "error";
  message: string;
  data?: Record<string, unknown>;
}

export function logNarrative(entry: NarrativeLogEntry): void {
  const tag = `[${entry.domain}]`;
  const dataStr = entry.data
    ? " " + Object.entries(entry.data).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ")
    : "";

  switch (entry.level) {
    case "info":
      console.info(`${tag} ${entry.message}${dataStr}`);
      break;
    case "warn":
      console.warn(`${tag} ${entry.message}${dataStr}`);
      break;
    case "error":
      console.error(`${tag} ${entry.message}${dataStr}`);
      break;
  }
}

export function logIntentContract(data: {
  requiredEvents: number;
  requiredNpcGroups: number;
  requiredLocations: number;
  eventIds?: string[];
}): void {
  logNarrative({
    domain: "intent-contract",
    level: "info",
    message: `requiredEvents=${data.requiredEvents} requiredNpcGroups=${data.requiredNpcGroups} requiredLocations=${data.requiredLocations}`,
    data: data.eventIds ? { events: data.eventIds.join(",") } : undefined,
  });
}

export function logOutlineCoverage(data: {
  covered: number;
  total: number;
  missingEventIds?: string[];
  forbiddenTermsDetected?: string[];
}): void {
  logNarrative({
    domain: "outline",
    level: data.covered < data.total ? "warn" : "info",
    message: `coverage=${data.covered}/${data.total}`,
    data: {
      ...(data.missingEventIds?.length ? { missing: data.missingEventIds.join(",") } : {}),
      ...(data.forbiddenTermsDetected?.length ? { forbidden_terms_detected: data.forbiddenTermsDetected.join(",") } : {}),
    },
  });
}

export function logVisualWorld(data: {
  locations: number;
  npcGroups: number;
  props: number;
  status: "valid" | "invalid" | "missing";
  missingNpcGroupIds?: string[];
}): void {
  logNarrative({
    domain: "visual-world",
    level: data.status === "invalid" || data.status === "missing" ? "warn" : "info",
    message: `locations=${data.locations} npcGroups=${data.npcGroups} props=${data.props} status=${data.status}`,
    data: data.missingNpcGroupIds?.length ? { missing: data.missingNpcGroupIds.map((id) => `npcGroup:${id}`).join(",") } : undefined,
  });
}

export function logDialogue(data: {
  requiredActs: number;
  fulfilled: number;
  missingActIds?: string[];
}): void {
  logNarrative({
    domain: "dialogue",
    level: data.fulfilled < data.requiredActs ? "warn" : "info",
    message: `requiredActs=${data.requiredActs} fulfilled=${data.fulfilled}`,
    data: data.missingActIds?.length ? { missing: data.missingActIds.join(",") } : undefined,
  });
}

export function logPreflight(data: {
  blockers: number;
  dominantReason?: string;
}): void {
  logNarrative({
    domain: "preflight",
    level: data.blockers > 0 ? "error" : "info",
    message: `blockers=${data.blockers}`,
    data: data.dominantReason ? { groupedBy: data.dominantReason } : undefined,
  });
}
