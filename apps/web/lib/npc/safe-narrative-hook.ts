/**
 * AUDIT COMMIT 11 — helper dédié pour sélectionner un narrativeHook
 * non-vide et "solide" depuis une liste de `interactionHooks`.
 *
 * Avant : `best.interactionHooks[0] ?? ""` renvoyait régulièrement une chaîne
 * vide ou trop faible, qui finissait quand même propagée dans les consumers
 * narratifs. On veut un hook soit utile, soit vide franc (`""`).
 */
export function safeNarrativeHook(hooks: unknown): string {
  if (!Array.isArray(hooks)) return "";
  for (const raw of hooks) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    // Seuil minimal pour éviter les hooks trop courts ("?", "voir", etc.).
    if (trimmed.length >= 8) return trimmed;
  }
  return "";
}
