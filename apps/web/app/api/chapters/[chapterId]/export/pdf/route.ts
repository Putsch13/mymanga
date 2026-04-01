import { exportChapterPdfStub } from "@manga-ai-studio/exports";
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

  const payload = await exportChapterPdfStub(chapterId);
  return new Response(Buffer.from(payload), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="chapter-${chapter.chapterNumber}.pdf"`,
    },
  });
}
