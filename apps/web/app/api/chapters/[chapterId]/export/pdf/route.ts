import { exportChapterPdf, type PdfPrintFormat } from "@manga-ai-studio/exports";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";

type Ctx = { params: Promise<{ chapterId: string }> };

const ALLOWED_FORMATS: readonly PdfPrintFormat[] = ["A5", "KDP_6x9", "KDP_8_5x11"] as const;

function parseFormat(raw: string | null): PdfPrintFormat {
  if (!raw) return "A5";
  return (ALLOWED_FORMATS as readonly string[]).includes(raw) ? (raw as PdfPrintFormat) : "A5";
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { chapterId } = await ctx.params;
  const chapter = await prisma.chapter.findFirst({
    where: {
      id: chapterId,
      project: { userId: user.id },
    },
  });

  if (!chapter) return notFound();

  // DIFF-1 : format sélectionnable (A5, KDP 6x9, KDP 8.5x11) + bleed optionnel.
  const url = new URL(req.url);
  const format = parseFormat(url.searchParams.get("format"));
  const includeBleed = url.searchParams.get("bleed") === "1" || url.searchParams.get("bleed") === "true";

  const pdfBytes = await exportChapterPdf(chapterId, { format, includeBleed });
  const suffix = format === "A5" ? "a5" : format === "KDP_6x9" ? "6x9" : "8.5x11";
  return new Response(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="chapter-${chapter.chapterNumber}-${suffix}${includeBleed ? "-bleed" : ""}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

// Également en GET pour faciliter le téléchargement direct depuis le navigateur.
export async function GET(req: Request, ctx: Ctx) {
  return POST(req, ctx);
}
