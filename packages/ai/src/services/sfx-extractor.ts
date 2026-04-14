/**
 * COMP-4 — SFX Extractor
 * Extrait les SFX depuis les metadata d'un panel et les positionne dans la page composite.
 */

import type { SfxElement } from "./manga-page-compositor";

type SfxStyle = "impact" | "electric" | "soft";

// Dictionnaire de SFX communs avec leur style prédéfini
const SFX_STYLE_MAP: Record<string, SfxStyle> = {
  BOOM: "impact",
  CRASH: "impact",
  BANG: "impact",
  SLAM: "impact",
  THUD: "impact",
  CRACK: "impact",
  SNAP: "impact",
  PUNCH: "impact",
  POW: "impact",
  WHACK: "impact",
  SLASH: "electric",
  ZAP: "electric",
  SHOCK: "electric",
  SPARK: "electric",
  FLASH: "electric",
  SWOOSH: "electric",
  WHOOSH: "electric",
  HUM: "soft",
  SIGH: "soft",
  DRIP: "soft",
  TICK: "soft",
  CLICK: "soft",
  WHISPER: "soft",
};

/**
 * Extrait et positionne les SFX d'un panel dans la page composite.
 * @param sfxTexts - liste des textes SFX (ex: ["BOOM", "SLASH"])
 */
export function extractSfxElements(
  sfxTexts: string[],
  panelX: number,
  panelY: number,
  panelWidth: number,
  panelHeight: number,
): SfxElement[] {
  if (!sfxTexts.length) return [];

  return sfxTexts.slice(0, 3).map((text, idx) => {
    const normalized = text.toUpperCase().trim();
    const style = inferSfxStyle(normalized);

    // Taille de police : plus le SFX est court + impactant → plus grande police
    const baseFontSize = style === "impact" ? 72 : style === "electric" ? 56 : 36;
    const fontSize = Math.min(baseFontSize, Math.max(28, baseFontSize - normalized.length * 2));

    // Position variée selon l'index
    const xFactors = [0.35, 0.65, 0.5];
    const yFactors = [0.4, 0.35, 0.6];
    const rotations = [-18, 14, -8];

    return {
      text: normalized,
      x: Math.round(panelX + panelWidth * xFactors[idx % 3]),
      y: Math.round(panelY + panelHeight * yFactors[idx % 3]),
      fontSize,
      rotation: rotations[idx % 3],
      style,
    };
  });
}

/**
 * Parse les SFX depuis une string ou tableau depuis les metadata d'une SceneImage.
 * Accepte : string, string[], ou SFX séparés par des virgules.
 */
export function parseSfxFromMetadata(rawSfx: unknown): string[] {
  if (!rawSfx) return [];
  if (typeof rawSfx === "string") {
    return rawSfx.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (Array.isArray(rawSfx)) {
    return rawSfx.filter((s) => typeof s === "string").map((s) => (s as string).trim()).filter(Boolean);
  }
  return [];
}

function inferSfxStyle(text: string): SfxStyle {
  const upper = text.toUpperCase();
  if (SFX_STYLE_MAP[upper]) return SFX_STYLE_MAP[upper];
  // Heuristiques : les SFX courts en majuscules sont souvent des impacts
  if (text.length <= 4) return "impact";
  if (/ZZ|ZAP|CRACKLE|SPARK/.test(upper)) return "electric";
  if (/SOFT|GENTLE|QUIET|MURMUR/.test(upper)) return "soft";
  return "impact";
}
