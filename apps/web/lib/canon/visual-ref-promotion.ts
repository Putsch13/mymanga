/**
 * P7.3 — Cycle de vie des `CharacterVisualRef`.
 *
 * Aujourd'hui le schema Prisma expose un champ `type`
 * (`generated_primary` / `generated_alt` / `user_provided` / `face_closeup`
 * / `action_ref`) et `isPrimary` (boolean). Il n'y a pas de colonne
 * `promotionState` explicite, donc on mappe une machine d'états
 * "candidate → approved → primary → deprecated" sur ces colonnes + le champ
 * `archivedAt`.
 *
 * Règles :
 *   - `candidate`  : ref fraîchement générée, non validée (QA ou user)
 *     → heuristique : `isPrimary === false && archivedAt == null && metadata.qaApproved !== true`
 *   - `approved`   : ref validée QA ou user
 *     → heuristique : `metadata.qaApproved === true && !isPrimary`
 *   - `primary`    : ref affichée comme canon principal
 *     → `isPrimary === true`
 *   - `deprecated` : ref archivée (remplacée ou rejetée)
 *     → `archivedAt != null`
 *
 * Ce fichier ne mute RIEN. Il expose des helpers purs pour lire l'état
 * et décider les transitions autorisées. Les mutations se font dans des
 * TX dédiées (generate-visual, PATCH character, futur endpoint promote).
 */

export type VisualRefPromotionState = "candidate" | "approved" | "primary" | "deprecated";

export type VisualRefPromotionInput = {
  isPrimary?: boolean | null;
  archivedAt?: Date | string | null;
  metadata?: unknown;
};

export function classifyVisualRefState(ref: VisualRefPromotionInput): VisualRefPromotionState {
  if (ref.archivedAt) return "deprecated";
  if (ref.isPrimary === true) return "primary";
  const meta = ref.metadata && typeof ref.metadata === "object" ? (ref.metadata as Record<string, unknown>) : null;
  if (meta?.qaApproved === true) return "approved";
  return "candidate";
}

export type VisualRefTransition =
  | "promote_candidate_to_approved"
  | "promote_approved_to_primary"
  | "demote_primary_to_approved"
  | "archive";

const ALLOWED_TRANSITIONS: Record<VisualRefPromotionState, VisualRefTransition[]> = {
  candidate: ["promote_candidate_to_approved", "archive"],
  approved: ["promote_approved_to_primary", "archive"],
  primary: ["demote_primary_to_approved", "archive"],
  deprecated: [],
};

export function canTransition(
  from: VisualRefPromotionState,
  transition: VisualRefTransition,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(transition);
}

/**
 * Donne la transition recommandée après une génération + validation QA.
 * - validationPassed=true et pas encore de primary → promote_approved_to_primary
 * - validationPassed=true et déjà une primary → promote_candidate_to_approved
 * - validationPassed=false → archive (soft-delete)
 */
export function recommendTransitionAfterGeneration(params: {
  currentState: VisualRefPromotionState;
  validationPassed: boolean;
  projectHasExistingPrimary: boolean;
}): VisualRefTransition | null {
  if (!params.validationPassed) return "archive";
  if (params.currentState === "candidate") return "promote_candidate_to_approved";
  if (params.currentState === "approved" && !params.projectHasExistingPrimary) {
    return "promote_approved_to_primary";
  }
  return null;
}
