"use client";

/**
 * Sprint 2 — Composition des panels
 *
 * Rendu des SFX (onomatopées, cris) au-dessus de l'image. Extrait de
 * `manga-panel.tsx`. Deux variantes :
 *   - `sfx_bold` : gros texte central (pas de dialogue présent)
 *   - `sfx_subtle` : texte d'angle bas-droit (coexiste avec une bulle)
 */

import type { BubbleLayout } from "./bubble-layout-model";

export interface PanelSfxOverlayProps {
  sfx: ReadonlyArray<BubbleLayout>;
  seed?: number;
  isWebtoon?: boolean;
  className?: string;
}

export function PanelSfxOverlay({
  sfx,
  seed = 0,
  isWebtoon = false,
  className,
}: PanelSfxOverlayProps) {
  if (sfx.length === 0) return null;

  return (
    <div className={`pointer-events-none absolute inset-0 z-10 ${className ?? ""}`}>
      {sfx.map((item, idx) => (
        <SfxItem key={item.bubbleId} sfx={item} seed={seed + idx} isWebtoon={isWebtoon} />
      ))}
    </div>
  );
}

function SfxItem({
  sfx,
  seed,
  isWebtoon,
}: {
  sfx: BubbleLayout;
  seed: number;
  isWebtoon: boolean;
}) {
  const rotation = ((seed * 7 + 3) % 25) - 12;
  const { bounds, styleVariant, text } = sfx;

  const style: React.CSSProperties = {
    position: "absolute",
    left: `${bounds.x}%`,
    top: `${bounds.y}%`,
    width: `${bounds.width}%`,
    height: `${bounds.height}%`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transform: `rotate(${rotation}deg)`,
    transformOrigin: "center",
  };

  if (styleVariant === "sfx_subtle") {
    return (
      <div style={style}>
        <span
          className={`select-none font-black italic tracking-wider ${
            isWebtoon ? "text-xl" : "text-base"
          }`}
          style={{
            color: "#fbbf24",
            textShadow: "1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000",
            display: "inline-block",
          }}
        >
          {text}
        </span>
      </div>
    );
  }

  return (
    <div style={style}>
      <span
        className={`select-none font-black italic tracking-wider ${
          isWebtoon ? "text-4xl sm:text-5xl" : "text-2xl sm:text-3xl"
        }`}
        style={{
          color: "rgba(255,255,255,0.92)",
          textShadow:
            "3px 3px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 0 0 12px rgba(239,68,68,0.5), 0 0 30px rgba(245,158,11,0.3)",
          display: "inline-block",
          transform: "scale(1.05)",
        }}
      >
        {text}
      </span>
    </div>
  );
}

export default PanelSfxOverlay;
