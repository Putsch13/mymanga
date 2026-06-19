"use client";

import { useEffect, useRef, useCallback } from "react";
import { getStableImageUrl } from "@/lib/images/get-stable-image-url";

export interface CanvasPanel {
  id: string;
  imageUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  dialogue?: { text: string; zone?: string };
  sfx?: string[];
}

interface MangaCanvasRendererProps {
  panels: CanvasPanel[];
  pageWidth?: number;
  pageHeight?: number;
  darkMode?: boolean;
  gutterWidth?: number;
  onLoad?: () => void;
  className?: string;
}

const GUTTER = 3;

export function MangaCanvasRenderer({
  panels,
  pageWidth = 800,
  pageHeight = 1130,
  darkMode = false,
  gutterWidth = GUTTER,
  onLoad,
  className,
}: MangaCanvasRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const render = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Fond de page
    ctx.fillStyle = darkMode ? "#0a0a0a" : "#ffffff";
    ctx.fillRect(0, 0, pageWidth, pageHeight);

    // Charger et dessiner chaque panel
    await Promise.all(
      panels.map(
        (panel) =>
          new Promise<void>((resolve) => {
            if (!panel.imageUrl) {
              // Placeholder
              ctx.fillStyle = "#1a1a1a";
              ctx.fillRect(panel.x + gutterWidth, panel.y + gutterWidth, panel.width - gutterWidth * 2, panel.height - gutterWidth * 2);
              drawGutter(ctx, panel, gutterWidth);
              resolve();
              return;
            }

            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
              // Clip au rectangle du panel
              ctx.save();
              ctx.beginPath();
              ctx.rect(panel.x + gutterWidth, panel.y + gutterWidth, panel.width - gutterWidth * 2, panel.height - gutterWidth * 2);
              ctx.clip();

              // Cover-fit
              const scale = Math.max(panel.width / img.naturalWidth, panel.height / img.naturalHeight);
              const sw = img.naturalWidth * scale;
              const sh = img.naturalHeight * scale;
              ctx.drawImage(
                img,
                panel.x + (panel.width - sw) / 2,
                panel.y + (panel.height - sh) / 2,
                sw,
                sh,
              );
              ctx.restore();

              // Gutter (bordure noire)
              drawGutter(ctx, panel, gutterWidth);

              // SFX
              if (panel.sfx?.length) {
                panel.sfx.slice(0, 2).forEach((sfx, i) => {
                  ctx.save();
                  const sfxSize = Math.min(52, 28 + sfx.length * 2);
                  ctx.font = `900 ${sfxSize}px Impact, 'Arial Black', sans-serif`;
                  ctx.fillStyle = "white";
                  ctx.strokeStyle = "#000";
                  ctx.lineWidth = 4;
                  const sfxX = panel.x + panel.width * (i % 2 === 0 ? 0.3 : 0.7);
                  const sfxY = panel.y + panel.height * (0.38 + i * 0.18);
                  ctx.translate(sfxX, sfxY);
                  ctx.rotate(((i % 2 === 0 ? -16 : 13) * Math.PI) / 180);
                  ctx.strokeText(sfx.toUpperCase(), 0, 0);
                  ctx.fillText(sfx.toUpperCase(), 0, 0);
                  ctx.restore();
                });
              }

              resolve();
            };
            img.onerror = () => {
              ctx.fillStyle = "#1a1a1a";
              ctx.fillRect(panel.x + gutterWidth, panel.y + gutterWidth, panel.width - gutterWidth * 2, panel.height - gutterWidth * 2);
              drawGutter(ctx, panel, gutterWidth);
              resolve();
            };
            img.src = panel.imageUrl;
          }),
      ),
    );

    onLoad?.();
  }, [panels, pageWidth, pageHeight, darkMode, gutterWidth, onLoad]);

  useEffect(() => {
    render();
  }, [render]);

  return (
    <canvas
      ref={canvasRef}
      width={pageWidth}
      height={pageHeight}
      className={className}
      style={{ width: "100%", height: "auto", display: "block" }}
    />
  );
}

function drawGutter(ctx: CanvasRenderingContext2D, panel: CanvasPanel, gutter: number) {
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = gutter;
  ctx.strokeRect(panel.x + gutter / 2, panel.y + gutter / 2, panel.width - gutter, panel.height - gutter);
}

/**
 * Calcule les positions des panels dans la page selon un layout template.
 * Utilisé par le reader pour passer les panels au MangaCanvasRenderer.
 */
export function computePanelPositions(
  images: Array<{ id: string; imageUrl: string | null; persistedUrl?: string | null; metadata?: Record<string, unknown> | null }>,
  pageWidth: number,
  pageHeight: number,
  colCount: number = 2,
): CanvasPanel[] {
  const rowCount = Math.ceil(images.length / colCount);
  const colW = Math.floor(pageWidth / colCount);
  const rowH = Math.floor(pageHeight / rowCount);

  return images.map((img, idx) => ({
    id: img.id,
    imageUrl: getStableImageUrl(img) ?? "",
    x: (idx % colCount) * colW,
    y: Math.floor(idx / colCount) * rowH,
    width: colW,
    height: rowH,
    sfx: parseSfxFromMeta(img.metadata),
  }));
}

function parseSfxFromMeta(meta: Record<string, unknown> | null | undefined): string[] {
  if (!meta?.sfx) return [];
  const raw = meta.sfx;
  if (typeof raw === "string") return raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (Array.isArray(raw)) return raw.filter((s) => typeof s === "string") as string[];
  return [];
}
