/**
 * FONT-1 — Configuration des polices manga pour le compositor Sharp.
 *
 * Sharp utilise fontconfig sous Linux et les polices système sur macOS/Windows.
 * Ce module définit les familles de polices CSS utilisées dans les SVG générés.
 *
 * Note: Les polices custom (Anime Ace, Bangers, etc.) doivent être installées
 * sur le système ou téléchargées via `pnpm fonts:download` pour le dev local.
 * En production sur Render, on utilise les fallbacks système.
 */

export interface MangaFontConfig {
  dialogue: string;
  dialogueItalic: string;
  narration: string;
  sfx: string;
  sfxJapanese: string;
  whisper: string;
}

/**
 * Configuration des polices manga avec fallbacks robustes.
 *
 * Les polices sont listées par ordre de préférence :
 * - Polices premium (CC Wild Words) si disponibles
 * - Polices gratuites (Anime Ace, Bangers, Noto Sans JP)
 * - Polices système en dernier recours
 */
const MANGA_FONTS: MangaFontConfig = {
  dialogue: "'Anime Ace 2.0 BB', 'Comic Neue', 'Arial Rounded MT Bold', 'Comic Sans MS', sans-serif",
  dialogueItalic: "'Anime Ace 2.0 BB Italic', 'Comic Neue', 'Arial Rounded MT Bold', sans-serif",
  narration: "'Anime Ace 2.0 BB', 'Noto Sans JP', 'Hiragino Sans', sans-serif",
  sfx: "'Bangers', 'Impact', 'Arial Black', sans-serif",
  sfxJapanese: "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif",
  whisper: "'Anime Ace 2.0 BB Italic', 'Comic Neue', sans-serif",
};

let logged = false;

export function getMangaFontConfig(): MangaFontConfig {
  if (!logged) {
    logged = true;
    console.info("[font-loader] using manga font config with system fallbacks");
  }
  return MANGA_FONTS;
}

export function getFontsDir(): string {
  return "";
}

export function isFontAvailable(_filename: string): boolean {
  return false;
}

export function listAvailableFonts(): string[] {
  return [];
}

export function resetFontCache(): void {
  logged = false;
}
