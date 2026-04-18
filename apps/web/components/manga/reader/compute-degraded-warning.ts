/**
 * P5.2 — Calcul du message d'avertissement "sortie dégradée" pour le
 * reader à partir des diagnostics de génération renvoyés par l'API
 * `/api/projects/[id]/chapters/[id]`.
 *
 * Extrait tel quel du composant : on veut pouvoir tester cette
 * fonction indépendamment du DOM React.
 */

import type { ReaderResponse } from "./reader-types";

export function computeReaderDegradedWarning(
  generationDiagnostics: ReaderResponse["generationDiagnostics"],
): string | null {
  if (!generationDiagnostics) return null;
  if ((generationDiagnostics.degradedModes?.length ?? 0) === 0) return null;

  const parts = [
    `Sortie dégradée: ${generationDiagnostics.degradedModes?.join(", ")}.`,
    generationDiagnostics.outline?.usedFallback
      ? `Outline fallback: ${generationDiagnostics.outline.fallbackReason ?? "raison non précisée"}.`
      : null,
    generationDiagnostics.dialogue?.usedFallback
      ? `Dialogue fallback sur ${generationDiagnostics.dialogue.fallbackSceneIds?.length ?? 0} scène(s).`
      : null,
  ].filter((value): value is string => Boolean(value));

  return parts.join(" ");
}
