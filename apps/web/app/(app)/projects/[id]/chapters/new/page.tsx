import { redirect } from "next/navigation";
import { prisma, type Prisma } from "@manga-ai-studio/db";
import { getCurrentUser } from "@/lib/auth/get-app-user";
import { patchChapterStudioSnapshot } from "@/lib/chapter-studio";

type Props = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export default async function NewChapterPage({ params }: Props) {
  const user = await getCurrentUser();
  const { id: projectId } = await params;
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
    include: { chapters: { orderBy: { chapterNumber: "desc" }, take: 1 } },
  });

  if (!project) {
    redirect("/dashboard");
  }

  const nextChapterNumber = (project.chapters[0]?.chapterNumber ?? 0) + 1;
  const studio = patchChapterStudioSnapshot(
    {},
    {
      intent: {
        chapterNumber: nextChapterNumber,
        workingTitle: `Chapitre ${nextChapterNumber}`,
        shortPitch: "",
        arcPosition: "",
        emotionalGoal: "",
        mainConflict: "",
      },
    },
    {
      chapterNumber: nextChapterNumber,
      chapterTitle: `Chapitre ${nextChapterNumber}`,
      currentStep: "intent",
      transitionReason: "create_chapter_draft",
    },
  );

  const chapter = await prisma.chapter.create({
    data: {
      projectId,
      chapterNumber: nextChapterNumber,
      title: `Chapitre ${nextChapterNumber}`,
      status: "draft",
      outline: ({
        studio,
      } as unknown) as Prisma.InputJsonValue,
    },
  });

  redirect(`/projects/${projectId}/chapters/${chapter.id}/edit`);
}
