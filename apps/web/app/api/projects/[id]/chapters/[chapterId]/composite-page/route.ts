import { NextResponse } from "next/server";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { unauthorized, notFound } from "@/lib/api-response";
import { signSupabaseUrlsIfNeeded } from "@/lib/images/sign-supabase-url";
import {
  compositeMangaPage,
  extractSfxElements,
  parseSfxFromMetadata,
  PAGE_LAYOUT_CONFIGS,
  legacyLayoutToTemplate,
  type CompositePanel,
  type InPanelTextBox,
} from "@manga-ai-studio/ai";
import {
  composePanelTextLayout,
  panelTextLayoutBoxesToPagePixels,
} from "@/components/manga/panel/bubble-compositor";

type Ctx = { params: Promise<{ id: string; chapterId: string }> };

const PAGE_W = 1200;
const PAGE_H = 1700;

/**
 * COMP-2 — Génère une page manga composite (panels + bulles + SFX) en JPEG.
 * GET /api/projects/[id]/chapters/[chapterId]/composite-page?sceneId=xxx
 */
export async function GET(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();

  const { id: projectId, chapterId } = await ctx.params;
  const url = new URL(_req.url);
  const sceneId = url.searchParams.get("sceneId");
  if (!sceneId) {
    return NextResponse.json({ error: "sceneId requis" }, { status: 400 });
  }

  const scene = await prisma.chapterScene.findFirst({
    where: {
      id: sceneId,
      chapterId,
      chapter: { projectId, project: { userId: user.id } },
    },
    include: {
      images: {
        where: { status: "completed" },
        orderBy: { panelNumber: "asc" },
      },
    },
  });
  if (!scene) return notFound();

  if (scene.images.length === 0) {
    return NextResponse.json({ error: "Aucune image complétée dans cette scène" }, { status: 404 });
  }

  // Résoudre le template de layout
  const rawTemplate = (scene as { pageLayoutTemplate?: string | null }).pageLayoutTemplate;
  const template = legacyLayoutToTemplate(rawTemplate);
  const layoutConfig = PAGE_LAYOUT_CONFIGS[template] ?? PAGE_LAYOUT_CONFIGS.grid_2x3;
  const areaCount = layoutConfig.areas.length;

  // Calculer les positions des panels en pixels
  const colCount = template === "splash" || template === "cinematic_bar" || template === "vertical_strip"
    ? (template === "splash" ? 1 : 3)
    : 2;
  const rowCount = Math.ceil(areaCount / colCount);
  const colW = Math.floor(PAGE_W / colCount);
  const rowH = Math.floor(PAGE_H / rowCount);

  // P0-3 : signer les URLs Supabase Storage AVANT de les passer au compositor.
  // Le bucket MyManga est privé → sans signature, le fetch retourne 403 et le
  // compositor affiche un placeholder gris (cases noires silencieuses).
  const rawUrls = scene.images.slice(0, areaCount).map((img) => img.persistedUrl ?? img.imageUrl ?? null);
  const signedUrls = await signSupabaseUrlsIfNeeded(rawUrls, 3600);

  const panels: CompositePanel[] = scene.images.slice(0, areaCount).map((img, idx) => {
    const col = idx % colCount;
    const row = Math.floor(idx / colCount);
    const weight = layoutConfig.panelWeights[idx] ?? (1 / areaCount);

    // Pour les layouts avec panel héros (hero = weight > average), agrandir proportionnellement
    const avgWeight = 1 / areaCount;
    const sizeRatio = weight / avgWeight;
    const w = Math.round(Math.min(colW * sizeRatio, PAGE_W));
    const h = Math.round(Math.min(rowH, PAGE_H));

    const signed = signedUrls[idx] ?? img.persistedUrl ?? img.imageUrl ?? "";
    if (!signed) {
      console.warn(`[composite-page] P0-3: image ${img.id} scene=${sceneId} has no resolvable URL (persistedUrl=${img.persistedUrl?.slice(0, 60) ?? "null"} imageUrl=${img.imageUrl?.slice(0, 60) ?? "null"})`);
    }

    return {
      imageUrl: signed,
      x: col * colW,
      y: row * rowH,
      width: w,
      height: h,
    };
  });

  const allDialogueBoxes: InPanelTextBox[] = [];
  const allCaptionBoxes: InPanelTextBox[] = [];
  const allNarrationBoxes: InPanelTextBox[] = [];
  const allSfx: ReturnType<typeof extractSfxElements> = [];

  for (let idx = 0; idx < scene.images.length && idx < areaCount; idx++) {
    const img = scene.images[idx];
    const meta = img.metadata as Record<string, unknown> | null;
    const panel = panels[idx];
    if (!meta || !panel) continue;

    const rawDialogue = meta.dialogue;
    const rawDialogues = Array.isArray(meta.dialogues) ? meta.dialogues as Array<{ speaker: string; text: string }> : null;
    const dialogues: Array<{ speaker: string; text: string }> = rawDialogues
      ?? (rawDialogue && typeof rawDialogue === "object" && !Array.isArray(rawDialogue)
        ? [rawDialogue as { speaker: string; text: string }]
        : []);

    const narration =
      typeof meta.narration === "string" && meta.narration.trim().length > 0
        ? meta.narration
        : null;

    const layout = composePanelTextLayout({
      panelId: img.id,
      dialogues,
      narration,
      sfx: null,
      panelWidth: panel.width,
      panelHeight: panel.height,
      maxBubbles: 8,
    });

    allDialogueBoxes.push(
      ...panelTextLayoutBoxesToPagePixels(layout.dialogueBoxes, panel.x, panel.y, panel.width, panel.height),
    );
    allCaptionBoxes.push(
      ...panelTextLayoutBoxesToPagePixels(layout.captionBoxes, panel.x, panel.y, panel.width, panel.height),
    );
    allNarrationBoxes.push(
      ...panelTextLayoutBoxesToPagePixels(layout.narrationBoxes, panel.x, panel.y, panel.width, panel.height),
    );

    const sfxTexts = parseSfxFromMetadata(meta.sfx);
    if (sfxTexts.length > 0) {
      const sfxElements = extractSfxElements(sfxTexts, panel.x, panel.y, panel.width, panel.height);
      allSfx.push(...sfxElements);
    }
  }

  try {
    const pageBuffer = await compositeMangaPage({
      pageWidth: PAGE_W,
      pageHeight: PAGE_H,
      backgroundColor: "#FFFFFF",
      panels,
      dialogueBoxes: allDialogueBoxes.length > 0 ? allDialogueBoxes : undefined,
      captionBoxes: allCaptionBoxes.length > 0 ? allCaptionBoxes : undefined,
      narrationBoxes: allNarrationBoxes.length > 0 ? allNarrationBoxes : undefined,
      sfxElements: allSfx,
      gutterWidth: 3,
      gutterColor: "#000000",
      isSplashPage: (scene as { isSplashPage?: boolean }).isSplashPage ?? false,
    });

    return new NextResponse(pageBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
        "X-Scene-Id": sceneId,
        "X-Layout-Template": template,
        "X-Panel-Count": String(panels.length),
      },
    });
  } catch (err) {
    console.error(`[composite-page] Error compositing sceneId=${sceneId}:`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erreur lors de l'assemblage de la page" }, { status: 500 });
  }
}
