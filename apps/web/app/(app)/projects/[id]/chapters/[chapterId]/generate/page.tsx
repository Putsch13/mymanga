import { notFound, permanentRedirect } from "next/navigation";
import { prisma } from "@manga-ai-studio/db";
import { getCurrentUser } from "@/lib/auth/get-app-user";

type Props = { params: Promise<{ id: string; chapterId: string }> };

export const dynamic = "force-dynamic";

/** P1.7 — La génération se pilote depuis le studio (`…/edit`), pas une page séparée. */
export default async function ChapterGenerateRedirectPage({ params }: Props) {
  const user = await getCurrentUser();
  const { id, chapterId } = await params;
  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, projectId: id, project: { userId: user.id } },
    select: { id: true },
  });
  if (!chapter) {
    notFound();
  }
  permanentRedirect(`/projects/${id}/chapters/${chapterId}/edit`);
}
