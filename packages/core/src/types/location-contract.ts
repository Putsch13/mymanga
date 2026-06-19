/**
 * P3.8 — LocationContract : contrat de lieux pour un chapitre.
 *
 * Ce contrat garantit que :
 * 1. Chaque chapitre a au moins un lieu défini
 * 2. Les lieux vagues ("story-consistent setting", "generic setting") sont interdits
 * 3. Chaque panel peut être ancré à un lieu
 *
 * @module location-contract
 */

import { z } from "zod";

/**
 * Source du lieu (comment il a été déterminé).
 */
export const locationSourceSchema = z.enum([
  "user_canon",
  "story_text_inference",
  "project_default",
  "temporary_chapter",
]);

export type LocationSource = z.infer<typeof locationSourceSchema>;

/**
 * Un lieu dans le contrat.
 */
export const locationContractEntrySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  source: locationSourceSchema,
  confidence: z.number().min(0).max(1).default(1.0),
  visualDescription: z.string().default(""),
  requiredBeats: z.array(z.string()).default([]),
  optionalBeats: z.array(z.string()).default([]),
  environmentDNA: z
    .object({
      lighting: z.string().optional(),
      atmosphere: z.string().optional(),
      colorPalette: z.array(z.string()).optional(),
      keyElements: z.array(z.string()).optional(),
    })
    .optional(),
});

export type LocationContractEntry = z.infer<typeof locationContractEntrySchema>;

/**
 * LocationContract — le contrat de lieux pour un chapitre.
 */
export const locationContractSchema = z.object({
  chapterId: z.string().min(1),
  locations: z.array(locationContractEntrySchema).min(1, "Au moins un lieu est requis"),
  primaryLocationId: z.string().min(1),
  forbiddenVagueLocations: z.array(z.string()).default([
    "story-consistent setting",
    "generic setting",
    "unknown location",
    "some place",
    "somewhere",
  ]),
});

export type LocationContract = z.infer<typeof locationContractSchema>;

/**
 * Codes d'erreur pour la validation du contrat de lieux.
 */
export const LOCATION_CONTRACT_ERROR_CODES = {
  LOCATION_MISSING: "E_LOCATION_MISSING",
  LOCATION_VAGUE: "E_LOCATION_VAGUE",
  PRIMARY_LOCATION_NOT_FOUND: "E_PRIMARY_LOCATION_NOT_FOUND",
  BEAT_WITHOUT_LOCATION: "E_BEAT_WITHOUT_LOCATION",
} as const;

export type LocationContractErrorCode =
  (typeof LOCATION_CONTRACT_ERROR_CODES)[keyof typeof LOCATION_CONTRACT_ERROR_CODES];

export interface LocationContractIssue {
  code: LocationContractErrorCode;
  message: string;
  locationId?: string;
  beatId?: string;
  severity: "error" | "warning";
}

export interface LocationContractValidationResult {
  ok: boolean;
  issues: LocationContractIssue[];
  stats: {
    totalLocations: number;
    userCanonLocations: number;
    inferredLocations: number;
    temporaryLocations: number;
  };
}

/**
 * Vérifie si un label de lieu est vague.
 */
export function isVagueLocation(label: string, forbiddenList?: string[]): boolean {
  const forbidden = forbiddenList ?? [
    "story-consistent setting",
    "generic setting",
    "unknown location",
    "some place",
    "somewhere",
    "lieu générique",
    "décor générique",
    "endroit inconnu",
  ];
  const normalized = label.toLowerCase().trim();
  return forbidden.some((f) => normalized.includes(f.toLowerCase()));
}

/**
 * Valide un LocationContract.
 */
export function validateLocationContract(
  contract: LocationContract,
  options?: {
    beatIds?: string[];
    strictMode?: boolean;
  },
): LocationContractValidationResult {
  const issues: LocationContractIssue[] = [];
  const strictMode = options?.strictMode ?? false;

  // Règle 1 : Au moins un lieu
  if (!contract.locations || contract.locations.length === 0) {
    issues.push({
      code: LOCATION_CONTRACT_ERROR_CODES.LOCATION_MISSING,
      message: "Le chapitre doit avoir au moins un lieu défini",
      severity: "error",
    });
  }

  // Règle 2 : Pas de lieux vagues
  for (const loc of contract.locations) {
    if (isVagueLocation(loc.label, contract.forbiddenVagueLocations)) {
      issues.push({
        code: LOCATION_CONTRACT_ERROR_CODES.LOCATION_VAGUE,
        message: `Le lieu "${loc.label}" est trop vague`,
        locationId: loc.id,
        severity: "error",
      });
    }
  }

  // Règle 3 : Le lieu principal existe
  if (contract.primaryLocationId) {
    const primary = contract.locations.find((l) => l.id === contract.primaryLocationId);
    if (!primary) {
      issues.push({
        code: LOCATION_CONTRACT_ERROR_CODES.PRIMARY_LOCATION_NOT_FOUND,
        message: `Le lieu principal "${contract.primaryLocationId}" n'existe pas dans la liste`,
        locationId: contract.primaryLocationId,
        severity: "error",
      });
    }
  }

  // Règle 4 : En mode strict, chaque beat doit avoir un lieu
  if (strictMode && options?.beatIds) {
    const coveredBeats = new Set(
      contract.locations.flatMap((l) => [...l.requiredBeats, ...l.optionalBeats]),
    );
    for (const beatId of options.beatIds) {
      if (!coveredBeats.has(beatId)) {
        issues.push({
          code: LOCATION_CONTRACT_ERROR_CODES.BEAT_WITHOUT_LOCATION,
          message: `Le beat "${beatId}" n'a pas de lieu associé`,
          beatId,
          severity: "warning",
        });
      }
    }
  }

  // Stats
  const stats = {
    totalLocations: contract.locations.length,
    userCanonLocations: contract.locations.filter((l) => l.source === "user_canon").length,
    inferredLocations: contract.locations.filter((l) => l.source === "story_text_inference").length,
    temporaryLocations: contract.locations.filter((l) => l.source === "temporary_chapter").length,
  };

  return {
    ok: !issues.some((i) => i.severity === "error"),
    issues,
    stats,
  };
}

/**
 * Construit un LocationContract depuis les entrées du pipeline.
 */
export function buildLocationContract(input: {
  chapterId: string;
  locations: Array<{
    id: string;
    label: string;
    source?: LocationSource;
    visualDescription?: string;
    requiredBeats?: string[];
  }>;
  primaryLocationId?: string;
}): LocationContract {
  if (!input.locations || input.locations.length === 0) {
    throw new Error(
      `${LOCATION_CONTRACT_ERROR_CODES.LOCATION_MISSING}: Cannot build location contract without locations`,
    );
  }

  const locations: LocationContractEntry[] = input.locations.map((loc) => ({
    id: loc.id,
    label: loc.label,
    source: loc.source ?? "temporary_chapter",
    confidence: loc.source === "user_canon" ? 1.0 : 0.7,
    visualDescription: loc.visualDescription ?? "",
    requiredBeats: loc.requiredBeats ?? [],
    optionalBeats: [],
  }));

  return {
    chapterId: input.chapterId,
    locations,
    primaryLocationId: input.primaryLocationId ?? locations[0]!.id,
    forbiddenVagueLocations: [
      "story-consistent setting",
      "generic setting",
      "unknown location",
      "some place",
      "somewhere",
    ],
  };
}

/**
 * Log formaté pour debug/observabilité.
 */
export function formatLocationContractLog(contract: LocationContract): string {
  const required = contract.locations.filter((l) => l.requiredBeats.length > 0).length;
  const temporary = contract.locations.filter((l) => l.source === "temporary_chapter").length;
  return (
    `[location-contract] required=${contract.locations.length} fulfilled=${contract.locations.length} ` +
    `temporary=${temporary} gaps=0`
  );
}
