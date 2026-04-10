import Link from "next/link";
import { notFound } from "next/navigation";
import { BookMarked, BookOpen, Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/get-app-user";
import { prisma } from "@manga-ai-studio/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildChapterStudioListItem } from "@/lib/chapter-studio";
import { ChapterStatusBadge } from "@/components/studio/chapter-status-badge";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function ProjectChaptersPage({ params }: Props) {
  const user = await getCurrentUser();
  const { id: projectId } = await params;
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
    include: { chapters: { orderBy: { chapterNumber: "asc" } } },
  });
  if (!project) notFound();

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href={`/projects/${projectId}`} className="text-sm text-muted-foreground hover:text-foreground">
            ← Projet
          </Link>
          <h1 className="mt-2 text-3xl font-semibold">Chapitres</h1>
          <p className="text-muted-foreground mt-1 text-sm">Lis comme un manga : feuilletage, puis suite à la fin.</p>
        </div>
        <Button asChild variant="secondary">
          <Link href={`/projects/${projectId}/chapters/new`}>Nouveau chapitre</Link>
        </Button>
      </div>
      <div className="grid gap-4">
        {project.chapters.length === 0 ? (
          <Card className="border-dashed border-border/60 bg-card/30">
            <CardHeader>
              <CardTitle className="text-base">Aucun chapitre</CardTitle>
              <CardDescription>Crée un brouillon depuis l’atelier chapitre.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          project.chapters.map((c) => {
            const studio = buildChapterStudioListItem({
              id: c.id,
              chapterNumber: c.chapterNumber,
              title: c.title,
              status: c.status,
              summary: c.summary,
              cliffhanger: c.cliffhanger,
              outline: c.outline,
              studioStatus: c.studioStatus,
              studioCurrentStep: c.studioCurrentStep,
              studioUpdatedAt: c.studioUpdatedAt,
              studioAutosaveVersion: c.studioAutosaveVersion,
              minimumImages: c.minimumImages,
              generatedImages: c.generatedImages,
              acceptedImages: c.acceptedImages,
              rejectedImages: c.rejectedImages,
              missingImages: c.missingImages,
              criticalPanelsCount: c.criticalPanelsCount,
              criticalPanelsBlocked: c.criticalPanelsBlocked,
              criticalPanelsMissingQa: c.criticalPanelsMissingQa,
              reviewBlockedReason: c.reviewBlockedReason,
            });
            return (
            <Card key={c.id} className="border-border/60 bg-card/40">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <BookMarked className="h-5 w-5 text-accent" />
                    {c.title ?? `Chapitre ${c.chapterNumber}`}
                  </CardTitle>
                  <CardDescription className="line-clamp-2">{c.summary ?? "Pas encore de résumé."}</CardDescription>
                  <div className="mt-2">
                    <ChapterStatusBadge status={studio.studioStatus} />
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button asChild size="sm" variant="outline" className="gap-1">
                    <Link href={`/projects/${projectId}/chapters/${c.id}/edit`}>
                      <Sparkles className="h-4 w-4" />
                      Studio
                    </Link>
                  </Button>
                  <Button asChild size="sm" className="gap-1">
                    <Link href={`/projects/${projectId}/chapters/${c.id}/read`}>
                    <BookOpen className="h-4 w-4" />
                    Lire
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Statut runtime : {c.status} · Cible {studio.readinessReport.imageCounts.targetImages} images · Acceptées {studio.readinessReport.imageCounts.acceptedImages}
                {c.cliffhanger ? ` · Cliffhanger : ${c.cliffhanger.slice(0, 80)}…` : ""}
              </CardContent>
            </Card>
          )})
        )}
      </div>
    </div>
  );
}
