import { notFound } from "next/navigation";
import { buildChapterReadinessReport } from "@manga-ai-studio/core";
import { prisma } from "@manga-ai-studio/db";
import { getCurrentUser } from "@/lib/auth/get-app-user";
import { ChapterGenerateLauncher } from "@/components/studio/chapter-generate-launcher";
import { readChapterStudioSnapshotFromOutline } from "@/lib/chapter-studio";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  params: Promise<{ id: string; chapterId: string }>;
};

export const dynamic = "force-dynamic";

export default async function ChapterGeneratePage({ params }: Props) {
  const user = await getCurrentUser();
  const { id, chapterId } = await params;
  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, projectId: id, project: { userId: user.id } },
    include: {
      scenes: {
        include: {
          images: true,
        },
      },
    },
  });
  if (!chapter) notFound();

  const studio = readChapterStudioSnapshotFromOutline({
    outline: chapter.outline,
    chapterNumber: chapter.chapterNumber,
    chapterTitle: chapter.title,
    chapterSummary: chapter.summary,
    cliffhanger: chapter.cliffhanger,
    userIntent: chapter.userIntent,
    studioStatus: chapter.studioStatus,
    studioCurrentStep: chapter.studioCurrentStep,
    studioUpdatedAt: chapter.studioUpdatedAt,
    studioAutosaveVersion: chapter.studioAutosaveVersion,
    minimumImages: chapter.minimumImages,
    generatedImages: chapter.generatedImages,
    acceptedImages: chapter.acceptedImages,
    rejectedImages: chapter.rejectedImages,
    missingImages: chapter.missingImages,
    criticalPanelsCount: chapter.criticalPanelsCount,
    criticalPanelsBlocked: chapter.criticalPanelsBlocked,
    criticalPanelsMissingQa: chapter.criticalPanelsMissingQa,
    reviewBlockedReason: chapter.reviewBlockedReason,
  });
  const readiness = studio.data.readinessReport ?? buildChapterReadinessReport(studio);
  const allImages = chapter.scenes.flatMap((scene) => scene.images);

  return (
    <div className="space-y-6">
      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="text-base">Readiness Gate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">Score: {readiness.preparationScore}/100</p>
          <ul className="space-y-1 text-muted-foreground">
            {readiness.blockingIssues.length > 0
              ? readiness.blockingIssues.map((issue) => <li key={issue}>- {issue}</li>)
              : <li>- Aucun blocant, prêt pour lancement.</li>}
          </ul>
        </CardContent>
      </Card>
      <ChapterGenerateLauncher
        projectId={id}
        chapterId={chapterId}
        initialStats={{
          total: allImages.length,
          completed: allImages.filter((image) => image.status === "completed").length,
          failed: allImages.filter((image) => image.status === "failed" || image.status === "blocked").length,
          pending: allImages.filter((image) => image.status === "pending" || image.status === "planned").length,
        }}
      />
    </div>
  );
}
