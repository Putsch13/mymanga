"use client";

import type { CSSProperties } from "react";

/**
 * PATCH 10 — Overlay texte in-panel (cartouche / bandeau / embedded / narration).
 * Remplace progressivement {@link PanelBubbleOverlay} + partie caption,
 * sans ellipses ni queues « bulle FAL ».
 */

import type { PanelTextLayoutBox } from "./bubble-compositor";

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

  const baseText = isWebtoon ? "text-[2.8px]" : "text-[2.5px]";

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-10 ${className ?? ""}`}
      aria-hidden={false}
    >
      {all.map((box, idx) => (
        <TextBlockDiv key={`${box.kind}-${idx}-${box.text.slice(0, 12)}`} box={box} baseTextClass={baseText} />
      ))}
    </div>
  );
}

function TextBlockDiv({ box, baseTextClass }: { box: PanelTextLayoutBox; baseTextClass: string }) {
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
          style={{ fontSize: "2.2px", lineHeight: 1.1 }}
        >
          {speaker}
        </span>
      ) : null}
      <p className={`min-h-0 flex-1 font-medium leading-snug ${baseTextClass}`}>{text}</p>
    </div>
  );
}

export default PanelTextOverlay;
