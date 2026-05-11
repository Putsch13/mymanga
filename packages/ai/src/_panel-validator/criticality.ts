/**
 * Résolution de la "criticality" d'un panel (CRITICAL vs NON_CRITICAL),
 * extrait du module principal pour rester réutilisable côté tests.
 */
import {
  classifyPanelCriticality,
  getCharacterTierPolicy,
  resolveCharacterImportanceTier,
} from "@manga-ai-studio/core";
import type { GeneratedPanelData } from "./types";

export interface ResolvedCriticality {
  computed: {
    level: "NON_CRITICAL" | "CRITICAL";
    reasons: string[];
  };
  qaWasRequired: boolean;
}

export function resolvePanelCriticality(panel: GeneratedPanelData): ResolvedCriticality {
  const characterTiers = (panel.metadata?.panelQa?.characterRoles ?? []).map((role) =>
    resolveCharacterImportanceTier({ roleType: role ?? null }),
  );
  const computed: ResolvedCriticality["computed"] =
    panel.metadata?.panelQa?.explicitCriticality ??
    classifyPanelCriticality({
      shotType: panel.metadata?.panelContract?.shotType,
      purpose: panel.metadata?.panelContract?.purpose,
      panelCategory: panel.metadata?.panelQa?.panelCategory,
      pageNumber: panel.metadata?.panelQa?.pageNumber,
      panelNumber: panel.metadata?.panelQa?.panelNumber,
      pagePanelCount: panel.metadata?.panelQa?.pagePanelCount,
      characterIds: panel.metadata?.panelQa?.characterIds,
      characterTiers,
      heroCharacterId: panel.metadata?.panelQa?.heroCharacterId,
      visualPriority: panel.metadata?.panelQa?.visualPriority,
    });
  const qaWasRequired =
    computed.level === "CRITICAL" ||
    characterTiers.some(
      (tier) => getCharacterTierPolicy(tier).qaExpectation === "strict",
    );
  return { computed, qaWasRequired };
}
