/**
 * Chapter pipeline — helpers d'inférence de lieux.
 *
 * Extrait de chapter-pipeline.ts. Fournit :
 *  - `inferLocations(context, userIntent)` : propose 4 locations plausibles en
 *    priorisant d'abord les lieux canoniques (context.locations) cités dans
 *    l'intent, puis des mots-clés explicites, puis un fallback par genre.
 *  - `resolveCanonicalLocation(context, rawLocation)` : remappe un lieu libre
 *    vers un lieu canonique existant si match par nom/alias (substring).
 */

import type { ProjectContextForChapter } from "../chapter-pipeline";

export function inferLocations(context: ProjectContextForChapter, userIntent?: string | null): string[] {
  const intent = (userIntent ?? "").toLowerCase();
  const knownLocations = context.locations ?? [];
  for (const loc of knownLocations) {
    const names = [loc.name, ...(loc.aliases ?? [])].filter(Boolean).map((value) => value.toLowerCase());
    if (names.some((name) => intent.includes(name))) {
      const canonical = loc.description ? `${loc.name} — ${loc.description}` : loc.name;
      return [canonical, canonical, canonical, canonical];
    }
  }
  const portTokens = ["port", "quai", "bateau", "navire", "mer", "océan", "ocean", "pecheur", "pêcheur", "pêcheurs", "marin", "marché aux poissons", "marche aux poissons"];
  if (portTokens.some((t) => intent.includes(t))) {
    return [
      "port animé au bord de l'eau",
      "quai avec filets et caisses",
      "bateau amarré près du quai",
      "marché aux poissons près du quai",
    ];
  }

  const explicitMatches = [
    "banque",
    "café",
    "cafe",
    "taverne",
    "rue",
    "ruelle",
    "ville",
    "toit",
    "forêt",
    "foret",
    "falaise",
    "palais",
    "trône",
    "trone",
  ].filter((token) => intent.includes(token));
  if (explicitMatches.length > 0) {
    const normalized = explicitMatches[0];
    if (normalized === "banque") return ["banque centrale sous haute sécurité", "banque centrale sous haute sécurité", "banque centrale sous haute sécurité", "sortie de la banque"];
    if (normalized === "café" || normalized === "cafe") return ["café calme en soirée", "café calme en soirée", "rue devant le café", "arrière-salle du café"];
    if (normalized === "taverne") return ["taverne enfumée aux lumières basses", "taverne enfumée aux lumières basses", "taverne enfumée aux lumières basses", "entrée de la taverne"];
    if (normalized === "forêt" || normalized === "foret") {
      return [
        "forêt telle que décrite dans le chapitre",
        "lisière ouverte sur le même décor",
        "clairière du même environnement boisé",
        "détail végétal du décor forestier",
      ];
    }
    if (normalized === "ville" || normalized === "rue" || normalized === "ruelle") {
      return ["centre-ville cyberpunk", "ruelle néon sous la pluie", "rue commerçante cyberpunk", "toit d'immeuble au-dessus de la ville"];
    }
    if (normalized === "toit") return ["toit d'immeuble au-dessus de la ville", "toit d'immeuble au-dessus de la ville", "escalier de service", "toit d'immeuble au-dessus de la ville"];
    if (normalized === "palais" || normalized === "trône" || normalized === "trone") {
      return [
        "palais ou grande salle cohérente avec le récit",
        "couloir monumental du même édifice",
        "plan large du trône ou du siège du pouvoir",
        "détail architectural du même lieu",
      ];
    }
    if (normalized === "falaise") {
      return [
        "falaise ou hauteur vertigineuse évoquée par le chapitre",
        "plan large du vide ou du précipice",
        "zone de transition le long du bord",
        "détail rocheux du même site",
      ];
    }
  }

  const genre = (context.project.primaryGenre?.trim() || "generic").toLowerCase();
  if (genre.includes("cyber") || genre.includes("sci")) {
    return [
      "ruelle néon sous la pluie",
      "tour de données clignotante",
      "toit d'immeuble sous un ciel orange",
      "couloir de serveurs sombres",
    ];
  }
  if (genre.includes("horror") || genre.includes("horreur")) {
    return [
      "sanctuaire abandonné",
      "couloir sans fenêtres",
      "cour souillée de sang",
      "crypte sous la ville",
    ];
  }
  if (genre.includes("romance") || genre.includes("shojo")) {
    return [
      "toit de l'école au coucher du soleil",
      "café calme en soirée",
      "parc sous les cerisiers",
      "couloir désert après les cours",
    ];
  }
  return ["unknown"];
}

export function resolveCanonicalLocation(
  context: ProjectContextForChapter,
  rawLocation: string | null | undefined,
): string | null {
  const input = rawLocation?.trim();
  if (!input) return null;
  const lowered = input.toLowerCase();
  for (const loc of context.locations ?? []) {
    const names = [loc.name, ...(loc.aliases ?? [])].filter(Boolean).map((value) => value.toLowerCase());
    if (names.some((name) => lowered.includes(name) || name.includes(lowered))) {
      return loc.description ? `${loc.name} — ${loc.description}` : loc.name;
    }
  }
  return input;
}
