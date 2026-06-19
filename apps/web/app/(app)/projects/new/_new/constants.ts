/**
 * Constantes partagées du wizard de création de projet.
 *
 * Genres, presets visuels/ton, formats, ratings et niveaux d'intensité —
 * isolés ici pour faciliter la maintenance UX.
 */
export const GENRE_CARDS = [
  { emoji: "⚔️", label: "Shōnen", value: "shōnen" },
  { emoji: "🌆", label: "Seinen", value: "seinen" },
  { emoji: "💕", label: "Romance", value: "shōjo" },
  { emoji: "🌀", label: "Isekai", value: "isekai" },
  { emoji: "⚙️", label: "Mecha", value: "mecha" },
  { emoji: "🔮", label: "Horreur", value: "horreur" },
  { emoji: "🏃", label: "Sport", value: "sport" },
  { emoji: "🏥", label: "Médical", value: "médical" },
  { emoji: "🗡️", label: "Fantasy", value: "fantasy" },
  { emoji: "🔬", label: "Sci-Fi", value: "sci-fi" },
  { emoji: "🕵️", label: "Mystère", value: "mystère" },
  { emoji: "💀", label: "Dark / Gore", value: "dark fantasy" },
] as const;

export const GENRE_FAMILIES = [
  {
    label: "Action / Aventure",
    genres: ["shōnen", "action", "aventure", "fantasy", "dark fantasy", "isekai"],
  },
  {
    label: "Drame / Seinen",
    genres: ["seinen", "drame", "psychologique", "thriller", "mystère", "horreur"],
  },
  {
    label: "Romance / Slice of life",
    genres: ["shōjo", "romance", "romance tragique", "slice of life", "comédie"],
  },
  {
    label: "Sci-Fi / Cyberpunk / Sport",
    genres: ["cyberpunk", "sci-fi", "post-apocalyptique", "mecha", "sport", "médical"],
  },
] as const;

export const TONE_PRESETS = [
  "sombre et brutal",
  "mélancolique",
  "épique",
  "humoristique",
  "romantique",
  "oppressant",
  "mystérieux",
] as const;

export const VISUAL_PRESETS = [
  "encre noire détaillée, style seinen",
  "lignes fines shōnen, dynamique",
  "aquarelle douce, shōjo",
  "cyberpunk neon, Masamune Shirow",
  "horreur sombre, Junji Ito",
  "trait épuré, minimaliste",
] as const;

/**
 * Sprint 1 — Reader refacto : on ne garde que les formats officiellement
 * supportés par le reader. "roman graphique" était proposé mais sans aucun
 * chemin de lecture dédié (tombait en manga par défaut). Pour éviter la
 * confusion produit, on le retire du preset. Les projets existants avec
 * `format="roman graphique"` en DB continuent de fonctionner (le reader
 * les lit comme du manga) mais on ne l'expose plus à la création.
 *
 * ARCH-3 — Le format "simple" (storyboard rapide, 1 panel/page, style
 * sketch/aquarelle) est désormais supporté nativement par le pipeline.
 */
export const FORMAT_PRESETS = ["manga", "webtoon", "simple"] as const;
export type FormatKey = (typeof FORMAT_PRESETS)[number];

export const FORMAT_LABELS: Record<FormatKey, string> = {
  manga: "manga",
  webtoon: "webtoon",
  simple: "simple (storyboard)",
};

export const RATING_PRESETS = [
  "GENERAL",
  "TEEN",
  "MATURE",
  "ADULT_RESTRICTED",
] as const;

export const INTENSITY_PRESETS = [
  { key: "GENERAL_SAFE", label: "Tout public" },
  { key: "TEEN", label: "Ado" },
  { key: "MATURE_DRAMA", label: "Mature (drame)" },
  { key: "MATURE_VISUAL", label: "Mature (visuel)" },
  { key: "ADULT_EXPLICIT", label: "Adulte explicite" },
] as const;

export type IntensityKey = (typeof INTENSITY_PRESETS)[number]["key"];
export type RatingKey = (typeof RATING_PRESETS)[number];

export const TOTAL_STEPS = 5;

export const ERA_PRESETS = [
  "Japon contemporain",
  "Monde médiéval-fantastique",
  "Cyberpunk",
  "Post-apocalyptique",
  "Edo / samouraï",
  "Espace lointain",
] as const;

export const THEME_PRESETS = [
  "Vengeance",
  "Rédemption",
  "Liberté",
  "Loyauté",
  "Sacrifice",
  "Passage à l'âge adulte",
  "Pouvoir corrompt",
] as const;
