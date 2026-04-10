import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-app-user";
import { prisma } from "@manga-ai-studio/db";
import { ChapterReviewBoard } from "@/components/studio/chapter-review-board";

type Props = {
  params: Promise<{ id: string; chapterId: string }>;
};

export const dynamic = "force-dynamic";

export default async function ChapterReviewPage({ params }: Props) {
  const user = await getCurrentUser();
  const { id, chapterId } = await params;
  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, projectId: id, project: { userId: user.id } },
    include: { project: true },
  });

  if (!chapter) notFound();

  return (
    <ChapterReviewBoard
      projectId={id}
      chapterId={chapterId}
      chapterTitle={chapter.title ?? `Chapitre ${chapter.chapterNumber}`}
      projectTitle={chapter.project.title}
    />
  );
}
