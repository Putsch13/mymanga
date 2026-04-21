/**
 * Map interne `rerollKind` -> `RerollReason` pour l'advisor packet-aware.
 *
 * Extrait de `image-generation-pass.ts` dans le Sprint C : le mapper etait
 * defini inline au milieu de la boucle de generation (~700 lignes dans le
 * scope), ce qui rendait la lecture difficile. Il est maintenant un helper
 * pur, trivialement testable.
 */

import type { RerollReason } from "@manga-ai-studio/ai";

export type RerollKind =
  | "REROLL_ENVIRONMENT"
  | "REROLL_CHARACTER_FIDELITY"
  | "REROLL_INTERACTION"
  | "REROLL_STYLE"
  | "REROLL_COMPOSITION"
  | null
  | undefined;

export function rerollKindToReason(kind: RerollKind): RerollReason {
  switch (kind) {
    case "REROLL_CHARACTER_FIDELITY":
      return "drift_character";
    case "REROLL_ENVIRONMENT":
      return "drift_environment";
    case "REROLL_STYLE":
      return "drift_style";
    case "REROLL_COMPOSITION":
      return "wrong_framing";
    case "REROLL_INTERACTION":
      return "wrong_dominant_subject";
    default:
      return "low_quality";
  }
}
