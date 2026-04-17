/**
 * COMP-1 — Page Compositor serveur avec Sharp.
 * Assemble les panels générés + bulles + SFX en une vraie image de page manga.
 * Utilisé pour l'export PDF et le cache de pages.
 */

import sharp from "sharp";

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
  bubbles?: DialogueBubble[];
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

  // SVG pour les bulles de dialogue
  const bubblesOverlay = input.bubbles && input.bubbles.length > 0
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
    const textBlock = lines.map((line, i) => {
      const y = b.y - ((lines.length - 1) * lineH) / 2 + i * lineH;
      return `<text x="${b.x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="'Comic Sans MS', 'Noto Sans JP', sans-serif" font-size="${fontSize}" font-weight="${fontWeight}" fill="#000">${escSvg(line)}</text>`;
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
    return `<text
      x="${s.x}" y="${s.y}"
      transform="rotate(${s.rotation}, ${s.x}, ${s.y})"
      font-family="'Impact', 'Arial Black', 'Noto Sans JP', sans-serif"
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
