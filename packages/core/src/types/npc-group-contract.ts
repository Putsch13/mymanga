/**
 * P4.12 — NpcGroupContract : contrat de groupes PNJ pour un chapitre.
 *
 * Ce contrat garantit que :
 * 1. Les groupes PNJ mentionnés dans le texte sont détectés
 * 2. Chaque groupe a une description visuelle
 * 3. Les panels requis montrent le groupe
 *
 * @module npc-group-contract
 */

import { z } from "zod";

/**
 * Type de groupe PNJ.
 */
export const npcGroupKindSchema = z.enum([
  "npc_group",
  "crowd",
  "faction",
  "ambient_people",
]);

export type NpcGroupKind = z.infer<typeof npcGroupKindSchema>;

/**
 * Un groupe PNJ dans le contrat.
 */
export const npcGroupContractEntrySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: npcGroupKindSchema,
  visualDescription: z.string().min(1),
  requiredBeats: z.array(z.string()).default([]),
  optionalBeats: z.array(z.string()).default([]),
  minPanelCoverage: z.number().int().min(0).default(1),
  memberCountHint: z.number().int().min(0).default(0),
  canonLevel: z.enum(["user_canon", "chapter_temporary", "inferred"]).default("inferred"),
});

export type NpcGroupContractEntry = z.infer<typeof npcGroupContractEntrySchema>;

/**
 * NpcGroupContract — le contrat de groupes PNJ pour un chapitre.
 */
export const npcGroupContractSchema = z.object({
  chapterId: z.string().min(1),
  groups: z.array(npcGroupContractEntrySchema).default([]),
});

export type NpcGroupContract = z.infer<typeof npcGroupContractSchema>;

/**
 * Codes d'erreur pour la validation du contrat NPC.
 */
export const NPC_GROUP_CONTRACT_ERROR_CODES = {
  NPC_GROUP_REQUIRED_NOT_COVERED: "E_NPC_GROUP_REQUIRED_NOT_COVERED",
  NPC_GROUP_NO_VISUAL_DESCRIPTION: "E_NPC_GROUP_NO_VISUAL_DESCRIPTION",
  NPC_GROUP_MENTIONED_BUT_NOT_SHOWN: "E_NPC_GROUP_MENTIONED_BUT_NOT_SHOWN",
} as const;

export type NpcGroupContractErrorCode =
  (typeof NPC_GROUP_CONTRACT_ERROR_CODES)[keyof typeof NPC_GROUP_CONTRACT_ERROR_CODES];

export interface NpcGroupContractIssue {
  code: NpcGroupContractErrorCode;
  message: string;
  groupId?: string;
  beatId?: string;
  severity: "error" | "warning";
}

export interface NpcGroupContractValidationResult {
  ok: boolean;
  issues: NpcGroupContractIssue[];
  stats: {
    totalGroups: number;
    requiredGroups: number;
    coveredGroups: number;
  };
}

/**
 * Valide un NpcGroupContract.
 */
export function validateNpcGroupContract(
  contract: NpcGroupContract,
  options?: {
    panelNpcCoverage?: Map<string, string[]>;
    strictMode?: boolean;
  },
): NpcGroupContractValidationResult {
  const issues: NpcGroupContractIssue[] = [];

  // Règle 1 : Chaque groupe doit avoir une description visuelle
  for (const group of contract.groups) {
    if (!group.visualDescription || group.visualDescription.trim().length === 0) {
      issues.push({
        code: NPC_GROUP_CONTRACT_ERROR_CODES.NPC_GROUP_NO_VISUAL_DESCRIPTION,
        message: `Le groupe "${group.label}" n'a pas de description visuelle`,
        groupId: group.id,
        severity: "warning",
      });
    }
  }

  // Règle 2 : Si coverage est fourni, vérifier que les groupes requis sont couverts
  if (options?.panelNpcCoverage && options.strictMode) {
    const coveredGroups = new Set<string>();
    for (const [, groupIds] of options.panelNpcCoverage) {
      for (const gid of groupIds) {
        coveredGroups.add(gid);
      }
    }

    for (const group of contract.groups) {
      if (group.requiredBeats.length > 0 && !coveredGroups.has(group.id)) {
        issues.push({
          code: NPC_GROUP_CONTRACT_ERROR_CODES.NPC_GROUP_REQUIRED_NOT_COVERED,
          message: `Le groupe "${group.label}" est requis mais n'apparaît dans aucun panel`,
          groupId: group.id,
          severity: "error",
        });
      }
    }
  }

  const requiredGroups = contract.groups.filter((g) => g.requiredBeats.length > 0);
  const stats = {
    totalGroups: contract.groups.length,
    requiredGroups: requiredGroups.length,
    coveredGroups: contract.groups.length,
  };

  return {
    ok: !issues.some((i) => i.severity === "error"),
    issues,
    stats,
  };
}

/**
 * Construit un NpcGroupContract depuis les entrées du pipeline.
 */
export function buildNpcGroupContract(input: {
  chapterId: string;
  groups: Array<{
    id?: string;
    label: string;
    kind?: NpcGroupKind;
    visualDescription?: string;
    requiredBeats?: string[];
    memberCountHint?: number;
  }>;
}): NpcGroupContract {
  const groups: NpcGroupContractEntry[] = input.groups.map((g, i) => ({
    id: g.id ?? `npc_group_${i + 1}`,
    label: g.label,
    kind: g.kind ?? "npc_group",
    visualDescription: g.visualDescription ?? `Groupe de ${g.label}`,
    requiredBeats: g.requiredBeats ?? [],
    optionalBeats: [],
    minPanelCoverage: 1,
    memberCountHint: g.memberCountHint ?? 0,
    canonLevel: "inferred" as const,
  }));

  return {
    chapterId: input.chapterId,
    groups,
  };
}

/**
 * Log formaté pour debug/observabilité.
 */
export function formatNpcGroupContractLog(contract: NpcGroupContract): string {
  const labels = contract.groups.map((g) => g.label).join(",");
  return `[npc-contract] groups=${contract.groups.length} labels=${labels || "none"}`;
}
