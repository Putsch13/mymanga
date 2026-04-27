/**
 * assert-rag-contract-premium.ts
 *
 * P0 — Vérifie que le RAG est correctement configuré et utilisé en mode premium.
 *
 * Règles premium:
 *   - Si chapitre > 1, le RAG doit être actif pour la continuité
 *   - Le mode "text_fallback" n'est pas acceptable en premium
 *   - Les personnages/lieux canon doivent être récupérés depuis le RAG
 */

import type { ProjectRagContextContract } from "@manga-ai-studio/core";

export interface RagContractValidationInput {
  ragContext?: ProjectRagContextContract | null;
  chapterNumber: number;
  isPremiumRun: boolean;
  requiredCharacterIds?: string[];
  requiredLocationIds?: string[];
}

export interface RagContractValidationResult {
  valid: boolean;
  issues: string[];
  warnings: string[];
}

export function validateRagContractForPremium(
  input: RagContractValidationInput
): RagContractValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (!input.isPremiumRun) {
    return { valid: true, issues: [], warnings: [] };
  }

  if (!input.ragContext) {
    if (input.chapterNumber > 1) {
      issues.push("premium_rag_required_for_continuity_chapter");
    } else {
      warnings.push("rag_context_missing_for_chapter_1");
    }
    return { valid: issues.length === 0, issues, warnings };
  }

  if (input.ragContext.mode === "disabled") {
    if (input.chapterNumber > 1) {
      issues.push("premium_rag_disabled_for_continuity_chapter");
    } else {
      warnings.push("rag_disabled_for_chapter_1");
    }
  }

  if (input.ragContext.mode === "text_fallback") {
    warnings.push("rag_using_text_fallback_embedding_failed");
    if (input.chapterNumber > 1) {
      issues.push("premium_rag_text_fallback_not_acceptable_for_continuity");
    }
  }

  if (input.ragContext.warnings?.length) {
    for (const w of input.ragContext.warnings) {
      warnings.push(`rag_warning:${w}`);
    }
  }

  if (input.requiredCharacterIds?.length) {
    const groundedChars = new Set(input.ragContext.groundedCharacters ?? []);
    for (const charId of input.requiredCharacterIds) {
      if (!groundedChars.has(charId)) {
        warnings.push(`rag_missing_grounded_character:${charId}`);
      }
    }
  }

  if (input.requiredLocationIds?.length) {
    const groundedLocs = new Set(input.ragContext.groundedLocations ?? []);
    for (const locId of input.requiredLocationIds) {
      if (!groundedLocs.has(locId)) {
        warnings.push(`rag_missing_grounded_location:${locId}`);
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    warnings,
  };
}

export function assertRagContractForPremium(input: RagContractValidationInput): void {
  const result = validateRagContractForPremium(input);
  if (!result.valid) {
    throw new Error(`premium_rag_contract_invalid:${result.issues.join(",")}`);
  }
}

export function buildRagContextContractFromMemory(
  memoryResult: {
    mode: string;
    query: string;
    retrievedDocs?: Array<{
      id: string;
      entityType: string;
      entityId?: string | null;
      title?: string | null;
      content: string;
      metadata?: unknown;
    }>;
    warnings?: string[];
  },
  knownCharacterIds: string[],
  knownLocationIds: string[]
): ProjectRagContextContract {
  const retrievedDocs = (memoryResult.retrievedDocs ?? []).map((doc, i) => ({
    ...doc,
    relevanceRank: i + 1,
  }));

  const groundedCharacters: string[] = [];
  const groundedLocations: string[] = [];
  const groundedNpcs: string[] = [];
  const groundedProps: string[] = [];

  for (const doc of retrievedDocs) {
    if (doc.entityType === "character" && doc.entityId) {
      if (knownCharacterIds.includes(doc.entityId)) {
        groundedCharacters.push(doc.entityId);
      }
    }
    if (doc.entityType === "location" && doc.entityId) {
      if (knownLocationIds.includes(doc.entityId)) {
        groundedLocations.push(doc.entityId);
      }
    }
    if (doc.entityType === "npc" && doc.entityId) {
      groundedNpcs.push(doc.entityId);
    }
    if (doc.entityType === "prop" && doc.entityId) {
      groundedProps.push(doc.entityId);
    }
  }

  return {
    mode: memoryResult.mode === "vector" ? "vector" 
      : memoryResult.mode === "text_fallback" ? "text_fallback" 
      : "disabled",
    query: memoryResult.query,
    retrievedDocs,
    groundedCharacters,
    groundedLocations,
    groundedNpcs,
    groundedProps,
    warnings: memoryResult.warnings ?? [],
  };
}
