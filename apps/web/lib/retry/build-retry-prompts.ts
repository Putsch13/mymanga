/**
 * P5.1 — Extraction de la composition des augments positifs/négatifs
 * du retry. Auparavant inlined dans `route.ts` (l.399-440).
 *
 * Règles préservées à 100% :
 *   - Les hints specialized (retryReferenceDecision.*PromptHint) priment
 *     sur les hints legacy (par mode).
 *   - Les user overrides (retryBody.userPromptAdditions / Exclusions) sont
 *     tronqués (400/200 chars) puis appendus en fin de liste.
 *   - Ordre : specialized > legacy > user.
 *
 * Pure function : aucun I/O, aucun Prisma. 100% composable.
 */

import type { RetryMode } from "@/lib/images/retry-reference-policy";

export type BuildRetryPromptsInput = {
  retryMode: RetryMode | null;
  retryReferenceDecision: {
    positivePromptHint?: string | null;
    negativePromptHint?: string | null;
  };
  characterHints: { positive: string; negative: string } | null;
  locationMarkersLine: string;
  userPromptAdditions?: string | null;
  userPromptExclusions?: string | null;
};

export type RetryPrompts = {
  positiveAugment: string;
  negativeAugment: string;
  userPositive: string;
  userNegative: string;
};

export function buildRetryPrompts(input: BuildRetryPromptsInput): RetryPrompts {
  const { retryMode, retryReferenceDecision, characterHints, locationMarkersLine } = input;

  const legacyPositiveAugment = retryMode === "environment"
    ? ["readable environment, strong background, visible architecture, clear foreground midground background", locationMarkersLine].filter(Boolean).join(", ")
    : retryMode === "character"
      ? (characterHints?.positive ?? "")
      : retryMode === "interaction"
        ? "clear body language, readable interaction, characters connected to environment"
        : retryMode === "style"
          ? "consistent manga style, clean line art, coherent shading"
          : retryMode === "composition"
            ? ["balanced manga composition, spatial clarity, dynamic framing", locationMarkersLine].filter(Boolean).join(", ")
            : "";

  const legacyNegativeAugment = retryMode === "environment"
    ? "empty background, studio backdrop, flat grey backdrop, blurry environment"
    : retryMode === "character"
      ? (characterHints?.negative ?? "")
      : retryMode === "interaction"
        ? "weak social interaction, disconnected characters"
        : retryMode === "style"
          ? "style drift, muddy rendering, off-model manga style"
          : retryMode === "composition"
            ? "floating character, poor framing, weak staging"
            : "";

  const basePositiveAugment = retryReferenceDecision.positivePromptHint
    ? retryReferenceDecision.positivePromptHint
    : legacyPositiveAugment;
  const baseNegativeAugment = retryReferenceDecision.negativePromptHint
    ? retryReferenceDecision.negativePromptHint
    : legacyNegativeAugment;

  const userPositive = typeof input.userPromptAdditions === "string"
    ? input.userPromptAdditions.slice(0, 400).trim()
    : "";
  const userNegative = typeof input.userPromptExclusions === "string"
    ? input.userPromptExclusions.slice(0, 200).trim()
    : "";

  return {
    positiveAugment: [basePositiveAugment, userPositive].filter(Boolean).join(", "),
    negativeAugment: [baseNegativeAugment, userNegative].filter(Boolean).join(", "),
    userPositive,
    userNegative,
  };
}

/**
 * Reroll kind humain-lisible depuis le mode de retry, utilisé en logs
 * et en metadata DB pour observabilité.
 */
export function resolveRerollKind(retryMode: RetryMode | null): string | undefined {
  switch (retryMode) {
    case "environment": return "REROLL_ENVIRONMENT";
    case "character": return "REROLL_CHARACTER_FIDELITY";
    case "interaction": return "REROLL_INTERACTION";
    case "style": return "REROLL_STYLE";
    case "composition": return "REROLL_COMPOSITION";
    case "prop": return "REROLL_PROP";
    case "speaker": return "REROLL_SPEAKER_ANCHOR";
    case "enemy_presence": return "REROLL_ENEMY_PRESENCE";
    case "subject_focus": return "REROLL_SUBJECT_FOCUS";
    case "cutaway": return "REROLL_CUTAWAY";
    case "npc_population": return "REROLL_NPC_POPULATION";
    default: return undefined;
  }
}
