/**
 * FIX-3 (CRITIQUE) — Préserve les events irréversibles dans l'eventLog.
 *
 * Avant ce helper, le kernel slicait l'eventLog à 40/60 entrées sans aucune
 * considération pour la nature des events. Conséquence : après assez de
 * chapitres, un event `death` (irréversible) sortait silencieusement du
 * buffer et `validateSceneSnapshotAgainstKernel` ne pouvait plus bloquer la
 * résurrection d'un personnage mort.
 *
 * Cette fonction garantit que :
 *   1. TOUS les events `irreversible: true` sont conservés.
 *   2. Les events réversibles les plus récents complètent jusqu'au cap.
 *   3. L'ordre relatif d'origine est préservé (DESC chapter/timeline).
 *   4. Aucun doublon par `eventId`.
 */
import type { EventLedgerEntry } from "../types";

export function capEventLogPreservingIrreversible(
  events: EventLedgerEntry[],
  cap: number,
): EventLedgerEntry[] {
  if (cap <= 0) return [];

  const seen = new Set<string>();
  const dedup: EventLedgerEntry[] = [];
  for (const event of events) {
    if (seen.has(event.eventId)) continue;
    seen.add(event.eventId);
    dedup.push(event);
  }

  const irreversible = dedup.filter((event) => event.irreversible);
  const reversible = dedup.filter((event) => !event.irreversible);

  const reversibleBudget = Math.max(0, cap - irreversible.length);
  const reversibleKept = reversible.slice(0, reversibleBudget);

  const keptIds = new Set([
    ...irreversible.map((event) => event.eventId),
    ...reversibleKept.map((event) => event.eventId),
  ]);

  return dedup.filter((event) => keptIds.has(event.eventId));
}
