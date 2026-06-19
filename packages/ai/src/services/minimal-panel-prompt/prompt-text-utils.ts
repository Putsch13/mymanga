/**
 * prompt-text-utils.ts
 *
 * Petits utilitaires de mise en forme du prompt :
 *   - normalisation des clauses (espaces, point final),
 *   - traduction enum → libellé humain pour shotType / cameraAngle,
 *   - clampLength pour limiter la longueur d'un bloc,
 *   - padWithStyleHints pour atteindre la longueur minimale.
 *
 * Extraits de `minimal-panel-prompt-builder.ts` pour clarifier le fichier
 * principal.
 */
import type { PanelRenderSpec } from "../../contracts/panel-render-spec";

/** Longueur minimale du prompt positif (push automatique de hints sinon). */
export const MIN_PROMPT_LENGTH = 700;

export function normalizePromptClause(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").replace(/[.]+$/g, "").trim();
}

export function humanizeShot(s: PanelRenderSpec["shotType"]): string {
  switch (s) {
    case "wide":
      return "wide shot";
    case "medium":
      return "medium shot";
    case "closeup":
      return "closeup";
    case "extreme_closeup":
      return "extreme closeup";
    case "over_shoulder":
      return "over-the-shoulder";
  }
}

export function humanizeAngle(a: PanelRenderSpec["cameraAngle"]): string {
  switch (a) {
    case "eye_level":
      return "eye-level angle";
    case "low":
      return "low angle";
    case "high":
      return "high angle";
    case "dutch":
      return "dutch angle";
    case "birds_eye":
      return "bird's eye view";
    case "worm":
      return "worm's eye view";
  }
}

export function clampLength(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

export function padWithStyleHints(s: string, spec: PanelRenderSpec): string {
  const hints = [
    "consistent character design",
    "coherent environment with previous panels",
    "clean manga panel composition",
    "professional storyboard framing",
    `location continuity: ${spec.locationName}`,
  ];
  let out = s;
  for (const h of hints) {
    if (out.length >= MIN_PROMPT_LENGTH) break;
    out += `\nHINT: ${h}.`;
  }
  return out;
}
