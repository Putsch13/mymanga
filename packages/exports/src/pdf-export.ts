/**
 * PDF-1 — Export PDF manga réel avec pdf-lib.
 * Génère un PDF A5 manga (148×210mm) avec les pages composites.
 * Remplace exportChapterPdfStub().
 */

import { PDFDocument, rgb, StandardFonts, PageSizes } from "pdf-lib";
import { prisma } from "@manga-ai-studio/db";
import { compositeMangaPage, PAGE_LAYOUT_CONFIGS, legacyLayoutToTemplate, type CompositePanel } from "@manga-ai-studio/ai";

// Dimensions PDF manga standard (A5 en points)
// 1 inch = 72 points ; A5 = 148×210mm = 5.83×8.27 inches
const PDF_W = 420; // ~148mm
const PDF_H = 595; // ~210mm

// Dimensions pixel pour le compositeur
const COMP_W = 1200;
const COMP_H = 1700;

/**
 * Exporte un chapitre en PDF manga avec les vraies images composites.
 */
export async function exportChapterPdf(chapterId: string): Promise<Uint8Array> {
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
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // ─── Page de couverture ───────────────────────────────────────────────────

  const coverPage = pdfDoc.addPage([PDF_W, PDF_H]);
  coverPage.drawRectangle({ x: 0, y: 0, width: PDF_W, height: PDF_H, color: rgb(0.05, 0.05, 0.08) });

  // Trouver la première image complétée pour la cover
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
      // Pas bloquant si l'image de cover ne charge pas
    }
  }

  // Titre du projet
  const projectTitle = chapter.project.title ?? "Manga";
  const titleFontSize = Math.min(22, Math.max(10, 22 - Math.max(0, projectTitle.length - 20) * 0.4));
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
    y: PDF_H * 0.2 - 28,
    font,
    size: 13,
    color: rgb(0.7, 0.7, 0.9),
  });

  coverPage.drawText("MANGA AI STUDIO", {
    x: 30,
    y: 20,
    font,
    size: 8,
    color: rgb(0.4, 0.4, 0.4),
  });

  // ─── Pages de contenu ─────────────────────────────────────────────────────

  for (const scene of chapter.scenes) {
    if (scene.images.length === 0) continue;

    // Résoudre le layout
    const rawTemplate = (scene as { pageLayoutTemplate?: string | null }).pageLayoutTemplate;
    const template = legacyLayoutToTemplate(rawTemplate);
    const layoutConfig = PAGE_LAYOUT_CONFIGS[template] ?? PAGE_LAYOUT_CONFIGS.grid_2x3;
    const areaCount = Math.min(layoutConfig.areas.length, scene.images.length);

    // Calculer les positions des panels
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
        gutterWidth: 3,
        gutterColor: "#000000",
      });
    } catch (err) {
      console.warn(`[pdf-export] compositeMangaPage failed for scene ${scene.id}:`, err instanceof Error ? err.message : err);
      continue;
    }

    // Intégrer l'image dans le PDF
    try {
      const pdfImg = await pdfDoc.embedJpg(pageBuffer);
      const contentPage = pdfDoc.addPage([PDF_W, PDF_H]);

      // Fond blanc
      contentPage.drawRectangle({ x: 0, y: 0, width: PDF_W, height: PDF_H, color: rgb(1, 1, 1) });

      // Image pleine page avec marges de 4pt
      const margin = 4;
      contentPage.drawImage(pdfImg, {
        x: margin,
        y: margin,
        width: PDF_W - margin * 2,
        height: PDF_H - margin * 2,
      });

      // Numéro de page en bas
      contentPage.drawText(`${scene.sceneNumber}`, {
        x: PDF_W - 20,
        y: 6,
        font,
        size: 7,
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
    const cliffText = chapter.cliffhanger.length > 120 ? chapter.cliffhanger.slice(0, 117) + "…" : chapter.cliffhanger;
    endPage.drawText("À suivre…", {
      x: 30,
      y: PDF_H / 2 + 30,
      font: fontBold,
      size: 16,
      color: rgb(1, 1, 1),
    });
    endPage.drawText(cliffText, {
      x: 30,
      y: PDF_H / 2 - 10,
      font,
      size: 9,
      color: rgb(0.75, 0.75, 0.85),
      maxWidth: PDF_W - 60,
      lineHeight: 14,
    });
  } else {
    endPage.drawText("Fin du chapitre", {
      x: PDF_W / 2 - 50,
      y: PDF_H / 2,
      font: fontBold,
      size: 14,
      color: rgb(0.8, 0.8, 0.8),
    });
  }

  endPage.drawText(`Généré par Manga AI Studio`, {
    x: 30,
    y: 18,
    font,
    size: 7,
    color: rgb(0.35, 0.35, 0.35),
  });

  return pdfDoc.save();
}
