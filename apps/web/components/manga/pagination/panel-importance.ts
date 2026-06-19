/**
 * Sprint 1 — Reader refacto
 *
 * Dérive l'importance d'un panel pour piloter le choix de layout manga.
 * On utilise les métadonnées déjà produites par le builder de blueprints
 * (`panelRole`, `shotType`, `cutawayType`, `layoutMeta.slotType`) sans en
 * dépendre strictement : si rien n'est renseigné, on retombe sur `normal`.
 *
 * L'importance drive deux décisions :
 *   - un panel `splash` obtient sa propre page (layout `splash`)
 *   - un panel `major` permet d'utiliser `asymmetric_hero` ou `action_strip`
 *     (layouts avec un panel dominant)
 */

export type PanelImportance = "splash" | "major" | "normal" | "insert";

export interface PanelImportanceInput {
  /** Slot type du layoutMeta — "wide" = panoramique, "tall" = portrait, etc. */
  slotType?: string | null;
  /** Rôle narratif (si fourni par le builder de blueprints) */
  panelRole?: string | null;
  /** Type de plan caméra */
  shotType?: string | null;
  /** Cutaway (insert décor / prop) */
  cutawayType?: string | null;
  /** Flags explicites — priorité absolue */
  isSplash?: boolean | null;
  isMajor?: boolean | null;
}

const SPLASH_SHOT_TYPES = new Set(["splash", "splash_page", "double_spread", "full_page"]);
const MAJOR_SHOT_TYPES = new Set([
  "establishing_shot",
  "wide_shot",
  "extreme_wide_shot",
  "panoramic",
]);
const MAJOR_ROLES = new Set([
  "climax",
  "revelation",
  "cliffhanger",
  "opening",
  "splash",
]);
const INSERT_SHOT_TYPES = new Set(["insert", "extreme_close_up", "macro"]);

export function derivePanelImportance(input: PanelImportanceInput | null | undefined): PanelImportance {
  if (!input) return "normal";
  if (input.isSplash) return "splash";

  const shotType = (input.shotType ?? "").toLowerCase();
  const slotType = (input.slotType ?? "").toLowerCase();
  const role = (input.panelRole ?? "").toLowerCase();
  const cutawayType = (input.cutawayType ?? "").toLowerCase();

  if (SPLASH_SHOT_TYPES.has(shotType) || role === "splash") return "splash";

  if (input.isMajor) return "major";
  if (MAJOR_SHOT_TYPES.has(shotType)) return "major";
  if (MAJOR_ROLES.has(role)) return "major";
  if (slotType === "wide" || slotType === "tall") return "major";

  if (INSERT_SHOT_TYPES.has(shotType)) return "insert";
  if (cutawayType && cutawayType !== "none") return "insert";

  return "normal";
}
