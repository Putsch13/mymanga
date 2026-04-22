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

/**
 * AUDIT COMMIT 5 — nettoyage lexical des overrides utilisateur avant qu'ils
 * ne finissent dans le prompt final. Règles :
 *   - trim + collapse whitespace
 *   - suppression des sauts de ligne
 *   - suppression des ponctuations répétées (`!!!!`, `.....`, `,,,,`)
 *   - suppression des doubles espaces
 *   - plafond optionnel sur la longueur
 */
export function sanitizeUserPromptInput(
  raw: string | null | undefined,
  max: number = 400,
): string {
  if (typeof raw !== "string") return "";
  let value = raw.replace(/[\r\n\t]+/g, " ");
  value = value.replace(/([!?.,;:])\1{1,}/g, "$1");
  value = value.replace(/\s+/g, " ").trim();
  if (value.length > max) value = value.slice(0, max).trim();
  return value;
}

/**
 * AUDIT COMMIT 11 — helper partagé pour tronquer proprement un snippet
 * de prompt sans couper un mot au milieu.
 */
export function compactPromptSnippet(value: string, max = 180): string {
  if (!value) return "";
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  const hard = cleaned.slice(0, max);
  const lastComma = hard.lastIndexOf(",");
  if (lastComma > max * 0.6) return hard.slice(0, lastComma).trim();
  const lastSpace = hard.lastIndexOf(" ");
  if (lastSpace > max * 0.6) return hard.slice(0, lastSpace).trim();
  return hard.trim();
}

/**
 * AUDIT COMMIT 4 — les anciens augments "legacy" étaient trop bavards
 * ("readable environment, strong background, visible architecture, clear
 * foreground midground background") et re-polluaient les prompts canoniques.
 * On les remplace par des hints compacts et sobres. `locationMarkersLine` est
 * tronqué proprement à 160 chars avant d'être concaténé.
 */
export function buildRetryPrompts(input: BuildRetryPromptsInput): RetryPrompts {
  const { retryMode, retryReferenceDecision, characterHints, locationMarkersLine } = input;

  const compactLocationMarkers = compactPromptSnippet(locationMarkersLine ?? "", 160);

  const legacyPositiveAugment = retryMode === "environment"
    ? ["environment continuity, readable architecture", compactLocationMarkers].filter(Boolean).join(", ")
    : retryMode === "character"
      ? (characterHints?.positive ?? "")
      : retryMode === "interaction"
        ? "clear interaction"
        : retryMode === "style"
          ? "consistent linework, stable style"
          : retryMode === "composition"
            ? ["clear staging, readable framing", compactLocationMarkers].filter(Boolean).join(", ")
            : "";

  const legacyNegativeAugment = retryMode === "environment"
    ? "empty background, flat backdrop"
    : retryMode === "character"
      ? (characterHints?.negative ?? "")
      : retryMode === "interaction"
        ? "disconnected characters"
        : retryMode === "style"
          ? "style drift, muddy rendering"
          : retryMode === "composition"
            ? "poor framing, weak staging"
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
