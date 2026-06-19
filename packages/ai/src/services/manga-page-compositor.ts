/**
 * COMP-1 — Page Compositor serveur avec Sharp.
 * Assemble les panels générés + bulles + SFX en une vraie image de page manga.
 * Utilisé pour l'export PDF et le cache de pages.
 *
 * SPRINT 1.1 — Polices manga professionnelles.
 * Les polices sont résolues via font-loader qui cherche dans exports/fonts/
 * avec fallback sur les polices système si absentes.
 */

import sharp from "sharp";
import { getMangaFontConfig } from "@manga-ai-studio/exports/fonts";

const FONTS = getMangaFontConfig();

export interface CompositePanel {
  imageUrl: string;     // URL persistée (Supabase) ou fal CDN
  x: number;            // position X dans la page (px)
  y: number;            // position Y dans la page (px)
  width: number;        // largeur du panel (px)
  height: number;       // hauteur du panel (px)
  borderWidth?: number; // épaisseur du gutter (défaut 3px)
}

export interface DialogueBubble {
  text: string;
  speaker?: string;
  x: number;
  y: number;
  width: number;
  type: "speech" | "thought" | "shout" | "whisper" | "narration";
  tailDirection: "left" | "right" | "bottom" | "top";
}

/** Texte in-panel (px page) — remplace progressivement les bulles elliptiques. */
export type InPanelTextVariant = "cartouche" | "bandeau" | "embedded" | "narration_box";

export interface InPanelTextBox {
  text: string;
  speaker?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  variant: InPanelTextVariant;
}

export interface SfxElement {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  rotation: number;
  style: "impact" | "electric" | "soft";
}

export interface MangaPageCompositeInput {
  pageWidth: number;
  pageHeight: number;
  backgroundColor: string;
  panels: CompositePanel[];
  /** @deprecated Préférer dialogueBoxes / captionBoxes / narrationBoxes (PATCH 10). */
  bubbles?: DialogueBubble[];
  /** Texte dialogue en rectangles (coordonnées page px). */
  dialogueBoxes?: InPanelTextBox[];
  captionBoxes?: InPanelTextBox[];
  narrationBoxes?: InPanelTextBox[];
  sfxElements?: SfxElement[];
  gutterColor?: string;
  gutterWidth?: number;
  isSplashPage?: boolean;
}

export async function compositeMangaPage(
  input: MangaPageCompositeInput,
): Promise<Buffer> {
  const PAGE_W = input.pageWidth;
  const PAGE_H = input.pageHeight;
  const GUTTER = input.gutterWidth ?? 3;

  // Décomposer la couleur de fond
  const isDark = input.backgroundColor === "#000000" || input.backgroundColor === "#0a0a0a";
  const bg = isDark
    ? { r: 10, g: 10, b: 10, alpha: 1 as const }
    : { r: 255, g: 255, b: 255, alpha: 1 as const };

  const panelComposites: sharp.OverlayOptions[] = [];

  /**
   * P0-3 : placeholder explicite remplaçant l'ancienne "case noire" silencieuse.
   * Un panneau hachuré avec une bordure visible et un label "MISSING IMAGE"
   * permet de détecter immédiatement les pertes vs. croire à un rendu sombre.
   */
  async function buildMissingPanelPlaceholder(width: number, height: number, reason: string): Promise<Buffer> {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <defs>
        <pattern id="hatch" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="16" height="16" fill="#2a2a2a"/>
          <line x1="0" y1="0" x2="0" y2="16" stroke="#3a3a3a" stroke-width="8"/>
        </pattern>
      </defs>
      <rect width="${w}" height="${h}" fill="url(#hatch)"/>
      <rect x="4" y="4" width="${w - 8}" height="${h - 8}" fill="none" stroke="#e23a3a" stroke-width="3" stroke-dasharray="12,6"/>
      <text x="${w / 2}" y="${h / 2 - 6}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${Math.max(14, Math.min(32, Math.floor(w / 20)))}" font-weight="bold" fill="#ff6b6b">MISSING IMAGE</text>
      <text x="${w / 2}" y="${h / 2 + 18}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${Math.max(10, Math.min(18, Math.floor(w / 32)))}" fill="#cccccc">${reason.replace(/[<>&"']/g, "").slice(0, 48)}</text>
    </svg>`;
    return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
  }

  for (const panel of input.panels) {
    const innerW = Math.max(1, panel.width - GUTTER * 2);
    const innerH = Math.max(1, panel.height - GUTTER * 2);

    if (!panel.imageUrl) {
      const placeholder = await buildMissingPanelPlaceholder(innerW, innerH, "no URL resolved");
      panelComposites.push({ input: placeholder, left: panel.x + GUTTER, top: panel.y + GUTTER });
      continue;
    }

    try {
      const response = await fetch(panel.imageUrl, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      const panelBuffer = await sharp(Buffer.from(arrayBuffer))
        .resize(innerW, innerH, { fit: "cover", position: "centre" })
        .jpeg({ quality: 92 })
        .toBuffer();
      panelComposites.push({
        input: panelBuffer,
        left: panel.x + GUTTER,
        top: panel.y + GUTTER,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[compositor] panel load failed: ${panel.imageUrl} — ${msg}`);
      const placeholder = await buildMissingPanelPlaceholder(innerW, innerH, msg.slice(0, 40));
      panelComposites.push({ input: placeholder, left: panel.x + GUTTER, top: panel.y + GUTTER });
    }
  }

  // SVG pour les gutters (bordures noires entre panels)
  const gutterLines = input.panels.map((p) =>
    `<rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" fill="none" stroke="${input.gutterColor ?? "#000"}" stroke-width="${GUTTER}"/>`,
  ).join("\n");

  const gutterSvg = Buffer.from(
    `<svg width="${PAGE_W}" height="${PAGE_H}" xmlns="http://www.w3.org/2000/svg">${gutterLines}</svg>`,
  );

  const layoutBoxes = [
    ...(input.narrationBoxes ?? []),
    ...(input.captionBoxes ?? []),
    ...(input.dialogueBoxes ?? []),
  ];
  const inPanelLayoutOverlay =
    layoutBoxes.length > 0
      ? Buffer.from(generateInPanelTextLayoutSvg(layoutBoxes, PAGE_W, PAGE_H))
      : null;

  // SVG bulles elliptiques (legacy) — seulement si aucun layout in-panel
  const bubblesOverlay =
    !inPanelLayoutOverlay && input.bubbles && input.bubbles.length > 0
      ? Buffer.from(generateBubblesSvg(input.bubbles, PAGE_W, PAGE_H))
      : null;

  // SVG pour les SFX
  const sfxOverlay = input.sfxElements && input.sfxElements.length > 0
    ? Buffer.from(generateSfxSvg(input.sfxElements, PAGE_W, PAGE_H))
    : null;

  const composites: sharp.OverlayOptions[] = [
    ...panelComposites,
    { input: gutterSvg, top: 0, left: 0 },
  ];
  if (inPanelLayoutOverlay) composites.push({ input: inPanelLayoutOverlay, top: 0, left: 0 });
  if (bubblesOverlay) composites.push({ input: bubblesOverlay, top: 0, left: 0 });
  if (sfxOverlay) composites.push({ input: sfxOverlay, top: 0, left: 0 });

  return sharp({
    create: { width: PAGE_W, height: PAGE_H, channels: 4, background: bg },
  })
    .png()
    .composite(composites)
    .jpeg({ quality: 90, progressive: true })
    .toBuffer();
}

// ─── SVG texte in-panel (rectangles) ─────────────────────────────────────────

function generateInPanelTextLayoutSvg(boxes: InPanelTextBox[], pageW: number, pageH: number): string {
  const elements = boxes.map((b) => {
    const { x, y, width, height } = b;
    const rx = b.variant === "bandeau" ? 2 : 6;
    const pad = 4;
    const fontSize =
      b.variant === "narration_box" ? 13 : b.variant === "embedded" ? 12 : b.variant === "bandeau" ? 11 : 13;
    const titleSize = Math.max(9, fontSize - 1);
    const fill =
      b.variant === "narration_box"
        ? "#f4efe4"
        : b.variant === "embedded"
          ? "rgba(15,15,18,0.78)"
          : "#ffffff";
    const stroke = b.variant === "embedded" ? "rgba(255,255,255,0.25)" : "#1c1917";
    const textFill = b.variant === "embedded" ? "#f5f5f4" : "#0c0a09";
    const maxChars = Math.max(8, Math.floor((width - pad * 2) / (fontSize * 0.52)));
    const lines = wrapSvgText(b.text, maxChars);
    const lineH = fontSize + 3;
    const firstLineY = y + pad + (b.speaker ? titleSize + 2 : 0) + fontSize;
    const tspans = lines
      .map((line, i) =>
        i === 0
          ? `<tspan x="${x + width / 2}" y="${firstLineY}" text-anchor="middle">${escSvg(line)}</tspan>`
          : `<tspan x="${x + width / 2}" dy="${lineH}" text-anchor="middle">${escSvg(line)}</tspan>`,
      )
      .join("");
    // SPRINT 1.1 — Police narration pour les box in-panel
    const speakerNode = b.speaker
      ? `<text x="${x + width / 2}" y="${y + pad + titleSize}" text-anchor="middle" font-family="${FONTS.narration}" font-size="${titleSize}" font-weight="700" fill="${b.variant === "embedded" ? "#d6d3d1" : "#57534e"}" letter-spacing="0.04em">${escSvg(b.speaker)}</text>`
      : "";
    return `<g>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" ry="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>
      ${speakerNode}
      <text font-family="${FONTS.narration}" font-size="${fontSize}" font-weight="500" fill="${textFill}">${tspans}</text>
    </g>`;
  });
  return `<svg width="${pageW}" height="${pageH}" xmlns="http://www.w3.org/2000/svg">${elements.join("\n")}</svg>`;
}

function wrapSvgText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [text];
}

// ─── SVG Bulles ───────────────────────────────────────────────────────────────

function generateBubblesSvg(bubbles: DialogueBubble[], pageW: number, pageH: number): string {
  const elements = bubbles.map((b) => {
    const rx = b.width / 2;
    const ry = Math.max(22, Math.min(b.width * 0.35, b.text.length * 0.9));
    const fontSize = b.type === "shout" ? 18 : b.type === "whisper" ? 11 : 14;
    const fillColor = b.type === "narration" ? "#f0e6c8" : "#ffffff";
    const strokeW = b.type === "shout" ? 3 : 2;
    const fontWeight = b.type === "shout" ? "900" : "normal";

    // Tail
    const tailX = b.tailDirection === "left" ? b.x - rx : b.tailDirection === "right" ? b.x + rx : b.x;
    const tailY = b.tailDirection === "bottom" ? b.y + ry : b.tailDirection === "top" ? b.y - ry : b.y;

    // Text wrapping simple
    const maxCharsPerLine = Math.max(4, Math.floor(b.width / (fontSize * 0.58)));
    const words = b.text.split(" ");
    const lines: string[] = [];
    let curr = "";
    for (const w of words) {
      if (curr && (curr + " " + w).length > maxCharsPerLine) {
        lines.push(curr);
        curr = w;
      } else {
        curr = curr ? curr + " " + w : w;
      }
    }
    if (curr) lines.push(curr);

    const lineH = fontSize + 3;
    // SPRINT 1.1 — Polices manga pro (dialogue/whisper)
    const fontFamily = b.type === "whisper" ? FONTS.whisper : FONTS.dialogue;
    const textBlock = lines.map((line, i) => {
      const y = b.y - ((lines.length - 1) * lineH) / 2 + i * lineH;
      return `<text x="${b.x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="${fontFamily}" font-size="${fontSize}" font-weight="${fontWeight}" fill="#000">${escSvg(line)}</text>`;
    }).join("\n");

    const tailPoly = b.tailDirection === "bottom" || b.tailDirection === "top"
      ? `<polygon points="${b.x - 8},${tailY} ${b.x + 8},${tailY} ${tailX},${tailY + (b.tailDirection === "bottom" ? 14 : -14)}" fill="${fillColor}" stroke="#000" stroke-width="${strokeW}"/>`
      : `<polygon points="${tailX},${tailY - 8} ${tailX},${tailY + 8} ${tailX + (b.tailDirection === "left" ? -14 : 14)},${tailY}" fill="${fillColor}" stroke="#000" stroke-width="${strokeW}"/>`;

    return `<g>
      <ellipse cx="${b.x}" cy="${b.y}" rx="${rx}" ry="${ry}" fill="${fillColor}" stroke="#000" stroke-width="${strokeW}"/>
      ${tailPoly}
      ${textBlock}
    </g>`;
  });

  return `<svg width="${pageW}" height="${pageH}" xmlns="http://www.w3.org/2000/svg">${elements.join("\n")}</svg>`;
}

// ─── SVG SFX ──────────────────────────────────────────────────────────────────

function generateSfxSvg(sfxElements: SfxElement[], pageW: number, pageH: number): string {
  const elements = sfxElements.map((s) => {
    const strokeColor = s.style === "electric" ? "#4499ff" : s.style === "soft" ? "#aaaaaa" : "#000000";
    // SPRINT 1.1 — Détection japonais pour fallback Noto Sans JP
    const hasJapanese = /[\u3040-\u30ff\u4e00-\u9faf]/.test(s.text);
    const fontFamily = hasJapanese ? FONTS.sfxJapanese : FONTS.sfx;
    return `<text
      x="${s.x}" y="${s.y}"
      transform="rotate(${s.rotation}, ${s.x}, ${s.y})"
      font-family="${fontFamily}"
      font-size="${s.fontSize}"
      font-weight="900"
      fill="white"
      stroke="${strokeColor}"
      stroke-width="4"
      paint-order="stroke"
      text-anchor="middle"
      letter-spacing="3">
      ${escSvg(s.text.toUpperCase())}
    </text>`;
  });

  return `<svg width="${pageW}" height="${pageH}" xmlns="http://www.w3.org/2000/svg">${elements.join("\n")}</svg>`;
}

function escSvg(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
