/**
 * PDF-1 + DIFF-1 — Export PDF manga print-ready (pdf-lib).
 *
 * Supporte plusieurs formats standards :
 *   - A5 : 148×210mm (lecture numérique / manga JP classique)
 *   - KDP_6x9 : 6"×9" (Amazon KDP manga/BD NA, le plus courant)
 *   - KDP_8_5x11 : 8.5"×11" (US Letter / KDP grand format, style comic book)
 *
 * Le composite interne est rendu à 300 DPI pour garantir une qualité print
 * (Amazon KDP exige un minimum de 300 PPI sur les zones image). Un bleed
 * optionnel de 0.125" peut être ajouté pour les couvertures full-bleed.
 */

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { prisma } from "@manga-ai-studio/db";
import { compositeMangaPage, PAGE_LAYOUT_CONFIGS, legacyLayoutToTemplate, type CompositePanel } from "@manga-ai-studio/ai";

const DPI = 300;
const POINTS_PER_INCH = 72;

export type PdfPrintFormat = "A5" | "KDP_6x9" | "KDP_8_5x11";

interface PrintFormatSpec {
  /** Largeur page en inches (hors bleed). */
  widthIn: number;
  /** Hauteur page en inches (hors bleed). */
  heightIn: number;
  label: string;
}

const FORMAT_SPECS: Record<PdfPrintFormat, PrintFormatSpec> = {
  // A5 = 148×210 mm ≈ 5.827 × 8.268 in
  A5: { widthIn: 5.827, heightIn: 8.268, label: "A5 148×210mm" },
  KDP_6x9: { widthIn: 6, heightIn: 9, label: "KDP 6×9 inch" },
  KDP_8_5x11: { widthIn: 8.5, heightIn: 11, label: "KDP 8.5×11 inch (US Letter)" },
};

export interface ExportChapterPdfOptions {
  /** Format print. Défaut : A5 (rétrocompat). */
  format?: PdfPrintFormat;
  /**
   * Ajoute un bleed de 0.125" sur les quatre bords (standard KDP full-bleed).
   * Désactivé par défaut pour rester compatible avec les templates "no-bleed".
   */
  includeBleed?: boolean;
}

function resolveDimensions(spec: PrintFormatSpec, includeBleed: boolean) {
  const bleedIn = includeBleed ? 0.125 : 0;
  const pageWIn = spec.widthIn + bleedIn * 2;
  const pageHIn = spec.heightIn + bleedIn * 2;
  return {
    pdfWidthPt: pageWIn * POINTS_PER_INCH,
    pdfHeightPt: pageHIn * POINTS_PER_INCH,
    compositeWidthPx: Math.round(pageWIn * DPI),
    compositeHeightPx: Math.round(pageHIn * DPI),
    bleedPt: bleedIn * POINTS_PER_INCH,
  };
}

/**
 * Exporte un chapitre en PDF print-ready avec les vraies images composites.
 *
 * - Rend chaque page composite à 300 DPI pour couvrir les exigences KDP.
 * - Applique des marges internes raisonnables (environ 0.25") pour éviter
 *   que les panels ne tombent trop près du bord de coupe.
 */
export async function exportChapterPdf(
  chapterId: string,
  opts: ExportChapterPdfOptions = {},
): Promise<Uint8Array> {
  const format = opts.format ?? "A5";
  const includeBleed = opts.includeBleed ?? false;
  const spec = FORMAT_SPECS[format];
  const { pdfWidthPt: PDF_W, pdfHeightPt: PDF_H, compositeWidthPx: COMP_W, compositeHeightPx: COMP_H, bleedPt } =
    resolveDimensions(spec, includeBleed);

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: {
      project: true,
      scenes: {
        include: {
          images: {
            where: { status: "completed" },
            orderBy: { panelNumber: "asc" },
          },
        },
        orderBy: { sceneNumber: "asc" },
      },
    },
  });
  if (!chapter) throw new Error("chapter_not_found");

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`${chapter.project.title} - ${chapter.title ?? `Chapitre ${chapter.chapterNumber}`}`);
  pdfDoc.setProducer("Manga AI Studio");
  pdfDoc.setCreator(`Manga AI Studio (${spec.label} @ ${DPI}dpi)`);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // ─── Page de couverture ───────────────────────────────────────────────────

  const coverPage = pdfDoc.addPage([PDF_W, PDF_H]);
  coverPage.drawRectangle({ x: 0, y: 0, width: PDF_W, height: PDF_H, color: rgb(0.05, 0.05, 0.08) });

  const firstImage = chapter.scenes[0]?.images[0];
  if (firstImage?.persistedUrl ?? firstImage?.imageUrl) {
    try {
      const imgUrl = firstImage.persistedUrl ?? firstImage.imageUrl ?? "";
      const imgResp = await fetch(imgUrl, { signal: AbortSignal.timeout(8_000) });
      if (imgResp.ok) {
        const imgBytes = await imgResp.arrayBuffer();
        const isJpeg = imgUrl.toLowerCase().endsWith(".jpg") || imgUrl.toLowerCase().endsWith(".jpeg") || imgUrl.includes("jpeg");
        const pdfImg = isJpeg
          ? await pdfDoc.embedJpg(imgBytes)
          : await pdfDoc.embedPng(imgBytes);
        const { width: iw, height: ih } = pdfImg.scale(1);
        const scale = Math.min(PDF_W / iw, (PDF_H * 0.65) / ih);
        coverPage.drawImage(pdfImg, {
          x: (PDF_W - iw * scale) / 2,
          y: PDF_H * 0.25,
          width: iw * scale,
          height: ih * scale,
        });
      }
    } catch {
      // Non bloquant
    }
  }

  const projectTitle = chapter.project.title ?? "Manga";
  const titleFontSize = Math.min(PDF_W * 0.06, Math.max(14, PDF_W * 0.06 - Math.max(0, projectTitle.length - 20) * 0.4));
  coverPage.drawText(projectTitle, {
    x: 30,
    y: PDF_H * 0.2,
    font: fontBold,
    size: titleFontSize,
    color: rgb(1, 1, 1),
  });

  const chapterLabel = chapter.title ?? `Chapitre ${chapter.chapterNumber}`;
  coverPage.drawText(chapterLabel, {
    x: 30,
    y: PDF_H * 0.2 - titleFontSize * 1.4,
    font,
    size: Math.max(10, titleFontSize * 0.6),
    color: rgb(0.7, 0.7, 0.9),
  });

  coverPage.drawText(`MANGA AI STUDIO · ${spec.label} · ${DPI} DPI`, {
    x: 30,
    y: 24,
    font,
    size: 8,
    color: rgb(0.4, 0.4, 0.4),
  });

  // ─── Pages de contenu ─────────────────────────────────────────────────────

  // Marge safe interne (sans compter le bleed). KDP recommande 0.25" de safe area.
  const safeMarginPt = 0.25 * POINTS_PER_INCH;

  for (const scene of chapter.scenes) {
    if (scene.images.length === 0) continue;

    const rawTemplate = (scene as { pageLayoutTemplate?: string | null }).pageLayoutTemplate;
    const template = legacyLayoutToTemplate(rawTemplate);
    const layoutConfig = PAGE_LAYOUT_CONFIGS[template] ?? PAGE_LAYOUT_CONFIGS.grid_2x3;
    const areaCount = Math.min(layoutConfig.areas.length, scene.images.length);

    const colCount = template === "splash" ? 1 : template === "cinematic_bar" || template === "vertical_strip" ? 3 : 2;
    const rowCount = Math.ceil(areaCount / colCount);
    const colW = Math.floor(COMP_W / colCount);
    const rowH = Math.floor(COMP_H / rowCount);

    const panels: CompositePanel[] = scene.images.slice(0, areaCount).map((img, idx) => ({
      imageUrl: img.persistedUrl ?? img.imageUrl ?? "",
      x: (idx % colCount) * colW,
      y: Math.floor(idx / colCount) * rowH,
      width: colW,
      height: rowH,
    }));

    let pageBuffer: Buffer;
    try {
      pageBuffer = await compositeMangaPage({
        pageWidth: COMP_W,
        pageHeight: COMP_H,
        backgroundColor: "#FFFFFF",
        panels,
        gutterWidth: Math.max(3, Math.round(DPI / 100)), // gutter proportionnel au DPI
        gutterColor: "#000000",
      });
    } catch (err) {
      console.warn(`[pdf-export] compositeMangaPage failed for scene ${scene.id}:`, err instanceof Error ? err.message : err);
      continue;
    }

    try {
      const pdfImg = await pdfDoc.embedJpg(pageBuffer);
      const contentPage = pdfDoc.addPage([PDF_W, PDF_H]);
      contentPage.drawRectangle({ x: 0, y: 0, width: PDF_W, height: PDF_H, color: rgb(1, 1, 1) });

      // En mode bleed, l'image remplit toute la feuille (jusqu'au bord de coupe).
      // Sans bleed, on laisse une marge de 4pt pour éviter les artefacts de coupe.
      const outerMargin = includeBleed ? 0 : 4;
      contentPage.drawImage(pdfImg, {
        x: outerMargin,
        y: outerMargin,
        width: PDF_W - outerMargin * 2,
        height: PDF_H - outerMargin * 2,
      });

      // Numéro de page en bas, toujours dans la safe area (jamais dans le bleed).
      contentPage.drawText(`${scene.sceneNumber}`, {
        x: PDF_W - bleedPt - safeMarginPt,
        y: bleedPt + 8,
        font,
        size: 8,
        color: rgb(0.5, 0.5, 0.5),
      });
    } catch (err) {
      console.warn(`[pdf-export] embed failed for scene ${scene.id}:`, err instanceof Error ? err.message : err);
    }
  }

  // ─── Page de fin ─────────────────────────────────────────────────────────

  const endPage = pdfDoc.addPage([PDF_W, PDF_H]);
  endPage.drawRectangle({ x: 0, y: 0, width: PDF_W, height: PDF_H, color: rgb(0.05, 0.05, 0.08) });

  if (chapter.cliffhanger) {
    const cliffText = chapter.cliffhanger.length > 180 ? chapter.cliffhanger.slice(0, 177) + "…" : chapter.cliffhanger;
    endPage.drawText("À suivre…", {
      x: 30,
      y: PDF_H / 2 + 30,
      font: fontBold,
      size: Math.max(14, PDF_W * 0.04),
      color: rgb(1, 1, 1),
    });
    endPage.drawText(cliffText, {
      x: 30,
      y: PDF_H / 2 - 10,
      font,
      size: Math.max(9, PDF_W * 0.02),
      color: rgb(0.75, 0.75, 0.85),
      maxWidth: PDF_W - 60,
      lineHeight: Math.max(14, PDF_W * 0.028),
    });
  } else {
    endPage.drawText("Fin du chapitre", {
      x: PDF_W / 2 - 60,
      y: PDF_H / 2,
      font: fontBold,
      size: Math.max(14, PDF_W * 0.035),
      color: rgb(0.8, 0.8, 0.8),
    });
  }

  endPage.drawText(`Généré par Manga AI Studio · ${spec.label} · ${DPI} DPI`, {
    x: 30,
    y: 18,
    font,
    size: 7,
    color: rgb(0.35, 0.35, 0.35),
  });

  return pdfDoc.save();
}
