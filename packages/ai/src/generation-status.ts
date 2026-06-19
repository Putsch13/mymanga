export const GENERATION_OPERATIONAL_STATUSES = [
  "FULLY_OPERATIONAL",
  "DEGRADED_NO_OPENAI",
  "DEGRADED_NO_IMAGE_PROVIDER",
  "DEGRADED_STORAGE_MISSING",
  "DEGRADED_DIALOGUE_FALLBACK",
  "DEGRADED_OUTLINE_FALLBACK",
] as const;

export type GenerationOperationalStatus = (typeof GENERATION_OPERATIONAL_STATUSES)[number];

const STATUS_PRIORITY: GenerationOperationalStatus[] = [
  "DEGRADED_NO_IMAGE_PROVIDER",
  "DEGRADED_NO_OPENAI",
  "DEGRADED_STORAGE_MISSING",
  "DEGRADED_OUTLINE_FALLBACK",
  "DEGRADED_DIALOGUE_FALLBACK",
  "FULLY_OPERATIONAL",
];

export function normalizeGenerationStatuses(
  statuses: Array<GenerationOperationalStatus | null | undefined>,
): GenerationOperationalStatus[] {
  const unique = [...new Set(statuses.filter(Boolean))] as GenerationOperationalStatus[];
  return unique.length > 0 ? unique : ["FULLY_OPERATIONAL"];
}

export function pickPrimaryGenerationStatus(
  statuses: Array<GenerationOperationalStatus | null | undefined>,
): GenerationOperationalStatus {
  const normalized = normalizeGenerationStatuses(statuses);
  for (const candidate of STATUS_PRIORITY) {
    if (normalized.includes(candidate)) return candidate;
  }
  return "FULLY_OPERATIONAL";
}

export function summarizeGenerationStatuses(
  statuses: Array<GenerationOperationalStatus | null | undefined>,
) {
  const degradedModes = normalizeGenerationStatuses(statuses).filter(
    (status) => status !== "FULLY_OPERATIONAL",
  );
  return {
    operationalStatus:
      degradedModes.length > 0
        ? pickPrimaryGenerationStatus(degradedModes)
        : "FULLY_OPERATIONAL",
    degradedModes,
    isDegraded: degradedModes.length > 0,
  };
}
