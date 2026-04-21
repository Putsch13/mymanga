"use client";

/**
 * Sprint 2 — Composition des panels
 *
 * Rendu des bulles de dialogue depuis un `PanelTextLayer`. Reçoit des bounds
 * en pourcentage du panel (via le compositeur), indépendamment du viewport.
 *
 * Responsabilités :
 *   - rendu SVG overlay absolute (coordonnées viewBox 0..100 × 0..100)
 *   - support des variants de style (speech / thought / shout)
 *   - queue de bulle (tail) orientée selon tailAnchor.direction
 *   - speaker badge au-dessus du texte
 *
 * Ne gère PAS :
 *   - édition / déplacement (sera géré par panel-edit-controls)
 *   - caption (géré par panel-caption-overlay)
 *   - SFX (géré par panel-sfx-overlay)
 */

import type { BubbleLayout } from "./bubble-layout-model";

export interface PanelBubbleOverlayProps {
  bubbles: ReadonlyArray<BubbleLayout>;
  hidden?: boolean;
  isWebtoon?: boolean;
  className?: string;
}

export function PanelBubbleOverlay({
  bubbles,
  hidden = false,
  isWebtoon = false,
  className,
}: PanelBubbleOverlayProps) {
  if (hidden || bubbles.length === 0) return null;

  const fontSize = isWebtoon ? 3.2 : 2.8;
  const speakerSize = isWebtoon ? 2.6 : 2.2;

  return (
    <svg
      className={`pointer-events-none absolute inset-0 z-10 h-full w-full ${className ?? ""}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {bubbles.map((bubble) => (
        <BubbleShape
          key={bubble.bubbleId}
          bubble={bubble}
          fontSize={fontSize}
          speakerSize={speakerSize}
        />
      ))}
    </svg>
  );
}

interface BubbleShapeProps {
  bubble: BubbleLayout;
  fontSize: number;
  speakerSize: number;
}

function BubbleShape({ bubble, fontSize, speakerSize }: BubbleShapeProps) {
  const { bounds, tailAnchor, speakerId, text, styleVariant } = bubble;
  const { x, y, width, height } = bounds;
  const rx = styleVariant === "shout" ? 1 : 3;
  const padding = 2;

  const strokeDash = styleVariant === "soft" ? "1.5 1.5" : undefined;

  const tailPath = tailAnchor
    ? buildTailPath(bounds, tailAnchor.direction)
    : null;

  return (
    <g
      style={{ filter: "drop-shadow(0.8px 1.2px 1.5px rgba(0,0,0,0.45))" }}
      data-bubble-id={bubble.bubbleId}
      data-kind={bubble.kind}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={rx}
        ry={rx}
        fill="white"
        stroke="#1c1917"
        strokeWidth={0.6}
        strokeDasharray={strokeDash}
      />
      {tailPath && (
        <path
          d={tailPath}
          fill="white"
          stroke="#1c1917"
          strokeWidth={0.5}
          strokeDasharray={strokeDash}
        />
      )}
      <foreignObject
        x={x + padding}
        y={y + padding}
        width={width - padding * 2}
        height={height - padding * 2}
      >
        <div
          // @ts-expect-error xmlns needed for foreignObject in SVG
          xmlns="http://www.w3.org/1999/xhtml"
          style={{
            fontFamily: "system-ui, sans-serif",
            fontSize: `${fontSize}px`,
            lineHeight: 1.3,
            color: "#1c1917",
            overflow: "hidden",
            width: "100%",
            height: "100%",
          }}
        >
          {speakerId && (
            <div
              style={{
                fontSize: `${speakerSize}px`,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "#78716c",
                marginBottom: "1px",
              }}
            >
              {speakerId}
            </div>
          )}
          <div style={{ fontWeight: styleVariant === "shout" ? 800 : 500 }}>{text}</div>
        </div>
      </foreignObject>
    </g>
  );
}

function buildTailPath(
  bounds: { x: number; y: number; width: number; height: number },
  direction: "up" | "down" | "left" | "right" | "none",
): string | null {
  if (direction === "none") return null;
  const { x, y, width, height } = bounds;
  const TAIL_LEN = 5;
  switch (direction) {
    case "down": {
      const tx = x + width * 0.3;
      const by = y + height;
      return `M${tx},${by} L${tx + width * 0.05},${by + TAIL_LEN} L${tx + width * 0.15},${by} Z`;
    }
    case "up": {
      const tx = x + width * 0.55;
      return `M${tx},${y} L${tx + width * 0.05},${y - TAIL_LEN} L${tx + width * 0.15},${y} Z`;
    }
    case "left": {
      const ty = y + height * 0.55;
      return `M${x},${ty} L${x - TAIL_LEN},${ty + height * 0.05} L${x},${ty + height * 0.15} Z`;
    }
    case "right": {
      const tx = x + width;
      const ty = y + height * 0.55;
      return `M${tx},${ty} L${tx + TAIL_LEN},${ty + height * 0.05} L${tx},${ty + height * 0.15} Z`;
    }
  }
}

export default PanelBubbleOverlay;
