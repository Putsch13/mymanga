import { exportChapterPdf } from "@manga-ai-studio/exports";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";

type Ctx = { params: Promise<{ chapterId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
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

  // FIX-3 : vrai export PDF via pdf-lib (au lieu du stub texte)
  const pdfBytes = await exportChapterPdf(chapterId);
  return new Response(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="chapter-${chapter.chapterNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
