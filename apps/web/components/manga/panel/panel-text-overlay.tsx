"use client";

import type { CSSProperties } from "react";

/**
 * PATCH 10 — Overlay texte in-panel (cartouche / bandeau / embedded / narration).
 * Remplace progressivement {@link PanelBubbleOverlay} + partie caption,
 * sans ellipses ni queues « bulle FAL ».
 *
 * ARCH-7 — typographie pilotée par les design tokens manga-tokens.ts.
 */

import type { PanelTextLayoutBox } from "./bubble-compositor";
import { getMangaTypography, tokenToStyle } from "@/lib/manga/manga-tokens";

export interface PanelTextOverlayProps {
  dialogueBoxes: ReadonlyArray<PanelTextLayoutBox>;
  captionBoxes: ReadonlyArray<PanelTextLayoutBox>;
  narrationBoxes: ReadonlyArray<PanelTextLayoutBox>;
  hidden?: boolean;
  isWebtoon?: boolean;
  className?: string;
}

export function PanelTextOverlay({
  dialogueBoxes,
  captionBoxes,
  narrationBoxes,
  hidden = false,
  isWebtoon = false,
  className,
}: PanelTextOverlayProps) {
  const all = [...narrationBoxes, ...captionBoxes, ...dialogueBoxes];
  if (hidden || all.length === 0) return null;

  const typography = getMangaTypography(isWebtoon ? "webtoon" : "manga");
  const dialogueStyle = tokenToStyle(typography.dialogue);
  const narrationStyle = tokenToStyle(typography.narration);
  const speakerStyle = tokenToStyle(typography.speakerLabel);

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-10 ${className ?? ""}`}
      style={{ containerType: "inline-size" }}
      aria-hidden={false}
    >
      {all.map((box, idx) => (
        <TextBlockDiv
          key={`${box.kind}-${idx}-${box.text.slice(0, 12)}`}
          box={box}
          dialogueStyle={dialogueStyle}
          narrationStyle={narrationStyle}
          speakerStyle={speakerStyle}
        />
      ))}
    </div>
  );
}

function TextBlockDiv({
  box,
  dialogueStyle,
  narrationStyle,
  speakerStyle,
}: {
  box: PanelTextLayoutBox;
  dialogueStyle: CSSProperties;
  narrationStyle: CSSProperties;
  speakerStyle: CSSProperties;
}) {
  const { x, y, width, height, visualVariant, text, speaker, kind } = box;
  const style: CSSProperties = {
    left: `${x}%`,
    top: `${y}%`,
    width: `${width}%`,
    height: `${height}%`,
  };

  const shell =
    visualVariant === "embedded"
      ? "rounded-md border border-white/20 bg-stone-950/80 text-stone-100 shadow-inner"
      : visualVariant === "narration_box"
        ? "rounded-md border border-amber-900/30 bg-[#f4efe4] text-stone-900 shadow-sm"
        : visualVariant === "bandeau"
          ? "rounded-sm border border-stone-800 bg-stone-900/90 text-stone-100"
          : "rounded-lg border border-stone-900 bg-white text-stone-900 shadow-md";

  const pad = visualVariant === "bandeau" ? "px-1 py-0.5" : "px-1.5 py-1";

  const bodyStyle = kind === "narration" || kind === "caption" ? narrationStyle : dialogueStyle;

  return (
    <div
      className={`absolute flex flex-col overflow-hidden ${shell} ${pad}`}
      style={style}
      data-text-kind={kind}
      data-text-variant={visualVariant}
    >
      {speaker && kind === "dialogue" ? (
        <span
          className={`mb-0.5 font-bold uppercase tracking-wide text-stone-500 ${visualVariant === "embedded" ? "text-stone-400" : ""}`}
          style={speakerStyle}
        >
          {speaker}
        </span>
      ) : null}
      <p className="min-h-0 flex-1 font-medium leading-snug" style={bodyStyle}>
        {text}
      </p>
    </div>
  );
}

export default PanelTextOverlay;
