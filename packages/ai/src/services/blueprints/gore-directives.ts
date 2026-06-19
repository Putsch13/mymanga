/**
 * Directives gore injectees dans les prompts selon l'intensite du projet.
 *
 * Extrait de `panel-blueprint-builder.ts` dans le Sprint C : ce helper
 * n'a aucun lien avec la logique de blueprints mais vivait dans le meme
 * fichier par commodite.
 */

export function buildGoreDirectives(intensityLayer: string, beatType: string): string {
  if (!["MATURE_VISUAL", "ADULT_EXPLICIT"].includes(intensityLayer)) return "";
  const goreLevel = intensityLayer === "ADULT_EXPLICIT" ? "explicit" : "implied";
  if (goreLevel === "implied") {
    return "Gore implicite autorisé : blessures visibles mais non étalées, sang présent sans excès, priorité à l'expression émotionnelle.";
  }
  return "Gore explicite autorisé (dark fantasy). Blessures anatomiques stylisées manga. Le sang suit la dynamique du panel. Pas de complaisance gratuite. Lisibilité prioritaire." +
    (beatType === "silent_aftermath" ? " Aftermath seulement — pas de violence active." : "");
}
