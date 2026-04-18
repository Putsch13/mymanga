/**
 * P5.2 — Constantes UI du reader (suggestions d'intent pour continuer
 * le chapitre, quick tags). Extraites pour alléger `manga-book-reader`
 * et permettre leur réutilisation éventuelle par d'autres écrans
 * (e.g. studio).
 */

export const READER_SUGGESTIONS = [
  {
    label: "Révélation majeure",
    intent: "Le lecteur découvre enfin le secret qui lie les deux familles.",
  },
  {
    label: "Confrontation",
    intent: "Les deux camps se retrouvent face à face, tension maximale.",
  },
  {
    label: "Ellipse temporelle",
    intent: "On saute trois jours plus tard, après la tempête.",
  },
];

export const READER_QUICK_TAGS = [
  "plus d\u2019action",
  "plus de romance",
  "plus de noirceur",
  "twist",
  "nouveau personnage",
  "mort d\u2019un personnage",
];
