/**
 * Chapter pipeline — helpers d'inférence visuelle (style, mood, layout).
 *
 * Extrait de chapter-pipeline.ts. Déduit :
 *  - `inferVisualStyle` : string résumant le rendering du projet (stylePack +
 *    visualStyle + fallback sur genre)
 *  - `inferMood` : PanelMood selon tension + genre
 *  - `inferLayout` : GridLayout selon tension + panelCount
 */

import type { ProjectContextForChapter, PanelMood, GridLayout } from "./shared-types";

export function inferVisualStyle(context: ProjectContextForChapter): string {
  const stylePackBits = [
    context.stylePack?.renderFamily,
    context.stylePack?.lineWeight,
    context.stylePack?.shadingMode,
    context.stylePack?.contrastProfile,
    context.stylePack?.cameraLanguage,
  ]
    .filter(Boolean)
    .join(", ");
  const vs = context.project.visualStyle ?? "";
  if (vs && stylePackBits) return `${vs}, ${stylePackBits}`;
  if (vs) return vs;
  if (stylePackBits) return stylePackBits;
  const genre = (context.project.primaryGenre ?? "").toLowerCase();
  if (genre.includes("cyber")) return "cyberpunk neon manga, detailed ink, Masamune Shirow style";
  if (genre.includes("horror")) return "dark horror manga, heavy shadows, Junji Ito style";
  if (genre.includes("romance")) return "soft shojo manga, delicate linework, pastel tones";
  return "detailed action manga, dynamic lines, Kentaro Miura style";
}

export function inferMood(tension: number, genre: string): PanelMood {
  if (genre.includes("horror")) return tension > 6 ? "horror" : "tension";
  if (genre.includes("romance")) return tension > 6 ? "emotion" : "romance";
  if (tension >= 9) return "revelation";
  if (tension >= 7) return "action";
  if (tension >= 5) return "tension";
  if (tension >= 3) return "dramatic";
  return "calm";
}

export function inferLayout(tension: number, panelCount: number): GridLayout {
  // Layouts UI disponibles :
  // - 6 panels : A, B, D
  // - 5 panels : C ou E
  // - 4 panels : F (2×2)
  if (panelCount >= 6) return tension >= 8 ? "D" : tension >= 5 ? "B" : "A";
  if (panelCount === 5) return tension >= 6 ? "E" : "C";
  return "F";
}
