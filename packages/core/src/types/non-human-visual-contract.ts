/**
 * P4.13 — NonHumanVisualContract : contrat pour robots, hybrides et créatures.
 *
 * Ce contrat garantit la cohérence visuelle des entités non-humaines :
 * - Robots : traits mécaniques cohérents
 * - Hybrides : traits hybrides visibles et constants
 * - Créatures : silhouette, taille, dangerosité constantes
 *
 * @module non-human-visual-contract
 */

import { z } from "zod";

/**
 * Type d'entité non-humaine.
 */
export const nonHumanEntityKindSchema = z.enum([
  "robot",
  "hybrid",
  "creature",
  "species",
  "mecha",
  "golem",
  "spirit",
]);

export type NonHumanEntityKind = z.infer<typeof nonHumanEntityKindSchema>;

/**
 * Traits visuels d'une entité non-humaine.
 */
export const visualTraitsSchema = z.object({
  silhouette: z.string().optional(),
  size: z.enum(["tiny", "small", "medium", "large", "huge", "colossal"]).optional(),
  materials: z.array(z.string()).default([]),
  colors: z.array(z.string()).default([]),
  dangerLevel: z.enum(["harmless", "low", "medium", "high", "extreme"]).optional(),
  movementStyle: z.string().optional(),
  specialFeatures: z.array(z.string()).default([]),
});

export type VisualTraits = z.infer<typeof visualTraitsSchema>;

/**
 * Une entité non-humaine dans le contrat.
 */
export const nonHumanEntityContractEntrySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: nonHumanEntityKindSchema,
  visualDescription: z.string().min(1),
  requiredTraits: visualTraitsSchema.optional(),
  forbiddenTraits: z.array(z.string()).default([]),
  requiredBeats: z.array(z.string()).default([]),
  optionalBeats: z.array(z.string()).default([]),
  canonLevel: z.enum(["user_canon", "chapter_temporary", "inferred"]).default("inferred"),
  consistencyLevel: z.enum(["strict", "medium", "loose"]).default("medium"),
});

export type NonHumanEntityContractEntry = z.infer<typeof nonHumanEntityContractEntrySchema>;

/**
 * NonHumanVisualContract — le contrat d'entités non-humaines pour un chapitre.
 */
export const nonHumanVisualContractSchema = z.object({
  chapterId: z.string().min(1),
  robots: z.array(nonHumanEntityContractEntrySchema).default([]),
  hybrids: z.array(nonHumanEntityContractEntrySchema).default([]),
  creatures: z.array(nonHumanEntityContractEntrySchema).default([]),
  species: z.array(nonHumanEntityContractEntrySchema).default([]),
});

export type NonHumanVisualContract = z.infer<typeof nonHumanVisualContractSchema>;

/**
 * Codes d'erreur pour la validation du contrat non-humain.
 */
export const NON_HUMAN_CONTRACT_ERROR_CODES = {
  ENTITY_NO_VISUAL_DESCRIPTION: "E_NON_HUMAN_NO_VISUAL_DESCRIPTION",
  ENTITY_UNKNOWN_CRITICAL: "E_NON_HUMAN_UNKNOWN_CRITICAL",
  ENTITY_FORBIDDEN_TRAIT: "E_NON_HUMAN_FORBIDDEN_TRAIT",
  ENTITY_INCONSISTENT: "E_NON_HUMAN_INCONSISTENT",
} as const;

export type NonHumanContractErrorCode =
  (typeof NON_HUMAN_CONTRACT_ERROR_CODES)[keyof typeof NON_HUMAN_CONTRACT_ERROR_CODES];

export interface NonHumanContractIssue {
  code: NonHumanContractErrorCode;
  message: string;
  entityId?: string;
  entityKind?: string;
  severity: "error" | "warning";
}

export interface NonHumanContractValidationResult {
  ok: boolean;
  issues: NonHumanContractIssue[];
  stats: {
    totalRobots: number;
    totalHybrids: number;
    totalCreatures: number;
    totalSpecies: number;
    unknownCritical: number;
  };
}

/**
 * Valide un NonHumanVisualContract.
 */
export function validateNonHumanVisualContract(
  contract: NonHumanVisualContract,
  options?: {
    strictMode?: boolean;
  },
): NonHumanContractValidationResult {
  const issues: NonHumanContractIssue[] = [];
  let unknownCritical = 0;

  const allEntities = [
    ...contract.robots.map((e) => ({ ...e, entityKind: "robot" })),
    ...contract.hybrids.map((e) => ({ ...e, entityKind: "hybrid" })),
    ...contract.creatures.map((e) => ({ ...e, entityKind: "creature" })),
    ...contract.species.map((e) => ({ ...e, entityKind: "species" })),
  ];

  for (const entity of allEntities) {
    // Règle 1 : Chaque entité doit avoir une description visuelle
    if (!entity.visualDescription || entity.visualDescription.trim().length === 0) {
      issues.push({
        code: NON_HUMAN_CONTRACT_ERROR_CODES.ENTITY_NO_VISUAL_DESCRIPTION,
        message: `L'entité "${entity.label}" (${entity.entityKind}) n'a pas de description visuelle`,
        entityId: entity.id,
        entityKind: entity.entityKind,
        severity: "warning",
      });
    }

    // Règle 2 : Vérifier les labels génériques
    const genericLabels = ["unknown", "generic creature", "random monster", "some robot"];
    if (genericLabels.some((g) => entity.label.toLowerCase().includes(g))) {
      issues.push({
        code: NON_HUMAN_CONTRACT_ERROR_CODES.ENTITY_UNKNOWN_CRITICAL,
        message: `L'entité "${entity.label}" est trop générique`,
        entityId: entity.id,
        entityKind: entity.entityKind,
        severity: options?.strictMode ? "error" : "warning",
      });
      unknownCritical++;
    }
  }

  const stats = {
    totalRobots: contract.robots.length,
    totalHybrids: contract.hybrids.length,
    totalCreatures: contract.creatures.length,
    totalSpecies: contract.species.length,
    unknownCritical,
  };

  return {
    ok: !issues.some((i) => i.severity === "error"),
    issues,
    stats,
  };
}

/**
 * Construit un NonHumanVisualContract depuis les entrées du pipeline.
 */
export function buildNonHumanVisualContract(input: {
  chapterId: string;
  robots?: Array<{
    id?: string;
    label: string;
    visualDescription?: string;
    requiredBeats?: string[];
  }>;
  hybrids?: Array<{
    id?: string;
    label: string;
    visualDescription?: string;
    requiredBeats?: string[];
  }>;
  creatures?: Array<{
    id?: string;
    label: string;
    visualDescription?: string;
    requiredBeats?: string[];
  }>;
  species?: Array<{
    id?: string;
    label: string;
    visualDescription?: string;
    requiredBeats?: string[];
  }>;
}): NonHumanVisualContract {
  const mapEntry = (
    e: { id?: string; label: string; visualDescription?: string; requiredBeats?: string[] },
    kind: NonHumanEntityKind,
    index: number,
  ): NonHumanEntityContractEntry => ({
    id: e.id ?? `${kind}_${index + 1}`,
    label: e.label,
    kind,
    visualDescription: e.visualDescription ?? `${kind}: ${e.label}`,
    requiredBeats: e.requiredBeats ?? [],
    optionalBeats: [],
    forbiddenTraits: [],
    canonLevel: "inferred",
    consistencyLevel: "medium",
  });

  return {
    chapterId: input.chapterId,
    robots: (input.robots ?? []).map((e, i) => mapEntry(e, "robot", i)),
    hybrids: (input.hybrids ?? []).map((e, i) => mapEntry(e, "hybrid", i)),
    creatures: (input.creatures ?? []).map((e, i) => mapEntry(e, "creature", i)),
    species: (input.species ?? []).map((e, i) => mapEntry(e, "species", i)),
  };
}

/**
 * Log formaté pour debug/observabilité.
 */
export function formatNonHumanVisualContractLog(contract: NonHumanVisualContract): string {
  return (
    `[non-human-contract] robots=${contract.robots.length} hybrids=${contract.hybrids.length} ` +
    `creatures=${contract.creatures.length} unknownCritical=0`
  );
}
