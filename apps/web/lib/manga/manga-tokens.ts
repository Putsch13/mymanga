import type { CSSProperties } from "react";

/**
 * Design tokens for manga / webtoon panel typography & bubble shells.
 *
 * Goal: get rid of magic `text-[2.5px]` / `text-[10px]` numbers scattered
 * across panel components. All in-panel typography must reference these
 * tokens so visual coherence is guaranteed and a single change cascades.
 *
 * Sizing strategy: rely on `clamp(min, scale, max)` with `cqw` (container
 * query width) so text scales with the panel size while staying legible
 * on small screens. This requires the parent to declare
 * `style={{ containerType: "inline-size" }}`.
 */

type FormatKey = "manga" | "webtoon";

export interface MangaTextToken {
  fontSize: string;
  lineHeight: number;
  letterSpacing?: string;
}

export interface MangaTypographyTokens {
  /** Body of dialogue / shout / thought balloons inside the panel. */
  dialogue: MangaTextToken;
  /** Narration captions (boxed text laid over the panel). */
  narration: MangaTextToken;
  /** Speaker label printed above a dialogue line. */
  speakerLabel: MangaTextToken;
  /** SFX onomatopoeia — kept large by design, no clamp on bottom. */
  sfx: MangaTextToken;
  /** Off-panel fallback text rendered under the image (compact). */
  fallback: {
    narration: MangaTextToken;
    speakerLabel: MangaTextToken;
    dialogue: MangaTextToken;
  };
}

const MANGA_TYPOGRAPHY_MANGA: MangaTypographyTokens = {
  dialogue: {
    fontSize: "clamp(10px, 1.4cqw, 16px)",
    lineHeight: 1.25,
  },
  narration: {
    fontSize: "clamp(9px, 1.25cqw, 14px)",
    lineHeight: 1.3,
  },
  speakerLabel: {
    fontSize: "clamp(8px, 1.1cqw, 12px)",
    lineHeight: 1.1,
    letterSpacing: "0.04em",
  },
  sfx: {
    fontSize: "clamp(20px, 4.5cqw, 56px)",
    lineHeight: 1,
  },
  fallback: {
    narration: { fontSize: "11px", lineHeight: 1.3 },
    speakerLabel: { fontSize: "8px", lineHeight: 1.1, letterSpacing: "0.04em" },
    dialogue: { fontSize: "10px", lineHeight: 1.25 },
  },
};

const MANGA_TYPOGRAPHY_WEBTOON: MangaTypographyTokens = {
  dialogue: {
    fontSize: "clamp(11px, 1.6cqw, 18px)",
    lineHeight: 1.3,
  },
  narration: {
    fontSize: "clamp(10px, 1.4cqw, 16px)",
    lineHeight: 1.35,
  },
  speakerLabel: {
    fontSize: "clamp(9px, 1.2cqw, 13px)",
    lineHeight: 1.1,
    letterSpacing: "0.04em",
  },
  sfx: {
    fontSize: "clamp(24px, 5cqw, 64px)",
    lineHeight: 1,
  },
  fallback: {
    narration: { fontSize: "12px", lineHeight: 1.35 },
    speakerLabel: { fontSize: "9px", lineHeight: 1.1, letterSpacing: "0.04em" },
    dialogue: { fontSize: "11px", lineHeight: 1.3 },
  },
};

/**
 * Returns the typography tokens for the requested format.
 * Defaults to manga if `format` is undefined / unknown.
 */
export function getMangaTypography(format: FormatKey | string | null | undefined): MangaTypographyTokens {
  return format === "webtoon" ? MANGA_TYPOGRAPHY_WEBTOON : MANGA_TYPOGRAPHY_MANGA;
}

/**
 * Bubble / overlay shell tokens (radii, padding, shadow).
 * Used by `PanelTextOverlay` and any custom bubble compositor.
 */
export const MANGA_BUBBLE = {
  borderRadius: {
    speech: "0.5rem",
    thought: "1rem",
    shout: "0.125rem",
    bandeau: "0.125rem",
    embedded: "0.375rem",
    narrationBox: "0.375rem",
  },
  borderWidth: {
    base: "1px",
    accent: "1.5px",
  },
  shadow: {
    soft: "0 1px 2px rgba(0,0,0,0.18)",
    medium: "0.8px 1.2px 1.5px rgba(0,0,0,0.35)",
    deep: "0 2px 6px rgba(0,0,0,0.45)",
  },
  paddingPct: 2,
} as const;

/**
 * Helper that turns a token into a `CSSProperties` object — convenient
 * for spreading into `style={{ ... }}` in React components.
 */
export function tokenToStyle(token: MangaTextToken): CSSProperties {
  return {
    fontSize: token.fontSize,
    lineHeight: token.lineHeight,
    letterSpacing: token.letterSpacing,
  };
}
