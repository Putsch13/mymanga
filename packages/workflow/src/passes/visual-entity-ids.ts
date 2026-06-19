/**
 * IDs d’entités / personnages requis sur un panel blueprint premium.
 */

import type { PanelBlueprintPremium } from "@manga-ai-studio/core";

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function looksLikeEntityId(s: string): boolean {
  const t = s.trim();
  if (t.length < 8) return false;
  if (UUID_LIKE.test(t)) return true;
  if (/^c[a-z0-9]{24,}$/i.test(t)) return true;
  if (/^auto-opponent:/i.test(t)) return false;
  return !/\s/.test(t) && (t.includes(":") || t.includes("_") || t.length > 12);
}

/** Agrège les IDs visuels requis pour ce panel (personnages + entités dédiées). */
export function getRequiredVisualEntityIds(bp: PanelBlueprintPremium): string[] {
  const xs = [
    ...(bp.mustShowCharacterIds ?? []),
    ...(bp.requiredCharacters ?? []),
    ...(bp.requiredCharacterIds ?? []),
    ...(bp.requiredEntityIds ?? []),
  ];
  const fromPresence =
    bp.presenceObligations
      ?.map((o) => o.entityIdOrLabel)
      .filter((s): s is string => typeof s === "string" && looksLikeEntityId(s)) ?? [];
  return [...new Set([...xs, ...fromPresence])];
}
