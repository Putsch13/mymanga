/**
 * Sprint 3 — TASK-3.1
 * Const enum centralisé pour `SceneImage.status` (DB column `String`,
 * pas un Prisma enum natif). Source de vérité unique pour le pipeline,
 * les routes API et le front.
 *
 * À NE PAS confondre avec :
 *   - `Chapter.status`        ("draft" | "ready_for_render" | "generating" | …)
 *   - `Job.status`            ("pending" | "running" | "completed" | "failed")
 *   - `PanelFinalStatus`      ("passed" | "passed_after_retry" | …) — résultat
 *                              de la QA visuelle, propagé via metadata, pas
 *                              le statut DB du panel.
 *
 * Cycle de vie typique d'un SceneImage :
 *
 *   pending  ┐
 *            ├─► generating ──► completed
 *   planned  ┘                ╲
 *                              └─► failed
 *                              └─► blocked  (refus safety / contract)
 */

export const SCENE_IMAGE_STATUS = {
  /** Image planifiée mais le pipeline n'a pas encore commencé. */
  PENDING: "pending",
  /** Plan d'images généré (storyboard) mais aucun shot ne tourne encore. */
  PLANNED: "planned",
  /** Génération provider (FAL / Runware / etc.) en cours. */
  GENERATING: "generating",
  /** Image générée + persistée + QA OK. État terminal de succès. */
  COMPLETED: "completed",
  /** Génération échouée (provider, persist, QA). État terminal d'échec. */
  FAILED: "failed",
  /** Refusée par un guard (safety, contract, premium). État terminal d'échec. */
  BLOCKED: "blocked",
} as const;

export type SceneImageStatus = (typeof SCENE_IMAGE_STATUS)[keyof typeof SCENE_IMAGE_STATUS];

export const ALL_SCENE_IMAGE_STATUSES: readonly SceneImageStatus[] = [
  SCENE_IMAGE_STATUS.PENDING,
  SCENE_IMAGE_STATUS.PLANNED,
  SCENE_IMAGE_STATUS.GENERATING,
  SCENE_IMAGE_STATUS.COMPLETED,
  SCENE_IMAGE_STATUS.FAILED,
  SCENE_IMAGE_STATUS.BLOCKED,
] as const;

const TERMINAL_STATUSES = new Set<SceneImageStatus>([
  SCENE_IMAGE_STATUS.COMPLETED,
  SCENE_IMAGE_STATUS.FAILED,
  SCENE_IMAGE_STATUS.BLOCKED,
]);

const SUCCESS_STATUSES = new Set<SceneImageStatus>([SCENE_IMAGE_STATUS.COMPLETED]);

const FAILURE_STATUSES = new Set<SceneImageStatus>([
  SCENE_IMAGE_STATUS.FAILED,
  SCENE_IMAGE_STATUS.BLOCKED,
]);

const PENDING_STATUSES = new Set<SceneImageStatus>([
  SCENE_IMAGE_STATUS.PENDING,
  SCENE_IMAGE_STATUS.PLANNED,
  SCENE_IMAGE_STATUS.GENERATING,
]);

/** Garde-type : vérifie qu'une string arbitraire est un statut canonique. */
export function isSceneImageStatus(value: unknown): value is SceneImageStatus {
  return typeof value === "string" && ALL_SCENE_IMAGE_STATUSES.includes(value as SceneImageStatus);
}

/** True si l'état ne changera plus (succès ou échec définitif). */
export function isTerminalSceneImageStatus(status: SceneImageStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/** True uniquement pour `completed`. */
export function isSuccessSceneImageStatus(status: SceneImageStatus): boolean {
  return SUCCESS_STATUSES.has(status);
}

/** True pour `failed` ou `blocked`. */
export function isFailureSceneImageStatus(status: SceneImageStatus): boolean {
  return FAILURE_STATUSES.has(status);
}

/** True pour `pending`, `planned`, `generating` (pipeline pas encore terminé). */
export function isPendingSceneImageStatus(status: SceneImageStatus): boolean {
  return PENDING_STATUSES.has(status);
}

/**
 * Normalise une string DB potentiellement legacy vers un statut canonique.
 * Retourne `null` si la valeur n'est pas reconnue (le caller doit décider
 * du fallback : log + traiter comme `pending`, ou rejeter).
 */
export function normalizeSceneImageStatus(value: unknown): SceneImageStatus | null {
  return isSceneImageStatus(value) ? value : null;
}
