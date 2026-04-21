"use client";

/**
 * Sprint 2 — Composition des panels
 *
 * Rendu des cartouches narratifs (narration off, voix intérieure,
 * transitions temporelles). Placement par défaut en haut du panel avec
 * fond dégradé ; la position peut être overridée via le bubble-compositor.
 */

import type { BubbleLayout } from "./bubble-layout-model";

export interface PanelCaptionOverlayProps {
  captions: ReadonlyArray<BubbleLayout>;
  isWebtoon?: boolean;
  className?: string;
}

export function PanelCaptionOverlay({
  captions,
  isWebtoon = false,
  className,
}: PanelCaptionOverlayProps) {
  if (captions.length === 0) return null;

  return (
    <div className={`pointer-events-none absolute inset-0 z-10 ${className ?? ""}`}>
      {captions.map((caption) => (
        <CaptionBlock key={caption.bubbleId} caption={caption} isWebtoon={isWebtoon} />
      ))}
    </div>
  );
}

function CaptionBlock({ caption, isWebtoon }: { caption: BubbleLayout; isWebtoon: boolean }) {
  const { bounds, text } = caption;

  const style: React.CSSProperties = {
    position: "absolute",
    left: `${bounds.x}%`,
    top: `${bounds.y}%`,
    width: `${bounds.width}%`,
    minHeight: `${bounds.height}%`,
    background:
      "linear-gradient(180deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.5) 70%, rgba(0,0,0,0.25) 100%)",
    backdropFilter: "blur(4px)",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
    padding: isWebtoon ? "0.75rem 1.25rem" : "0.5rem 0.75rem",
  };

  return (
    <div style={style}>
      <p
        className={`italic text-white/90 ${
          isWebtoon ? "text-sm leading-relaxed" : "text-[11px] leading-snug"
        }`}
      >
        {text}
      </p>
    </div>
  );
}

export default PanelCaptionOverlay;
