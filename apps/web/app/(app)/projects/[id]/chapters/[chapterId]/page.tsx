import { notFound } from "next/navigation";
import { buildChapterReadinessReport } from "@manga-ai-studio/core";
import { prisma } from "@manga-ai-studio/db";
import { getCurrentUser } from "@/lib/auth/get-app-user";
import { NarrativeContractCard } from "@/components/studio/narrative-contract-card";
import { ProductionPlanCard } from "@/components/studio/production-plan-card";
import { readChapterStudioSnapshotFromOutline } from "@/lib/chapter-studio";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  params: Promise<{ id: string; chapterId: string }>;
};

export const dynamic = "force-dynamic";

export default async function ChapterSummaryPage({ params }: Props) {
  const user = await getCurrentUser();
  const { id, chapterId } = await params;
  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, projectId: id, project: { userId: user.id } },
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

  return (
    <div className="space-y-6">
      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="text-base">Studio Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm lg:grid-cols-4">
          <div><p className="text-muted-foreground">Step actif</p><p>{studio.currentStep}</p></div>
          <div><p className="text-muted-foreground">Score de préparation</p><p>{readiness.preparationScore}/100</p></div>
          <div><p className="text-muted-foreground">Images cibles</p><p>{readiness.imageCounts.targetImages}</p></div>
          <div><p className="text-muted-foreground">Images acceptées</p><p>{readiness.imageCounts.acceptedImages}</p></div>
        </CardContent>
      </Card>
      <NarrativeContractCard contract={studio.data.narrativeContract} />
      <ProductionPlanCard plan={studio.data.productionPlan} />
      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="text-base">Warnings de continuité</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {(studio.data.chapterCanon?.continuityNotes ?? []).length > 0
            ? studio.data.chapterCanon?.continuityNotes.map((note) => <p key={note}>- {note}</p>)
            : "Aucune note de continuité pour ce chapitre."}
        </CardContent>
      </Card>
    </div>
  );
}
